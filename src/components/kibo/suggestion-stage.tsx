import * as React from "react";
import {
  Sparkles,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCw,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Candidate, Round } from "@/lib/kibo/types";


/**
 * One sticky note. Text is rendered exactly as far as the stream has delivered
 * it — no client-side replay buffer — so characters appear the moment their
 * tokens land.
 */
const NOTE_TONES = ["idea-tone-1", "idea-tone-2", "idea-tone-3"] as const;

const NoteCard = React.memo(function NoteCard({
  candidate,
  caret,
  index,
}: {
  candidate: Candidate;
  caret: boolean;
  index: number;
  /** Kept for API compat with callers that still pass scrolling. */
  scrolling?: boolean;
}) {
  return (
    <li
      className={cn(
        "group relative flex min-w-0 items-start gap-2 transition-transform duration-300",
        NOTE_TONES[index % NOTE_TONES.length],
        "idea-rise",
      )}
      style={{ animationDelay: `${index * 90}ms` }}
    >
      {/* Index marker: plain bold number so the list stays compact. */}
      <span
        aria-hidden
        className={cn("mt-0.5 shrink-0 text-xs font-black opacity-60", caret && "animate-pulse")}
      >
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug font-semibold whitespace-pre-wrap break-words">
          {/* Japanese replies carry furigana; English/Chinese never do. */}
          {candidate.segments && candidate.segments.length > 0
            ? candidate.segments.map((s, si) =>
                s.r ? (
                  <ruby key={si}>
                    {s.t}
                    <rt>{s.r}</rt>
                  </ruby>
                ) : (
                  <React.Fragment key={si}>{s.t}</React.Fragment>
                ),
              )
            : candidate.text}
          {caret ? (
            <span className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse bg-current align-middle" />
          ) : null}
        </p>
        {candidate.meaning ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{candidate.meaning}</p>
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
        <div key={round.id}>
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
      ? "text-destructive"
      : status === "done"
        ? "text-muted-foreground"
        : "text-foreground/80";

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
      <div role="status" aria-live="polite" className={cn("text-xs", tone)}>
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
      className={cn("flex items-center gap-2 text-xs font-semibold", tone)}
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
  className,
  scrollRef,
  fontScale = 1,
  scrolling = false,
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
  className?: string;
  /** Lets the workbench observe/drive this panel's scrolling. */
  scrollRef?: React.Ref<HTMLDivElement>;
  fontScale?: number;
  /** Long replies only drift horizontally while the talk button is held. */
  scrolling?: boolean;
}) {
  const current = rounds[0];
  const previous = React.useMemo(() => rounds.slice(1, 3), [rounds]);
  const candidates = current?.candidates ?? [];
  // Three slots always exist: the panel keeps one stable height whether the
  // ideas are still streaming in or already complete.


  const slots = [0, 1, 2];

  return (
    <ScrollArea
      ref={scrollRef}
      className={cn("[&_[data-radix-scroll-area-viewport]>div]:!block", className)}
    >
      {/* Isolate streaming text updates from the rest of the page layout. */}
      <div
        className="suggest-scaled w-full max-w-full min-w-0 space-y-3 overflow-x-hidden pr-3 [contain:content]"
        style={{ "--suggest-scale": String(fontScale) } as React.CSSProperties}
      >
        {/* The status row keeps its slot even when idle, so the three ideas
            never jump upwards mid-read when the status clears. */}
        <div className="min-h-4">
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
        </div>


        <ol className="space-y-2">
          {slots.map((i) => {
            const c = candidates[i];
            if (c && c.text) {
              return (
                <NoteCard
                  key={i}
                  candidate={c}
                  // Each slot streams on its own, so every visible one types.
                  caret={streaming}
                  index={i}
                  scrolling={scrolling}
                />
              );
            }

            // Always reserve three slots so the panel height stays stable.
            return (
              <li
                key={i}
                aria-hidden={!streaming}
                className="flex min-h-[2rem] items-center gap-2 text-xs text-muted-foreground"
              >
                <span className="shrink-0 text-xs font-black opacity-30">{i + 1}</span>
                {streaming ? (
                  <span className="flex gap-1" aria-hidden>
                    <i className="size-1.5 animate-pulse rounded-full bg-current opacity-40" />
                    <i className="size-1.5 animate-pulse rounded-full bg-current opacity-40 [animation-delay:150ms]" />
                    <i className="size-1.5 animate-pulse rounded-full bg-current opacity-40 [animation-delay:300ms]" />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>

        {!streaming && candidates.every((c) => !c?.text) && rounds.length === 0 ? (
          <p className="empty-fade max-w-[18rem] text-xs leading-relaxed text-muted-foreground">
            {emptyHint}
          </p>
        ) : null}

        <PreviousRounds rounds={previous} label={previousRoundLabel} />
      </div>
    </ScrollArea>
  );
}

export const MemoSuggestionStage = React.memo(SuggestionStage);
