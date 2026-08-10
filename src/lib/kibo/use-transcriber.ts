import * as React from "react";
import { encodeWav, rms, toMono16k, TARGET_RATE } from "./wav";
import { matchesLanguage } from "./lang-guard";
import type { AudioSource, CaptureMode, ConvLang } from "./types";

type Speaker = "user" | "other";

type Options = {
  language: string;
  audioSource: AudioSource;
  micDeviceId?: string;
  /** "push" = hold a button to record one turn; "continuous" = always listening. */
  mode: CaptureMode;
  /** Who the microphone is attributed to in continuous mode. */
  activeSpeaker: Speaker;
  onInterim: (text: string, speaker: Speaker) => void;
  onFinal: (text: string, speaker: Speaker) => void;
  onError: (message: string) => void;
};

const SILENCE_RMS = 0.012;
const SILENCE_MS = 700;
const MIN_SPEECH_MS = 600;
/** A held button may capture a very short word — keep almost everything. */
const MIN_PUSH_SPEECH_MS = 150;
const MAX_SEGMENT_MS = 12000;
/** How often an unfinished segment is re-transcribed to show live partials. */
const PARTIAL_EVERY_MS = 1600;
const PARTIAL_MIN_SPEECH_MS = 900;

/** Why a segment was closed — drives the diagnostics advice. */
export type FlushReason = "pause" | "max" | "manual" | "discarded";

export type SegmentStat = {
  id: number;
  at: number;
  speaker: Speaker;
  speechMs: number;
  silenceMs: number;
  reason: FlushReason;
  /** False when the buffer was dropped for being too short to transcribe. */
  sent: boolean;
};

export type Diagnostics = {
  /** Instantaneous RMS of the loudest pipe (0..1-ish, unscaled). */
  rms: number;
  voiced: boolean;
  speechMs: number;
  silenceMs: number;
  /** Milliseconds of silence still needed before an auto-cut fires. */
  silenceToCut: number;
  silenceThreshold: number;
  silenceWindowMs: number;
  minSpeechMs: number;
  maxSegmentMs: number;
  sampleRate: number;
  segments: SegmentStat[];
};

const EMPTY_DIAG: Diagnostics = {
  rms: 0,
  voiced: false,
  speechMs: 0,
  silenceMs: 0,
  silenceToCut: SILENCE_MS,
  silenceThreshold: SILENCE_RMS,
  silenceWindowMs: SILENCE_MS,
  minSpeechMs: MIN_SPEECH_MS,
  maxSegmentMs: MAX_SEGMENT_MS,
  sampleRate: 48000,
  segments: [],
};

type Pipeline = {
  speaker: Speaker;
  /** True when this pipe cannot know the speaker from its source alone. */
  ambiguous: boolean;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  node: ScriptProcessorNode;
  chunks: Float32Array[];
  speechMs: number;
  silenceMs: number;
  partialAt: number;
  partialBusy: boolean;
  segment: number;
  rms: number;
};

export function useTranscriber({
  language,
  audioSource,
  micDeviceId,
  mode,
  activeSpeaker,
  onInterim,
  onFinal,
  onError,
}: Options) {
  const [recording, setRecording] = React.useState(false);
  const [level, setLevel] = React.useState(0);
  const [transcribing, setTranscribing] = React.useState(false);
  const [holding, setHolding] = React.useState<Speaker | null>(null);

  const ctxRef = React.useRef<AudioContext | null>(null);
  /** Silent sink: ScriptProcessor only ticks when connected, but routing the
   *  microphone to the speakers would cause feedback/echo on phones. */
  const sinkRef = React.useRef<GainNode | null>(null);
  const pipesRef = React.useRef<Pipeline[]>([]);

  const pausedRef = React.useRef(false);
  const userPausedRef = React.useRef(false);
  const inFlightRef = React.useRef(0);
  /** Speaker the microphone is attributed to right now. */
  const speakerRef = React.useRef<Speaker>(activeSpeaker);
  const modeRef = React.useRef<CaptureMode>(mode);
  modeRef.current = mode;
  if (mode === "continuous") speakerRef.current = activeSpeaker;

  const cbRef = React.useRef({ onInterim, onFinal, onError, language });
  cbRef.current = { onInterim, onFinal, onError, language };

  // Diagnostics are sampled on a timer instead of on every audio callback, so
  // the panel stays live without re-rendering the workbench ~10x per second.
  const [diagnostics, setDiagnostics] = React.useState<Diagnostics>(EMPTY_DIAG);
  const segmentsRef = React.useRef<SegmentStat[]>([]);
  const segmentSeq = React.useRef(0);

  const recordSegment = React.useCallback((stat: Omit<SegmentStat, "id" | "at">) => {
    segmentSeq.current += 1;
    segmentsRef.current = [
      { ...stat, id: segmentSeq.current, at: Date.now() },
      ...segmentsRef.current,
    ].slice(0, 8);
  }, []);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      const pipes = pipesRef.current;
      if (pipes.length === 0) {
        setDiagnostics((prev) =>
          prev.rms === 0 && prev.speechMs === 0 && prev.segments === segmentsRef.current
            ? prev
            : { ...EMPTY_DIAG, segments: segmentsRef.current },
        );
        return;
      }
      // The pipe with the most speech in its buffer is the interesting one.
      const pipe = pipes.reduce((a, b) => (b.speechMs >= a.speechMs ? b : a));
      const rate = ctxRef.current?.sampleRate ?? 48000;
      setDiagnostics({
        rms: pipe.rms,
        voiced: pipe.rms > SILENCE_RMS,
        speechMs: pipe.speechMs,
        silenceMs: pipe.silenceMs,
        silenceToCut: Math.max(0, SILENCE_MS - pipe.silenceMs),
        silenceThreshold: SILENCE_RMS,
        silenceWindowMs: SILENCE_MS,
        minSpeechMs: modeRef.current === "push" ? MIN_PUSH_SPEECH_MS : MIN_SPEECH_MS,
        maxSegmentMs: MAX_SEGMENT_MS,
        sampleRate: rate,
        segments: segmentsRef.current,
      });
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  /** Source routing decides the speaker; a lone microphone follows the buttons. */
  const speakerOf = React.useCallback(
    (pipe: Pipeline): Speaker => (pipe.ambiguous ? speakerRef.current : pipe.speaker),
    [],
  );

  /**
   * Transcribe one buffer. `partial` requests only update the live bubble and
   * never commit a turn, so the segment can keep growing while it streams.
   */
  const sendSegment = React.useCallback(
    async (
      chunks: Float32Array[],
      sampleRate: number,
      speaker: Speaker,
      partial = false,
    ): Promise<void> => {
      const blob = encodeWav(chunks, sampleRate);
      if (blob.size < 4096) return;

      const form = new FormData();
      form.append("file", blob, "recording.wav");
      form.append("language", cbRef.current.language);

      if (!partial) {
        inFlightRef.current += 1;
        setTranscribing(true);
      }
      try {
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail || `Transcription failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const event = JSON.parse(payload) as {
                type?: string;
                delta?: string;
                text?: string;
              };
              if (event.type === "transcript.text.delta" && event.delta) {
                text += event.delta;
                if (matchesLanguage(text, cbRef.current.language as ConvLang)) {
                  cbRef.current.onInterim(text, speaker);
                }
              } else if (event.type === "transcript.text.reset") {
                // The recognizer rewrote the sentence — replace, don't append.
                text = event.text ?? text;
                if (matchesLanguage(text, cbRef.current.language as ConvLang)) {
                  cbRef.current.onInterim(text, speaker);
                }
              } else if (event.type === "transcript.text.done") {
                text = event.text ?? text;
              }
            } catch {
              /* ignore malformed keepalive lines */
            }
          }
        }

        const clean = text.trim();
        // Anything that is not the chosen conversation language is a
        // hallucination — drop it instead of polluting the transcript.
        const ok = clean ? matchesLanguage(clean, cbRef.current.language as ConvLang) : false;

        if (partial) {
          if (ok) cbRef.current.onInterim(clean, speaker);
          return;
        }
        cbRef.current.onInterim("", speaker);
        if (ok) cbRef.current.onFinal(clean, speaker);
      } catch (error) {
        if (partial) return; // a dropped partial is harmless; the final still runs
        cbRef.current.onInterim("", speaker);
        cbRef.current.onError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!partial) {
          inFlightRef.current -= 1;
          if (inFlightRef.current <= 0) setTranscribing(false);
        }
      }
    },
    [],
  );

  const teardown = React.useCallback(() => {
    for (const pipe of pipesRef.current) {
      pipe.node.disconnect();
      pipe.source.disconnect();
      pipe.stream.getTracks().forEach((track) => track.stop());
    }
    pipesRef.current = [];
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
  }, []);

  const flushPipe = React.useCallback(
    (pipe: Pipeline, minSpeechMs = MIN_SPEECH_MS, reason: FlushReason = "manual") => {
      const sampleRate = ctxRef.current?.sampleRate ?? 48000;
      const chunks = pipe.chunks;
      const speechMs = pipe.speechMs;
      const silenceMs = pipe.silenceMs;
      const speaker = speakerOf(pipe);
      pipe.chunks = [];
      pipe.speechMs = 0;
      pipe.silenceMs = 0;
      pipe.partialAt = 0;
      pipe.segment += 1;
      const sent = chunks.length > 0 && speechMs >= minSpeechMs;
      if (speechMs > 0 || sent) {
        recordSegment({ speaker, speechMs, silenceMs, reason, sent });
      }
      if (sent) {
        // Clear the live bubble of whichever side owned the partials.
        cbRef.current.onInterim("", speaker);
        void sendSegment(chunks, sampleRate, speaker);
      } else {
        cbRef.current.onInterim("", speaker);
      }
    },
    [recordSegment, sendSegment, speakerOf],
  );

  const flushAll = React.useCallback(
    (minSpeechMs?: number, reason: FlushReason = "manual") => {
      pipesRef.current.forEach((pipe) => flushPipe(pipe, minSpeechMs, reason));
    },
    [flushPipe],
  );

  const start = React.useCallback(async () => {
    if (pipesRef.current.length > 0) return true;

    // Android Chrome / iOS Safari expose no getDisplayMedia — fall back to mic.
    const canCaptureSystem = typeof navigator?.mediaDevices?.getDisplayMedia === "function";
    const wantSystem = canCaptureSystem && (audioSource === "system" || audioSource === "both");
    const wantMic = audioSource === "microphone" || audioSource === "both" || !wantSystem;

    let micStream: MediaStream | null = null;
    let sysStream: MediaStream | null = null;

    if (wantMic) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            ...(micDeviceId ? { deviceId: { exact: micDeviceId } } : {}),
          },
        });
      } catch {
        cbRef.current.onError("microphone");
        return false;
      }
    }

    if (wantSystem) {
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({
          // A video track is required by the spec, but we drop it immediately —
          // we only ever keep the audio. Hint the picker toward tab capture with
          // audio so users see the "share tab audio" toggle.
          video: { width: 1, height: 1, frameRate: 1 },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          // Non-standard but widely supported hints (Chromium).
          ...({
            systemAudio: "include",
            selfBrowserSurface: "exclude",
            surfaceSwitching: "include",
            preferCurrentTab: false,
          } as Record<string, unknown>),
        } as DisplayMediaStreamOptions);
        if (display.getAudioTracks().length === 0) {
          display.getTracks().forEach((t) => t.stop());
          throw new Error("no-system-audio");
        }
        display.getVideoTracks().forEach((t) => t.stop());
        sysStream = new MediaStream(display.getAudioTracks());
      } catch (error) {
        const reason =
          error instanceof Error && error.message === "no-system-audio" ? "system-audio" : "screen";
        // "Both" still works with just the microphone — keep the session alive
        // and only warn, instead of failing the whole start.
        if (micStream) {
          cbRef.current.onError(`${reason}:soft`);
        } else {
          cbRef.current.onError(reason);
          return false;
        }
      }
    }

    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx!();
    await ctx.resume().catch(() => undefined);
    ctxRef.current = ctx;
    userPausedRef.current = false;
    // Push-to-talk starts silent: audio is only kept while a button is held.
    pausedRef.current = modeRef.current === "push";

    const attach = (stream: MediaStream, speaker: Speaker, ambiguous: boolean) => {
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const pipe: Pipeline = {
        speaker,
        ambiguous,
        stream,
        source,
        node,
        chunks: [],
        speechMs: 0,
        silenceMs: 0,
        partialAt: 0,
        partialBusy: false,
        segment: 0,
        rms: 0,
      };

      node.onaudioprocess = (event) => {
        if (pausedRef.current) return;
        const input = new Float32Array(event.inputBuffer.getChannelData(0));
        const chunkMs = (input.length / ctx.sampleRate) * 1000;
        const power = rms(input);
        pipe.rms = power;
        if (speaker === "user" || pipesRef.current.length === 1) {
          setLevel(Math.min(1, power * 12));
        }
        pipe.chunks.push(input);

        if (power > SILENCE_RMS) {
          pipe.speechMs += chunkMs;
          pipe.silenceMs = 0;
        } else {
          pipe.silenceMs += chunkMs;
        }

        const push = modeRef.current === "push";
        const totalMs = pipe.speechMs + pipe.silenceMs;
        if (!push) {
          // Continuous mode still segments on a pause so text keeps flowing.
          const endedByPause = pipe.silenceMs >= SILENCE_MS && pipe.speechMs >= MIN_SPEECH_MS;
          if (endedByPause || totalMs >= MAX_SEGMENT_MS) {
            flushPipe(pipe, MIN_SPEECH_MS, endedByPause ? "pause" : "max");
            return;
          }
          if (pipe.silenceMs >= SILENCE_MS * 3 && pipe.speechMs < MIN_SPEECH_MS) {
            if (pipe.speechMs > 0) {
              recordSegment({
                speaker: speakerOf(pipe),
                speechMs: pipe.speechMs,
                silenceMs: pipe.silenceMs,
                reason: "discarded",
                sent: false,
              });
            }
            pipe.chunks = [];
            pipe.speechMs = 0;
            pipe.silenceMs = 0;
            pipe.partialAt = 0;
            return;
          }
        } else if (totalMs >= MAX_SEGMENT_MS) {
          // A very long hold is split so transcription stays responsive.
          flushPipe(pipe, MIN_PUSH_SPEECH_MS, "max");
          return;
        }

        // Live partials: re-transcribe the growing buffer on a slow cadence so
        // the bubble shows real words instead of a placeholder.
        const now = event.timeStamp || performance.now();
        if (
          !pipe.partialBusy &&
          pipe.speechMs >= PARTIAL_MIN_SPEECH_MS &&
          now - pipe.partialAt >= PARTIAL_EVERY_MS
        ) {
          pipe.partialAt = now;
          pipe.partialBusy = true;
          const snapshot = pipe.chunks.slice();
          const segmentId = pipe.segment;
          const who = speakerOf(pipe);
          void sendSegment(snapshot, ctx.sampleRate, who, true).finally(() => {
            pipe.partialBusy = false;
            // A finished segment already cleared the bubble — don't resurrect it.
            if (pipe.segment !== segmentId) cbRef.current.onInterim("", who);
          });
        }
      };

      source.connect(node);
      node.connect(ctx.destination);
      pipesRef.current.push(pipe);
    };

    // With both sources the microphone is you and the system audio is the other
    // person. With a single microphone the buttons decide who is speaking.
    if (micStream) attach(micStream, sysStream ? "user" : speakerRef.current, !sysStream);
    if (sysStream) attach(sysStream, "other", false);

    setRecording(true);
    return true;
  }, [audioSource, micDeviceId, flushPipe, sendSegment, speakerOf]);

  /** Push-to-talk: start capturing one turn for `speaker`. */
  const beginTurn = React.useCallback((speaker: Speaker) => {
    if (userPausedRef.current || pipesRef.current.length === 0) return;
    speakerRef.current = speaker;
    for (const pipe of pipesRef.current) {
      pipe.chunks = [];
      pipe.speechMs = 0;
      pipe.silenceMs = 0;
      pipe.partialAt = 0;
      pipe.segment += 1;
    }
    pausedRef.current = false;
    setHolding(speaker);
  }, []);

  /** Push-to-talk: the button was released — this turn is finished. */
  const endTurn = React.useCallback(() => {
    if (pipesRef.current.length === 0) return;
    pausedRef.current = true;
    setHolding(null);
    setLevel(0);
    flushAll(MIN_PUSH_SPEECH_MS, "manual");
  }, [flushAll]);

  const setPaused = React.useCallback(
    (paused: boolean) => {
      userPausedRef.current = paused;
      pausedRef.current = paused || modeRef.current === "push";
      if (paused) {
        setHolding(null);
        flushAll(undefined, "manual");
      }
      setLevel(0);
    },
    [flushAll],
  );

  const stop = React.useCallback(() => {
    flushAll(undefined, "manual");
    teardown();
    pausedRef.current = false;
    userPausedRef.current = false;
    setHolding(null);
    setRecording(false);
    setLevel(0);
  }, [flushAll, teardown]);

  React.useEffect(() => () => teardown(), [teardown]);

  return {
    start,
    stop,
    setPaused,
    beginTurn,
    endTurn,
    holding,
    recording,
    level,
    transcribing,
    diagnostics,
    sampleRate: TARGET_RATE,
  };
}
