import * as React from "react";
import { encodeWav, rms } from "./wav";

type Options = {
  language: string;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
};

const SILENCE_RMS = 0.012;
const SILENCE_MS = 700;
const MIN_SPEECH_MS = 600;
const MAX_SEGMENT_MS = 12000;

export function useTranscriber({ language, onInterim, onFinal, onError }: Options) {
  const [recording, setRecording] = React.useState(false);
  const [level, setLevel] = React.useState(0);
  const [transcribing, setTranscribing] = React.useState(false);

  const streamRef = React.useRef<MediaStream | null>(null);
  const ctxRef = React.useRef<AudioContext | null>(null);
  const nodeRef = React.useRef<ScriptProcessorNode | null>(null);
  const sourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = React.useRef<Float32Array[]>([]);
  const speechMsRef = React.useRef(0);
  const silenceMsRef = React.useRef(0);
  const pausedRef = React.useRef(false);
  const inFlightRef = React.useRef(0);

  const cbRef = React.useRef({ onInterim, onFinal, onError, language });
  cbRef.current = { onInterim, onFinal, onError, language };

  const sendSegment = React.useCallback(async (chunks: Float32Array[], sampleRate: number) => {
    const blob = encodeWav(chunks, sampleRate);
    if (blob.size < 4096) return;

    const form = new FormData();
    form.append("file", blob, "recording.wav");
    form.append("language", cbRef.current.language);

    inFlightRef.current += 1;
    setTranscribing(true);
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
              cbRef.current.onInterim(text);
            } else if (event.type === "transcript.text.done") {
              text = event.text ?? text;
            }
          } catch {
            /* ignore malformed keepalive lines */
          }
        }
      }

      cbRef.current.onInterim("");
      if (text.trim()) cbRef.current.onFinal(text.trim());
    } catch (error) {
      cbRef.current.onInterim("");
      cbRef.current.onError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlightRef.current -= 1;
      if (inFlightRef.current <= 0) setTranscribing(false);
    }
  }, []);

  const teardown = React.useCallback(() => {
    nodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void ctxRef.current?.close().catch(() => undefined);
    nodeRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
  }, []);

  const flush = React.useCallback(() => {
    const chunks = chunksRef.current;
    const sampleRate = ctxRef.current?.sampleRate ?? 48000;
    chunksRef.current = [];
    const speechMs = speechMsRef.current;
    speechMsRef.current = 0;
    silenceMsRef.current = 0;
    if (chunks.length > 0 && speechMs >= MIN_SPEECH_MS) void sendSegment(chunks, sampleRate);
  }, [sendSegment]);

  const start = React.useCallback(async () => {
    if (streamRef.current) return true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      cbRef.current.onError("microphone");
      return false;
    }

    const ctx = new AudioContext();
    await ctx.resume().catch(() => undefined);
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);

    chunksRef.current = [];
    speechMsRef.current = 0;
    silenceMsRef.current = 0;
    pausedRef.current = false;

    node.onaudioprocess = (event) => {
      if (pausedRef.current) return;
      const input = new Float32Array(event.inputBuffer.getChannelData(0));
      const chunkMs = (input.length / ctx.sampleRate) * 1000;
      const power = rms(input);
      setLevel(Math.min(1, power * 12));
      chunksRef.current.push(input);

      if (power > SILENCE_RMS) {
        speechMsRef.current += chunkMs;
        silenceMsRef.current = 0;
      } else {
        silenceMsRef.current += chunkMs;
      }

      const totalMs = speechMsRef.current + silenceMsRef.current;
      const endedByPause = silenceMsRef.current >= SILENCE_MS && speechMsRef.current >= MIN_SPEECH_MS;
      if (endedByPause || totalMs >= MAX_SEGMENT_MS) {
        flush();
      } else if (silenceMsRef.current >= SILENCE_MS * 3 && speechMsRef.current < MIN_SPEECH_MS) {
        chunksRef.current = [];
        speechMsRef.current = 0;
        silenceMsRef.current = 0;
      }
    };

    source.connect(node);
    node.connect(ctx.destination);

    streamRef.current = stream;
    ctxRef.current = ctx;
    sourceRef.current = source;
    nodeRef.current = node;
    setRecording(true);
    return true;
  }, [flush]);

  const setPaused = React.useCallback(
    (paused: boolean) => {
      pausedRef.current = paused;
      if (paused) flush();
      setLevel(0);
    },
    [flush],
  );

  const stop = React.useCallback(() => {
    flush();
    teardown();
    pausedRef.current = false;
    setRecording(false);
    setLevel(0);
  }, [flush, teardown]);

  React.useEffect(() => () => teardown(), [teardown]);

  return { start, stop, setPaused, recording, level, transcribing };
}
