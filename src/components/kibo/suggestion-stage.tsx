import * as React from "react";
import { Sparkles, Clock } from "lucide-react";
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
const NoteCard = React.memo(function NoteCard({
  candidate,
  caret,
}: {
  candidate: Candidate;
  caret: boolean;
}) {
  const total = candidate.segments?.length
    ? candidate.segments.reduce((n, s) => n + s.t.length, 0)
    : candidate.text.length;

  return (
    <li className="sticky-note p-4">
      <p className="text-base leading-[2.1] font-semibold">
        <RubyText candidate={candidate} limit={total} />
        {caret ? (
          <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-current align-middle" />
        ) : null}
      </p>
      {candidate.meaning ? (
        <p className="mt-1.5 text-xs opacity-70">{candidate.meaning}</p>
      ) : null}
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

export type AiStatus = "idle" | "connecting" | "streaming" | "done" | "error";

/** A persistent banner so the user always knows what the model is doing. */
const StatusBar = React.memo(function StatusBar({
  status,
  errorMessage,
  labels,
  onRetry,
}: {
  status: AiStatus;
  errorMessage?: string;
  labels: { connecting: string; streaming: string; done: string; failed: string; retry: string };
  onRetry?: () => void;
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
    ) : status === "connecting" ? (
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
          : labels.streaming;

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
        {status === "error" && errorMessage ? (
          <span className="ml-1 font-normal opacity-80">{errorMessage}</span>
        ) : null}
      </span>
      {status === "streaming" ? (
        <span className="flex gap-0.5" aria-hidden>
          <i className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
          <i className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:120ms]" />
          <i className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:240ms]" />
        </span>
      ) : null}
      {status === "error" && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-[11px] font-bold hover:bg-destructive/10"
        >
          <RotateCw className="size-3" />
          {labels.retry}
        </button>
      ) : null}
    </div>
  );
});

export function SuggestionStage({
  rounds,
  streaming,
  status = "idle",
  errorMessage,
  statusLabels,
  onRetry,
  emptyHint,
  previousRoundLabel,
  className,
}: {
  rounds: Round[];
  streaming: boolean;
  status?: AiStatus;
  errorMessage?: string;
  statusLabels: {
    connecting: string;
    streaming: string;
    done: string;
    failed: string;
    retry: string;
  };
  onRetry?: () => void;
  emptyHint: string;
  previousRoundLabel: string;
  className?: string;
}) {
  const current = rounds[0];
  const previous = React.useMemo(() => rounds.slice(1, 3), [rounds]);

  if (!current && status === "idle") {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {emptyHint}
      </div>
    );
  }

  const last = current ? current.candidates.length - 1 : -1;

  return (
    <ScrollArea className={className}>
      {/* Isolate streaming text updates from the rest of the page layout. */}
      <div className="space-y-4 pr-3 [contain:content]">
        <StatusBar
          status={status}
          errorMessage={errorMessage}
          labels={statusLabels}
          onRetry={onRetry}
        />

        {current ? (
          <ol className="space-y-3">
            {current.candidates.map((c, i) => (
              <NoteCard key={i} candidate={c} caret={streaming && i === last} />
            ))}
          </ol>
        ) : null}

        <PreviousRounds rounds={previous} label={previousRoundLabel} />
      </div>
    </ScrollArea>
  );
}

export const MemoSuggestionStage = React.memo(SuggestionStage);
