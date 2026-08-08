import * as React from "react";
import { Sparkles, Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Round } from "@/lib/kibo/types";

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
  const [current, ...previous] = rounds;

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

  return (
    <ScrollArea className={className}>
      <div className="space-y-4 pr-3">
        {streaming ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4 animate-pulse text-primary" />
            {generatingLabel}
          </div>
        ) : null}

        {current ? (
          <ol className="space-y-3">
            {current.candidates.map((c, i) => (
              <li key={i} className="sticky-note p-4">
                <p className="text-base leading-relaxed font-semibold">
                  {c.text}
                  {streaming && i === current.candidates.length - 1 ? (
                    <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-current align-middle" />
                  ) : null}
                </p>
                <p className="mt-1.5 text-xs opacity-70">{c.meaning}</p>
              </li>
            ))}
          </ol>
        ) : null}


        {previous.slice(0, 2).map((round) => (
          <div key={round.id} className="rounded-md border border-border p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <Clock className="size-3" />
              {previousRoundLabel}
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
      </div>
    </ScrollArea>
  );
}

export const MemoSuggestionStage = React.memo(SuggestionStage);
