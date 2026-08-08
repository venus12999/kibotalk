import * as React from "react";
import { Check, Mic, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKibo } from "@/lib/kibo/store";
import { voiceprintPhrase } from "@/lib/kibo/mock";
import { cn } from "@/lib/utils";

type Stage = "intro" | "preparing" | "recording" | "processing" | "done";

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((n, i) => (
        <React.Fragment key={n}>
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
              n <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {n < step ? <Check className="size-3.5" /> : n}
          </span>
          {i < 2 ? (
            <span className={cn("h-px flex-1", n < step ? "bg-primary" : "bg-border")} />
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}

export function Voiceprint({ onDone }: { onDone: () => void }) {
  const { prefs, setPrefs, t } = useKibo();
  const [stage, setStage] = React.useState<Stage>("intro");
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (stage !== "recording") return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [stage]);

  const start = () => {
    setStage("preparing");
    window.setTimeout(() => {
      setElapsed(0);
      setStage("recording");
    }, 1200);
  };

  const stop = () => {
    setStage("processing");
    window.setTimeout(() => {
      setPrefs({ voiceprint: true });
      setStage("done");
    }, 1600);
  };

  const step: 1 | 2 | 3 = stage === "intro" ? 1 : stage === "done" ? 3 : 2;

  return (
    <div className="paper-sheet w-full max-w-md p-6 sm:p-7">
      <Stepper step={step} />

      {stage === "intro" ? (
        <>
          <h1 className="mt-5 text-xl font-bold tracking-tight">{t("recordVoiceTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("recordVoiceDescription")}</p>
          <Button size="pill" className="mt-6" onClick={start}>
            <Mic className="size-4" />
            {t("startRecording")}
          </Button>
        </>
      ) : null}

      {stage === "preparing" ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("preparingMicrophone")}</p>
      ) : null}

      {stage === "recording" ? (
        <>
          <p className="mt-5 text-xs font-semibold text-muted-foreground">{t("pleaseRead")}</p>
          <p className="sticky-note mt-2 p-4 text-sm leading-relaxed font-medium">
            {voiceprintPhrase[prefs.conversationLang]}
          </p>
          <div className="mt-5 flex items-center justify-center gap-1">
            {Array.from({ length: 16 }).map((_, i) => (
              <span
                key={i}
                className="kibo-bar h-6 w-1 rounded-full bg-primary"
                style={{ animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
          <p className="mt-3 text-center text-xs tabular-nums text-muted-foreground">
            {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
            {String(elapsed % 60).padStart(2, "0")} / 00:15
          </p>
          <Button size="pill" className="mt-5" onClick={stop}>
            <Square className="size-4" />
            {t("stopRecording")}
          </Button>
        </>
      ) : null}

      {stage === "processing" ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("processing")}</p>
      ) : null}

      {stage === "done" ? (
        <>
          <h1 className="mt-5 text-xl font-bold tracking-tight">{t("voiceprintSaved")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("voiceprintSavedDescription")}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground">
            <Check className="size-3.5" />
            {t("voiceprintSavedLocal")}
          </p>
          <Button size="pill" className="mt-6" onClick={onDone}>
            {t("enterSession")}
          </Button>
          <Button variant="soft" size="pill" className="mt-2" onClick={() => setStage("intro")}>
            <RotateCcw className="size-4" />
            {t("rerecord")}
          </Button>
        </>
      ) : null}
    </div>
  );
}
