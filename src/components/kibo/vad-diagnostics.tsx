import * as React from "react";
import { Activity, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CaptureMode, UiLang } from "@/lib/kibo/types";
import type { Diagnostics } from "@/lib/kibo/use-transcriber";

type Strings = {
  [K in Exclude<keyof typeof copyRaw.en, "reason">]: string;
} & { reason: Record<string, string> };

const copyRaw = {
  zh: {
    title: "断句诊断",
    subtitle: "实时查看静音判定与采样状态",
    input: "输入电平",
    threshold: "静音阈值",
    speaking: "有声",
    silent: "静音",
    speechMs: "本段语音",
    silenceMs: "当前停顿",
    cutIn: "还差 {n} 断句",
    cutManual: "松手即断句",
    sampleRate: "采样率",
    minSpeech: "最短有效语音",
    maxSegment: "单段上限",
    recent: "最近断句",
    none: "开始会话后这里会显示每段的时长与断句原因。",
    reason: {
      pause: "停顿断句",
      max: "超长切分",
      manual: "手动断句",
      discarded: "太短已丢弃",
    },
    sent: "已转写",
    dropped: "未转写",
    tips: "建议",
    ok: "断句状态良好，保持当前节奏即可。",
    tipShort: "有几段语音不足 {n}，多半是松手太快或话没说完就放开：说完最后一个字后再多按住半秒。",
    tipDropped: "有语音被判定为太短而丢弃，请把整句说完再松手，或在设置里改用「按住说话」。",
    tipMax: "有段落被超长切分，一次说 10 秒以内的一句话，效果更稳。",
    tipNoisy: "静音时的底噪已接近阈值，环境偏吵：改用「按住说话」，或靠近麦克风、戴耳机麦。",
    tipQuiet: "说话音量偏低，系统可能听不出你在说话：靠近麦克风或调高输入音量。",
    tipPause: "持续聆听靠 {n} 的停顿断句，说完一句请明显停顿一下，别急着接下一句。",
  },
  ja: {
    title: "区切り診断",
    subtitle: "無音判定と収音状態をリアルタイム表示",
    input: "入力レベル",
    threshold: "無音しきい値",
    speaking: "発話中",
    silent: "無音",
    speechMs: "現在の発話",
    silenceMs: "現在の無音",
    cutIn: "あと {n} で区切り",
    cutManual: "離すと区切り",
    sampleRate: "サンプリング",
    minSpeech: "最短発話",
    maxSegment: "1区間の上限",
    recent: "直近の区切り",
    none: "セッションを開始すると、各区間の長さと区切り理由が表示されます。",
    reason: {
      pause: "無音で区切り",
      max: "長すぎて分割",
      manual: "手動で区切り",
      discarded: "短すぎて破棄",
    },
    sent: "文字起こし済み",
    dropped: "未処理",
    tips: "アドバイス",
    ok: "区切りは良好です。今のペースを維持してください。",
    tipShort:
      "{n} 未満の区間があります。離すのが早い可能性があるので、言い終えてから0.5秒ほど長めに押してください。",
    tipDropped: "短すぎて破棄された音声があります。文を最後まで話してから離してください。",
    tipMax: "長すぎて分割された区間があります。1回10秒以内を目安に。",
    tipNoisy:
      "無音時のノイズがしきい値に近く、環境が騒がしいようです。「押して話す」やヘッドセットを検討してください。",
    tipQuiet: "声が小さめです。マイクに近づくか入力音量を上げてください。",
    tipPause: "常時収音は {n} の無音で区切ります。一文ごとにはっきり間を取ってください。",
  },
  en: {
    title: "Turn-taking diagnostics",
    subtitle: "Live VAD silence decisions and capture state",
    input: "Input level",
    threshold: "Silence threshold",
    speaking: "Voiced",
    silent: "Silent",
    speechMs: "Speech in buffer",
    silenceMs: "Current pause",
    cutIn: "{n} left before cut",
    cutManual: "Release to cut",
    sampleRate: "Sample rate",
    minSpeech: "Min speech",
    maxSegment: "Max segment",
    recent: "Recent cuts",
    none: "Start a session to see each segment's length and why it was cut.",
    reason: {
      pause: "Cut on pause",
      max: "Split (too long)",
      manual: "Manual cut",
      discarded: "Dropped (too short)",
    },
    sent: "Transcribed",
    dropped: "Not sent",
    tips: "Suggestions",
    ok: "Segmentation looks healthy — keep this rhythm.",
    tipShort:
      "Some segments were under {n} — you may be releasing too early. Hold half a second past your last word.",
    tipDropped: "Some audio was dropped for being too short. Finish the sentence before releasing.",
    tipMax: "Segments were split for length. Aim for one sentence under 10s at a time.",
    tipNoisy:
      "Background noise is close to the threshold. Switch to push-to-talk or use a headset mic.",
    tipQuiet: "Your voice reads quiet — move closer to the mic or raise input gain.",
    tipPause: "Continuous mode cuts after {n} of silence. Pause clearly between sentences.",
  },
} as const;

const copy = copyRaw as unknown as Record<UiLang, Strings>;

const ms = (v: number) => `${(v / 1000).toFixed(1)}s`;

function buildTips(d: Diagnostics, mode: CaptureMode, w: Strings) {
  const tips: string[] = [];
  const done = d.segments;
  const short = done.filter((s) => s.sent && s.speechMs < d.minSpeechMs * 2.5).length;
  const dropped = done.filter((s) => !s.sent).length;
  const maxed = done.filter((s) => s.reason === "max").length;

  if (dropped >= 1) tips.push(w.tipDropped);
  if (short >= 2) tips.push(w.tipShort.replace("{n}", ms(d.minSpeechMs * 2.5)));
  if (maxed >= 1) tips.push(w.tipMax);
  if (!d.voiced && d.rms > d.silenceThreshold * 0.7) tips.push(w.tipNoisy);
  if (d.voiced && d.rms < d.silenceThreshold * 1.6) tips.push(w.tipQuiet);
  if (mode === "continuous" && done.length === 0)
    tips.push(w.tipPause.replace("{n}", ms(d.silenceWindowMs)));
  if (tips.length === 0 && done.length > 0) tips.push(w.ok);
  return tips;
}

type Props = {
  diagnostics: Diagnostics;
  mode: CaptureMode;
  uiLang: UiLang;
  recording: boolean;
  className?: string;
};

export function VadDiagnostics({ diagnostics: d, mode, uiLang, recording, className }: Props) {
  const w = copy[uiLang] ?? copy.en;
  const [open, setOpen] = React.useState(false);
  const tips = buildTips(d, mode, w);

  // Log scale keeps quiet speech visible; the threshold marker uses the same map.
  const toPct = (v: number) => Math.max(0, Math.min(100, (Math.log10(v * 1000 + 1) / 2) * 100));
  const levelPct = toPct(d.rms);
  const thresholdPct = toPct(d.silenceThreshold);

  return (
    <section className={cn("glass-panel rounded-2xl px-3 py-2.5", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <Activity
          className={cn("size-4 shrink-0", recording ? "text-primary" : "text-muted-foreground")}
        />
        <span className="flex-1">
          <span className="block text-xs font-bold">{w.title}</span>
          <span className="block text-[11px] text-muted-foreground">{w.subtitle}</span>
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            d.voiced
              ? "gradient-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {d.voiced ? w.speaking : w.silent}
        </span>
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          <div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{w.input}</span>
              <span className="tabular-nums">{d.rms.toFixed(4)}</span>
            </div>
            <div className="glass-fill relative mt-1 h-2 overflow-hidden rounded-full">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-100",
                  d.voiced ? "gradient-primary" : "bg-muted-foreground/40",
                )}
                style={{ width: `${levelPct}%` }}
              />
              <span
                aria-hidden
                className="absolute inset-y-0 w-px bg-destructive"
                style={{ left: `${thresholdPct}%` }}
                title={w.threshold}
              />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
            <Row label={w.speechMs} value={ms(d.speechMs)} />
            <Row label={w.silenceMs} value={ms(d.silenceMs)} />
            <Row label={w.threshold} value={d.silenceThreshold.toFixed(3)} />
            <Row
              label={mode === "push" ? w.cutManual : w.cutIn.replace("{n}", ms(d.silenceToCut))}
              value={mode === "push" ? "—" : ms(d.silenceWindowMs)}
            />
            <Row label={w.minSpeech} value={ms(d.minSpeechMs)} />
            <Row label={w.maxSegment} value={ms(d.maxSegmentMs)} />
            <Row label={w.sampleRate} value={`${Math.round(d.sampleRate / 100) / 10} kHz`} />
          </dl>

          <div>
            <p className="text-[11px] font-semibold">{w.recent}</p>
            {d.segments.length === 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">{w.none}</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {d.segments.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-lg bg-muted/40 px-2 py-1 text-[11px]"
                  >
                    <span className="font-medium">{w.reason[s.reason]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {ms(s.speechMs)} · {s.sent ? w.sent : w.dropped}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold">{w.tips}</p>
            <ul className="mt-1 space-y-1">
              {tips.map((tip) => (
                <li key={tip} className="text-[11px] leading-relaxed text-muted-foreground">
                  · {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="shrink-0 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
