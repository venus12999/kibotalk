import { ArrowRight, Fingerprint } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { VoiceprintCard } from "./voiceprint-card";
import { useKibo } from "@/lib/kibo/store";
import { loadVoiceprint } from "@/lib/kibo/voiceprint";

const copy = {
  zh: {
    title: "录入声纹",
    body: "系统需要认识你的声音，才能在对话中分清哪句话是你说的。整个过程约 10 秒，声纹只保存在这台设备上。",
    skip: "稍后再录",
    next: "开始对话",
  },
  ja: {
    title: "声紋を登録",
    body: "会話中にあなたの発言を判別するために、声を登録します。約10秒で終わり、データは端末内にのみ保存されます。",
    skip: "あとで登録",
    next: "会話を始める",
  },
  en: {
    title: "Enroll your voiceprint",
    body: "The app needs to learn your voice so it can tell your lines apart during a conversation. It takes about 10 seconds and stays on this device.",
    skip: "Do this later",
    next: "Start talking",
  },
} as const;

export function VoiceprintStep({ onContinue }: { onContinue: () => void }) {
  const { prefs } = useKibo();
  const words = copy[prefs.uiLang] ?? copy.en;
  const [done, setDone] = React.useState(() => loadVoiceprint() !== null);

  return (
    <div className="paper-sheet w-full max-w-md p-5 sm:p-7">
      <div className="flex items-center gap-3">
        <span className="gradient-primary glow-sm flex size-9 shrink-0 items-center justify-center rounded-full text-primary-foreground">
          <Fingerprint className="size-4" />
        </span>
        <h1 className="text-lg font-bold tracking-tight sm:text-2xl">{words.title}</h1>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{words.body}</p>

      <div className="mt-5">
        <VoiceprintCard locked={false} onEnrolled={() => setDone(true)} />
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button size="pill" className="flex-1" variant={done ? "default" : "soft"} onClick={onContinue}>
          <ArrowRight className="size-4" />
          {done ? words.next : words.skip}
        </Button>
      </div>
    </div>
  );
}
