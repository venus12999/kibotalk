import * as React from "react";
import { Loader2, Mic, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKibo } from "@/lib/kibo/store";
import { toMono16k } from "@/lib/kibo/wav";
import { clearVoiceprint, embedVoice, loadVoiceprint, saveVoiceprint } from "@/lib/kibo/voiceprint";

const ENROLL_MS = 6000;

/** Records a short sample of the user's voice and stores its embedding locally. */
export function VoiceprintCard({ locked }: { locked: boolean }) {
  const { t } = useKibo();
  const [enrolled, setEnrolled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [remaining, setRemaining] = React.useState(0);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const sync = () => setEnrolled(loadVoiceprint() !== null);
    sync();
    window.addEventListener("kibo:voiceprint", sync);
    return () => window.removeEventListener("kibo:voiceprint", sync);
  }, []);

  const record = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setBusy(false);
      setError(t("voiceprintFailed"));
      return;
    }

    const ctx = new AudioContext();
    await ctx.resume().catch(() => undefined);
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (event) => {
      chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    source.connect(node);
    node.connect(ctx.destination);

    const started = Date.now();
    const tick = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((ENROLL_MS - (Date.now() - started)) / 1000)));
    }, 200);
    setRemaining(Math.ceil(ENROLL_MS / 1000));

    await new Promise((resolve) => window.setTimeout(resolve, ENROLL_MS));

    window.clearInterval(tick);
    node.disconnect();
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    const rate = ctx.sampleRate;
    await ctx.close().catch(() => undefined);

    const embedding = embedVoice(toMono16k(chunks, rate));
    setRemaining(0);
    setBusy(false);
    if (!embedding) {
      setError(t("voiceprintTooQuiet"));
      return;
    }
    saveVoiceprint(embedding);
    setEnrolled(true);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            enrolled
              ? "inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold"
              : "inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
          }
        >
          {enrolled ? <Check className="size-3" /> : null}
          {enrolled ? t("voiceprintReady") : t("voiceprintMissing")}
        </span>
        <Button variant="soft" size="sm" disabled={busy || locked} onClick={() => void record()}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mic className="size-3.5" />}
          {busy ? `${remaining}s` : enrolled ? t("rerecordVoiceprint") : t("voiceprint")}
        </Button>
        {enrolled && !busy ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={locked}
            onClick={() => {
              clearVoiceprint();
              setEnrolled(false);
            }}
          >
            <Trash2 className="size-3.5" />
            {t("deleteVoiceprint")}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
