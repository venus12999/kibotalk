import * as React from "react";
import { encodeWav, rms, toMono16k, TARGET_RATE } from "./wav";
import {
  classifySpeaker,
  embedVoice,
  loadVoiceprint,
  updateCentroid,
  VOICEPRINT_KEY,
} from "./voiceprint";
import { matchesLanguage } from "./lang-guard";
import type { AudioSource, ConvLang } from "./types";

type Speaker = "user" | "other";

type Options = {
  language: string;
  audioSource: AudioSource;
  micDeviceId?: string;
  onInterim: (text: string, speaker: Speaker) => void;
  onFinal: (text: string, speaker: Speaker) => void;
  onError: (message: string) => void;
};

const SILENCE_RMS = 0.012;
const SILENCE_MS = 700;
const MIN_SPEECH_MS = 600;
const MAX_SEGMENT_MS = 12000;
/** How often an unfinished segment is re-transcribed to show live partials. */
const PARTIAL_EVERY_MS = 1600;
const PARTIAL_MIN_SPEECH_MS = 900;

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
};

export function useTranscriber({
  language,
  audioSource,
  micDeviceId,
  onInterim,
  onFinal,
  onError,
}: Options) {
  const [recording, setRecording] = React.useState(false);
  const [level, setLevel] = React.useState(0);
  const [transcribing, setTranscribing] = React.useState(false);

  const ctxRef = React.useRef<AudioContext | null>(null);
  const pipesRef = React.useRef<Pipeline[]>([]);
  const pausedRef = React.useRef(false);
  const inFlightRef = React.useRef(0);

  // Voiceprint state for the current session.
  const enrolledRef = React.useRef<Float32Array | null>(null);
  const otherCentroidRef = React.useRef<Float32Array | null>(null);
  const lastSpeakerRef = React.useRef<Speaker | null>(null);

  const cbRef = React.useRef({ onInterim, onFinal, onError, language });
  cbRef.current = { onInterim, onFinal, onError, language };

  /** Decide who spoke a segment: source routing first, voiceprint when unsure. */
  const resolveSpeaker = React.useCallback(
    (pipe: Pipeline, chunks: Float32Array[], sampleRate: number): Speaker => {
      if (!pipe.ambiguous) return pipe.speaker;
      const enrolled = enrolledRef.current;
      if (!enrolled) return pipe.speaker;

      const embedding = embedVoice(toMono16k(chunks, sampleRate));
      if (!embedding) return lastSpeakerRef.current ?? pipe.speaker;

      const { speaker, confident } = classifySpeaker(
        embedding,
        enrolled,
        otherCentroidRef.current,
        lastSpeakerRef.current,
      );
      if (speaker === "other" && confident) {
        otherCentroidRef.current = updateCentroid(otherCentroidRef.current, embedding);
      }
      lastSpeakerRef.current = speaker;
      return speaker;
    },
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
    (pipe: Pipeline) => {
      const sampleRate = ctxRef.current?.sampleRate ?? 48000;
      const chunks = pipe.chunks;
      const speechMs = pipe.speechMs;
      pipe.chunks = [];
      pipe.speechMs = 0;
      pipe.silenceMs = 0;
      pipe.partialAt = 0;
      pipe.segment += 1;
      if (chunks.length > 0 && speechMs >= MIN_SPEECH_MS) {
        const speaker = resolveSpeaker(pipe, chunks, sampleRate);
        // Clear the live bubble of whichever side owned the partials.
        cbRef.current.onInterim("", pipe.speaker);
        void sendSegment(chunks, sampleRate, speaker);
      }
    },
    [sendSegment, resolveSpeaker],
  );

  const flushAll = React.useCallback(() => {
    pipesRef.current.forEach(flushPipe);
  }, [flushPipe]);

  const start = React.useCallback(async () => {
    if (pipesRef.current.length > 0) return true;

    const wantMic = audioSource === "microphone" || audioSource === "both";
    const wantSystem = audioSource === "system" || audioSource === "both";

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
          video: true,
          audio: true,
        });
        if (display.getAudioTracks().length === 0) {
          display.getTracks().forEach((t) => t.stop());
          throw new Error("no-system-audio");
        }
        display.getVideoTracks().forEach((t) => t.stop());
        sysStream = new MediaStream(display.getAudioTracks());
      } catch (error) {
        micStream?.getTracks().forEach((t) => t.stop());
        cbRef.current.onError(
          error instanceof Error && error.message === "no-system-audio"
            ? "system-audio"
            : "screen",
        );
        return false;
      }
    }

    const ctx = new AudioContext();
    await ctx.resume().catch(() => undefined);
    ctxRef.current = ctx;
    pausedRef.current = false;
    enrolledRef.current = loadVoiceprint();
    otherCentroidRef.current = null;
    lastSpeakerRef.current = null;

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
      };

      node.onaudioprocess = (event) => {
        if (pausedRef.current) return;
        const input = new Float32Array(event.inputBuffer.getChannelData(0));
        const chunkMs = (input.length / ctx.sampleRate) * 1000;
        const power = rms(input);
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

        const totalMs = pipe.speechMs + pipe.silenceMs;
        const endedByPause = pipe.silenceMs >= SILENCE_MS && pipe.speechMs >= MIN_SPEECH_MS;
        if (endedByPause || totalMs >= MAX_SEGMENT_MS) {
          flushPipe(pipe);
          return;
        }
        if (pipe.silenceMs >= SILENCE_MS * 3 && pipe.speechMs < MIN_SPEECH_MS) {
          pipe.chunks = [];
          pipe.speechMs = 0;
          pipe.silenceMs = 0;
          pipe.partialAt = 0;
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
          void sendSegment(snapshot, ctx.sampleRate, pipe.speaker, true).finally(() => {
            pipe.partialBusy = false;
            // A finished segment already cleared the bubble — don't resurrect it.
            if (pipe.segment !== segmentId) cbRef.current.onInterim("", pipe.speaker);
          });
        }
      };

      source.connect(node);
      node.connect(ctx.destination);
      pipesRef.current.push(pipe);
    };

    // With both sources the microphone is you and the system audio is the other
    // person. With a single microphone the voiceprint decides who is speaking.
    if (micStream) attach(micStream, sysStream ? "user" : "other", !sysStream);
    if (sysStream) attach(sysStream, "other", false);

    setRecording(true);
    return true;
  }, [audioSource, micDeviceId, flushPipe, sendSegment]);

  const setPaused = React.useCallback(
    (paused: boolean) => {
      pausedRef.current = paused;
      if (paused) flushAll();
      setLevel(0);
    },
    [flushAll],
  );

  const stop = React.useCallback(() => {
    flushAll();
    teardown();
    pausedRef.current = false;
    setRecording(false);
    setLevel(0);
  }, [flushAll, teardown]);

  React.useEffect(() => () => teardown(), [teardown]);

  return { start, stop, setPaused, recording, level, transcribing, sampleRate: TARGET_RATE };
}

export { VOICEPRINT_KEY };
