import * as React from "react";
import { Sparkles, Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Candidate, Round } from "@/lib/kibo/types";

/** One sticky note. Memoized on candidate identity so untouched notes never re-render. */
const NoteCard = React.memo(function NoteCard({
  candidate,
  caret,
}: {
  candidate: Candidate;
  caret: boolean;
}) {
  return (
    <li className="sticky-note p-4">
      <p className="text-base leading-relaxed font-semibold">
        {candidate.text}
        {caret ? (
          <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-current align-middle" />
        ) : null}
      </p>
      <p className="mt-1.5 text-xs opacity-70">{candidate.meaning}</p>
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

export function SuggestionStage({
  rounds,
  streaming,
  emptyHint,
  generatingLabel,
  previousRoundLabel,
  className,
}: {
  rounds: Round[];
  streaming: boolean;
  emptyHint: string;
  generatingLabel: string;
  previousRoundLabel: string;
  className?: string;
}) {
  const current = rounds[0];
  const previous = React.useMemo(() => rounds.slice(1, 3), [rounds]);

  if (!current && !streaming) {
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
        {streaming ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4 animate-pulse text-primary" />
            {generatingLabel}
          </div>
        ) : null}

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
