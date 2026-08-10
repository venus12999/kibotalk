import * as React from "react";
import {
  Sparkles,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCw,
  ChevronDown,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Candidate, Round, Segment } from "@/lib/kibo/types";

function clipSegments(segments: Segment[], limit: number): Segment[] {
  const out: Segment[] = [];
  let used = 0;
  for (const seg of segments) {
    if (used >= limit) break;
    const room = limit - used;
    if (seg.t.length <= room) {
      out.push(seg);
      used += seg.t.length;
    } else {
      out.push({ ...seg, t: seg.t.slice(0, room), r: "" });
      break;
    }
  }
  return out;
}

/** Reply text with per-span readings rendered as ruby annotations. */
const RubyText = React.memo(function RubyText({
  candidate,
  limit,
}: {
  candidate: Candidate;
  limit: number;
}) {
  if (!candidate.segments || candidate.segments.length === 0) {
    return <>{candidate.text.slice(0, limit)}</>;
  }
  const segments = clipSegments(candidate.segments, limit);
  return (
    <>
      {segments.map((seg, i) =>
        seg.r ? (
          <ruby key={i} className={seg.role === "particle" ? "opacity-80" : undefined}>
            {seg.t}
            <rt className="text-[0.6em] font-medium opacity-70">{seg.r}</rt>
          </ruby>
        ) : (
          <span key={i} className={seg.role === "particle" ? "opacity-80" : undefined}>
            {seg.t}
          </span>
        ),
      )}
    </>
  );
});

/**
 * One sticky note. Text is rendered exactly as far as the stream has delivered
 * it — no client-side replay buffer — so characters appear the moment their
 * tokens land.
 */
const NOTE_TONES = ["note-glass-1", "note-glass-2", "note-glass-3"] as const;

/** Build a compact detail view from data we already have: reading breakdown. */
function keyWords(candidate: Candidate) {
  return (candidate.segments ?? []).filter((s) => s.role !== "punct" && s.t.trim().length > 0);
}

const NoteCard = React.memo(function NoteCard({
  candidate,
  caret,
  index,
  expanded,
  onToggle,
  labels,
}: {
  candidate: Candidate;
  caret: boolean;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  labels: { show: string; hide: string; alt: string; points: string };
}) {
  const total = candidate.segments?.length
    ? candidate.segments.reduce((n, s) => n + s.t.length, 0)
    : candidate.text.length;
  const words = keyWords(candidate);
  const hasDetail = words.length > 0 || Boolean(candidate.meaning);

  return (
    <li
      className={cn(
        "group relative flex items-start gap-3 py-3 pr-4 pl-3 transition-transform duration-300",
        "rounded-[1.75rem] animate-scale-in",
        NOTE_TONES[index % NOTE_TONES.length],
      )}
    >
      {/* Orb marker: the gradient sphere replaces the old sticky-note spine. */}
      <span
        aria-hidden
        className={cn(
          "kibo-orb mt-0.5 flex size-7 shrink-0 items-center justify-center text-[11px] font-black text-foreground/70",
          caret ? "animate-pulse" : "orb-float",
        )}
        style={{ animationDelay: `${index * 0.5}s` }}
      >
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-base leading-[2.1] font-semibold">
          <RubyText candidate={candidate} limit={total} />
          {caret ? (
            <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-current align-middle" />
          ) : null}
        </p>
        {candidate.meaning && !expanded ? (
          <p className="mt-1.5 line-clamp-1 text-xs opacity-70">{candidate.meaning}</p>
        ) : null}

        {hasDetail && !caret ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="mt-1.5 flex items-center gap-1 rounded-full bg-current/10 px-2 py-0.5 text-[11px] font-bold opacity-70 transition hover:opacity-100 active:scale-95"
          >
            <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
            {expanded ? labels.hide : labels.show}
          </button>
        ) : null}


      {expanded ? (
        <div className="mt-2 space-y-2 border-t border-current/15 pt-2">
          {candidate.meaning ? (
            <div>
              <p className="text-[11px] font-bold opacity-60">{labels.alt}</p>
              <p className="text-xs opacity-85">{candidate.meaning}</p>
            </div>
          ) : null}
          {words.length ? (
            <div>
              <p className="text-[11px] font-bold opacity-60">{labels.points}</p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {words.map((w, i) => (
                  <li
                    key={i}
                    className="rounded-full bg-current/10 px-2 py-0.5 text-[11px] font-semibold"
                  >
                    {w.t}
                    {w.r ? <span className="ml-1 opacity-60">{w.r}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      </div>
    </li>

  );
});






/** Past rounds are static; keep them out of the streaming render path. */
const PreviousRounds = React.memo(function PreviousRounds({
  rounds,
  label,
}: {
  rounds: Round[];
  label: string;
}) {
  return (
    <>
      {rounds.map((round) => (
        <div key={round.id} className="rounded-md border border-border p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <Clock className="size-3" />
            {label}
          </p>
          <ul className="mt-2 space-y-1.5">
            {round.candidates.map((c, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
});

export type AiStatus = "idle" | "connecting" | "retrying" | "streaming" | "done" | "error";

type StatusLabels = {
  connecting: string;
  retrying: string;
  streaming: string;
  done: string;
  failed: string;
  retry: string;
  attempt: string;
};

/** A persistent banner so the user always knows what the model is doing. */
const StatusBar = React.memo(function StatusBar({
  status,
  errorMessage,
  errorTitle,
  errorAdvice,
  attempt = 0,
  labels,
  onRetry,
  canRetry = true,
}: {
  status: AiStatus;
  errorMessage?: string | undefined;
  errorTitle?: string | undefined;
  errorAdvice?: string | undefined;
  attempt?: number;
  labels: StatusLabels;
  onRetry?: (() => void) | undefined;
  canRetry?: boolean;
}) {
  if (status === "idle") return null;

  const tone =
    status === "error"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : status === "done"
        ? "border-border bg-muted/40 text-muted-foreground"
        : "border-primary/30 bg-primary/10 text-foreground";

  const icon =
    status === "error" ? (
      <AlertCircle className="size-4 shrink-0" />
    ) : status === "done" ? (
      <CheckCircle2 className="size-4 shrink-0 text-primary" />
    ) : status === "connecting" || status === "retrying" ? (
      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
    ) : (
      <Sparkles className="size-4 shrink-0 animate-pulse text-primary" />
    );

  const label =
    status === "error"
      ? labels.failed
      : status === "done"
        ? labels.done
        : status === "connecting"
          ? labels.connecting
          : status === "retrying"
            ? labels.retrying
            : labels.streaming;

  // Failures get a taller card: the kind of failure and what to do about it
  // matter more than the raw message, which is kept as small technical detail.
  if (status === "error") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn("rounded-lg border px-3 py-2 text-xs", tone)}
      >
        <div className="flex items-start gap-2">
          {icon}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {errorTitle || label}
              {attempt > 0 ? (
                <span className="ml-1 font-normal opacity-70">
                  {labels.attempt.replace("{n}", String(attempt))}
                </span>
              ) : null}
            </p>
            {errorAdvice ? (
              <p className="mt-0.5 font-normal leading-snug opacity-90">{errorAdvice}</p>
            ) : null}
            {errorMessage ? (
              <p className="mt-0.5 truncate font-normal text-[10px] opacity-60">{errorMessage}</p>
            ) : null}
          </div>
          {onRetry && canRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="flex shrink-0 items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-[11px] font-bold hover:bg-destructive/10"
            >
              <RotateCw className="size-3" />
              {labels.retry}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold",
        tone,
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">
        {label}
        {attempt > 0 ? (
          <span className="ml-1 font-normal opacity-70">
            {labels.attempt.replace("{n}", String(attempt))}
          </span>
        ) : null}
      </span>
      {status === "streaming" ? (
        <span className="flex gap-0.5" aria-hidden>
          <i className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
          <i className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:120ms]" />
          <i className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:240ms]" />
        </span>
      ) : null}
    </div>
  );
});


export function SuggestionStage({
  rounds,
  streaming,
  status = "idle",
  errorMessage,
  errorTitle,
  errorAdvice,
  attempt = 0,
  statusLabels,
  onRetry,
  canRetry = true,
  emptyHint,
  previousRoundLabel,
  detailLabels,
  className,
}: {
  rounds: Round[];
  streaming: boolean;
  status?: AiStatus;
  errorMessage?: string | undefined;
  errorTitle?: string | undefined;
  errorAdvice?: string | undefined;
  attempt?: number;
  statusLabels: StatusLabels;
  onRetry?: (() => void) | undefined;
  canRetry?: boolean;
  emptyHint: string;
  previousRoundLabel: string;
  detailLabels?: { show: string; hide: string; alt: string; points: string };
  className?: string;
}) {
  const current = rounds[0];
  const previous = React.useMemo(() => rounds.slice(1, 3), [rounds]);
  // Accordion: only one note expanded at a time, so the panel height stays put.
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);
  const roundId = current?.id;
  React.useEffect(() => {
    setOpenIndex(null);
  }, [roundId]);
  const labels = detailLabels ?? {
    show: "Show details",
    hide: "Hide",
    alt: "Alternative phrasing",
    points: "Key words",
  };

  const candidates = current?.candidates ?? [];
  const last = candidates.length - 1;
  // Three slots always exist: the panel keeps one stable height whether the
  // ideas are still streaming in or already complete.
  const slots = [0, 1, 2];

  return (
    <ScrollArea className={className}>
      {/* Isolate streaming text updates from the rest of the page layout. */}
      <div className="space-y-4 pr-3 [contain:content]">
        <StatusBar
          status={status}
          errorMessage={errorMessage}
          errorTitle={errorTitle}
          errorAdvice={errorAdvice}
          attempt={attempt}
          labels={statusLabels}
          onRetry={onRetry}
          canRetry={canRetry}
        />

        <ol className="space-y-3">
          {slots.map((i) => {
            const c = candidates[i];
            if (c) {
              return (
                <NoteCard
                  key={i}
                  candidate={c}
                  caret={streaming && i === last}
                  index={i}
                  expanded={openIndex === i}
                  onToggle={() => setOpenIndex((prev) => (prev === i ? null : i))}
                  labels={labels}
                />
              );
            }
            return (
              <li
                key={i}
                className="flex min-h-[4.5rem] items-center justify-center rounded-md border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground"
              >
                {i === 0 && candidates.length === 0 && status === "idle" ? (
                  emptyHint
                ) : (
                  <span className="flex gap-1" aria-hidden>
                    <i className="size-1.5 animate-pulse rounded-full bg-current opacity-40" />
                    <i className="size-1.5 animate-pulse rounded-full bg-current opacity-40 [animation-delay:150ms]" />
                    <i className="size-1.5 animate-pulse rounded-full bg-current opacity-40 [animation-delay:300ms]" />
                  </span>
                )}
              </li>
            );
          })}
        </ol>



        <PreviousRounds rounds={previous} label={previousRoundLabel} />
      </div>
    </ScrollArea>
  );
}

export const MemoSuggestionStage = React.memo(SuggestionStage);
