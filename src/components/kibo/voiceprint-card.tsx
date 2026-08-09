import * as React from "react";
import { Loader2, Mic, Trash2, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKibo } from "@/lib/kibo/store";
import { toMono16k } from "@/lib/kibo/wav";
import { sampleLines } from "@/lib/kibo/sample-lines";
import {
  clearVoiceprint,
  embedVoice,
  loadVoiceprint,
  saveVoiceprint,
  voiceprintEnrolledAt,
} from "@/lib/kibo/voiceprint";

const copy = {
  zh: {
    at: "录入时间",
    unknown: "时间未知",
    refresh: "刷新状态",
    refreshed: "状态已刷新",
    howTo: "点击下面的按钮后，请用平时的语速朗读这几句话，直到倒计时结束。",
    readNow: "请开始朗读：",
    reading: "正在录音，请继续朗读…",
  },
  ja: {
    at: "登録日時",
    unknown: "日時不明",
    refresh: "状態を更新",
    refreshed: "状態を更新しました",
    howTo: "下のボタンを押したら、いつもの速さでこの文を読み上げてください。カウントダウンが終わるまで続けます。",
    readNow: "読み上げてください：",
    reading: "録音中です。そのまま読み続けてください…",
  },
  en: {
    at: "Enrolled at",
    unknown: "Time unknown",
    refresh: "Refresh status",
    refreshed: "Status refreshed",
    howTo: "Tap the button below, then read these lines aloud at your normal pace until the countdown ends.",
    readNow: "Read this aloud:",
    reading: "Recording — keep reading…",
  },
} as const;

const ENROLL_MS = 10000;

/** Records a short read-aloud sample and stores its embedding locally. */
export function VoiceprintCard({
  locked,
  onEnrolled,
}: {
  locked: boolean;
  onEnrolled?: () => void;
}) {
  const { t, prefs } = useKibo();
  const words = copy[prefs.uiLang] ?? copy.en;
  const [lineLang, setLineLang] = React.useState<ConvLang>(prefs.conversationLang);
  React.useEffect(() => setLineLang(prefs.conversationLang), [prefs.conversationLang]);
  const lines = sampleLines[lineLang] ?? sampleLines.en;
  const [enrolled, setEnrolled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [remaining, setRemaining] = React.useState(0);
  const [error, setError] = React.useState("");
  const [enrolledAt, setEnrolledAt] = React.useState<number | null>(null);
  const [refreshedAt, setRefreshedAt] = React.useState(0);

  const sync = React.useCallback(() => {
    setEnrolled(loadVoiceprint() !== null);
    setEnrolledAt(voiceprintEnrolledAt());
  }, []);

  React.useEffect(() => {
    sync();
    window.addEventListener("kibo:voiceprint", sync);
    return () => window.removeEventListener("kibo:voiceprint", sync);
  }, [sync]);

  const localeTag = prefs.uiLang === "zh" ? "zh-CN" : prefs.uiLang === "ja" ? "ja-JP" : "en-US";

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
    sync();
    onEnrolled?.();
  };

  return (
    <div className="w-full space-y-3">
      <div className="glass-quiet p-3">
        <p className="text-xs font-semibold text-muted-foreground">
          {busy ? words.reading : words.readNow}
        </p>
        <ul className="mt-2 space-y-1.5">
          {lines.map((line) => (
            <li key={line} className="text-sm leading-relaxed font-medium">
              {line}
            </li>
          ))}
        </ul>
        {!busy ? <p className="mt-2 text-xs text-muted-foreground">{words.howTo}</p> : null}
      </div>

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
              sync();
            }}
          >
            <Trash2 className="size-3.5" />
            {t("deleteVoiceprint")}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          aria-label={words.refresh}
          onClick={() => {
            sync();
            setRefreshedAt(Date.now());
          }}
        >
          <RefreshCw className="size-3.5" />
          {words.refresh}
        </Button>
      </div>
      {enrolled ? (
        <p className="text-xs text-muted-foreground">
          {words.at}: {enrolledAt ? new Date(enrolledAt).toLocaleString(localeTag) : words.unknown}
        </p>
      ) : null}
      {refreshedAt ? <p className="text-xs text-muted-foreground">{words.refreshed}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
