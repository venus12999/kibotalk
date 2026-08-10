/**
 * Volcengine (火山引擎) streaming ASR — WebSocket binary protocol v3.
 * https://docs.volcengine.com/docs/6561/1354869
 *
 * We keep the browser contract unchanged (upload a WAV segment, read SSE
 * transcript events) and do the WebSocket streaming server-side: the audio is
 * pushed to Volcengine in small slices and every partial result it returns is
 * re-emitted as a `transcript.text.delta` event, so the UI still fills in
 * word by word while the segment is being recognized.
 */

const ENDPOINT = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel";
const DEFAULT_RESOURCE = "volc.bigasr.sauc.duration";

/** 200 ms of 16 kHz / 16-bit mono PCM. */
const SLICE_BYTES = 6400;

type VolcOptions = {
  appId: string;
  accessToken: string;
  resourceId?: string | undefined;
  language?: string | undefined;
};

/** Strip the 44-byte RIFF header from the WAV the client uploads. */
export function wavToPcm(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 44 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF") {
    // Walk the chunks so a non-standard header size still works.
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4);
      const size = view.getUint32(0, true);
      if (id === "data") return bytes.slice(offset + 8, offset + 8 + size);
      offset += 8 + size + (size % 2);
    }
    return bytes.slice(44);
  }
  return bytes;
}

function header(messageType: number, flags: number, serialization: number) {
  return [0x11, (messageType << 4) | flags, (serialization << 4) | 0x00, 0x00];
}

function int32(value: number) {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setInt32(0, value, false);
  return buf;
}

function frame(head: number[], sequence: number, payload: Uint8Array) {
  const seq = int32(sequence);
  const size = int32(payload.length);
  const out = new Uint8Array(4 + 4 + 4 + payload.length);
  out.set(head, 0);
  out.set(seq, 4);
  out.set(size, 8);
  out.set(payload, 12);
  return out;
}

type Parsed = { type: "result"; text: string } | { type: "error"; message: string } | null;

function parseServerFrame(data: ArrayBuffer): Parsed {
  const bytes = new Uint8Array(data);
  if (bytes.length < 4) return null;
  const headerSize = (bytes[0]! & 0x0f) * 4;
  const messageType = bytes[1]! >> 4;
  const flags = bytes[1]! & 0x0f;

  let offset = headerSize;
  if (messageType === 0b1111) {
    // Error response: [error code int32][payload size int32][payload]
    offset += 4;
  } else if (flags & 0x01) {
    offset += 4; // sequence
  }
  if (offset + 4 > bytes.length) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
  const size = view.getUint32(0, false);
  offset += 4;
  const text = new TextDecoder().decode(bytes.slice(offset, offset + size));
  if (!text) return null;

  if (messageType === 0b1111) return { type: "error", message: text.slice(0, 300) };

  try {
    const json = JSON.parse(text) as { result?: { text?: string } };
    return { type: "result", text: json.result?.text ?? "" };
  } catch {
    return null;
  }
}

/**
 * Streams one audio segment through Volcengine ASR and returns an SSE body
 * with `transcript.text.delta` / `transcript.text.done` events.
 */
export async function transcribeWithVolc(wav: Uint8Array, options: VolcOptions): Promise<Response> {
  const pcm = wavToPcm(wav);
  if (pcm.length < 3200) return new Response("Empty audio", { status: 400 });

  const connectId = crypto.randomUUID();
  let upstream: Response | null = null;
  try {
    upstream = await fetch(ENDPOINT, {
      headers: {
        Upgrade: "websocket",
        "X-Api-App-Key": options.appId,
        "X-Api-Access-Key": options.accessToken,
        "X-Api-Resource-Id": options.resourceId || DEFAULT_RESOURCE,
        "X-Api-Connect-Id": connectId,
      },
    });
  } catch {
    upstream = null; // runtime without outbound WebSocket support
  }

  const ws = (upstream as unknown as { webSocket?: WebSocket & { accept: () => void } } | null)
    ?.webSocket;
  if (!ws) {
    // Fall back to the one-shot flash recognizer so transcription keeps
    // working on runtimes that cannot open an outbound WebSocket.
    return transcribeWithVolcFlash(wav, options, connectId);
  }
  ws.accept();

  const encoder = new TextEncoder();
  let emitted = "";
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        send({ type: "transcript.text.done", text: emitted });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        try {
          ws.close();
        } catch {
          /* already closed */
        }
      };

      ws.addEventListener("message", (event: MessageEvent) => {
        if (typeof event.data === "string") return;
        const parsed = parseServerFrame(event.data as ArrayBuffer);
        if (!parsed) return;
        if (parsed.type === "error") {
          if (!closed) {
            closed = true;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "transcript.text.done", text: emitted })}\n\n`,
              ),
            );
            controller.close();
          }
          return;
        }
        const text = parsed.text ?? "";
        if (text.length > emitted.length && text.startsWith(emitted)) {
          const delta = text.slice(emitted.length);
          emitted = text;
          send({ type: "transcript.text.delta", delta });
        } else if (text && text !== emitted) {
          // The recognizer rewrote the sentence — resync the client.
          emitted = text;
          send({ type: "transcript.text.reset", text });
        }
      });
      ws.addEventListener("close", finish);
      ws.addEventListener("error", finish);

      // 1) full client request
      const config = {
        user: { uid: connectId },
        audio: { format: "pcm", codec: "raw", rate: 16000, bits: 16, channel: 1 },
        request: {
          model_name: "bigmodel",
          enable_itn: true,
          enable_punc: true,
          show_utterances: false,
          ...(options.language ? { language: options.language } : {}),
        },
      };
      ws.send(frame(header(0b0001, 0b0001, 0b0001), 1, encoder.encode(JSON.stringify(config))));

      // 2) audio slices, last one carries a negative sequence
      void (async () => {
        let seq = 1;
        for (let offset = 0; offset < pcm.length; offset += SLICE_BYTES) {
          const slice = pcm.slice(offset, offset + SLICE_BYTES);
          const last = offset + SLICE_BYTES >= pcm.length;
          seq += 1;
          try {
            ws.send(
              frame(header(0b0010, last ? 0b0011 : 0b0001, 0b0000), last ? -seq : seq, slice),
            );
          } catch {
            finish();
            return;
          }
          if (!last) await new Promise((r) => setTimeout(r, 20));
        }
        // Safety net: never hang if the server forgets to close.
        setTimeout(finish, 15000);
      })();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

const FLASH_ENDPOINT = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
const FLASH_RESOURCE = "volc.bigasr.auc_turbo";

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** One-shot 极速版 recognizer, streamed back to the client in small deltas. */
async function transcribeWithVolcFlash(
  wav: Uint8Array,
  options: VolcOptions,
  requestId: string,
): Promise<Response> {
  const res = await fetch(FLASH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-App-Key": options.appId,
      "X-Api-Access-Key": options.accessToken,
      "X-Api-Resource-Id": FLASH_RESOURCE,
      "X-Api-Request-Id": requestId,
      "X-Api-Sequence": "-1",
    },
    body: JSON.stringify({
      user: { uid: requestId },
      audio: { format: "wav", data: base64(wav) },
      request: {
        model_name: "bigmodel",
        enable_itn: true,
        enable_punc: true,
        ...(options.language ? { language: options.language } : {}),
      },
    }),
  });

  const status = res.headers.get("X-Api-Status-Code") ?? "";
  const raw = await res.text().catch(() => "");
  if (!res.ok || (status && !status.startsWith("2"))) {
    const message = res.headers.get("X-Api-Message") || raw.slice(0, 200);
    return new Response(message || "ASR failed", { status: 502 });
  }

  let text = "";
  try {
    const json = JSON.parse(raw) as { result?: { text?: string } };
    text = (json.result?.text ?? "").trim();
  } catch {
    text = "";
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const step = 6;
      for (let i = 0; i < text.length; i += step) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "transcript.text.delta",
              delta: text.slice(i, i + step),
            })}\n\n`,
          ),
        );
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "transcript.text.done", text })}\n\n`),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
