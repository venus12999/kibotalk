import * as React from "react";
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Languages,
  MessageSquare,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useKibo } from "@/lib/kibo/store";

const STORAGE_KEY = "kibo.onboarding.v1";

const copy = {
  zh: {
    kicker: "新手导览",
    skip: "跳过",
    back: "上一步",
    next: "下一步",
    done: "开始使用",
    openGuide: "查看完整指南",
    steps: [
      {
        title: "语音主界面",
        body: "中间的小球会随音量呼吸。左侧浮现最近的对话（对方深黄、你自己深色字），右侧浮现三条回复思路。用开始 / 暂停 / 结束控制整场会话。",
      },
      {
        title: "三条回复思路",
        body: "每次固定给三条，逐字流式打出，含可直接照读的句子（日语假名、中文拼音）。失败可重试；你抢着接话时会自动中断。",
      },
      {
        title: "设置",
        body: "在这里选对话语言、水平、翻译语言、音频来源（麦克风 / 系统音频）以及采集模式（按住说话 / 持续聆听）。",
      },
      {
        title: "我的资料与记忆",
        body: "点右上角头像进入。填好称呼、身份、目标与语气偏好，再记下长期背景，AI 生成思路时会参考这些内容。",
      },
      {
        title: "账号与历史",
        body: "登录后会话自动云同步，点历史图标随时回看；邮箱注册需点验证链接，忘记密码可邮箱重置。",
      },
    ],
  },
  ja: {
    kicker: "はじめてガイド",
    skip: "スキップ",
    back: "戻る",
    next: "次へ",
    done: "始める",
    openGuide: "詳しいガイドを見る",
    steps: [
      {
        title: "音声会話メイン画面",
        body: "中央の球が音量に合わせて動きます。左に直近の会話、右にヒントが表示され、開始／一時停止／終了で操作します。",
      },
      {
        title: "3 つの返答ヒント",
        body: "常に 3 つ、1 文字ずつストリーミング表示。そのまま読める文つき（ふりがな・ピンイン対応）。再試行も可能です。",
      },
      {
        title: "設定",
        body: "会話言語・レベル・翻訳言語・音声ソース・取り込みモード（押して話す／常時聞き取り）を選べます。",
      },
      {
        title: "プロフィールと記憶",
        body: "右上のアカウントメニューから。立場や目標、望むトーン、長期的な背景を登録するとヒントに反映されます。",
      },
      {
        title: "アカウントと履歴",
        body: "ログインでセッションが自動同期。履歴アイコンから振り返れます。メールは確認リンクで有効化します。",
      },
    ],
  },
  en: {
    kicker: "Quick tour",
    skip: "Skip",
    back: "Back",
    next: "Next",
    done: "Start using",
    openGuide: "Open full guide",
    steps: [
      {
        title: "Live voice stage",
        body: "The orb breathes with your input level. Recent turns float on the left, reply ideas on the right. Start, pause, and stop control the session.",
      },
      {
        title: "Three reply ideas",
        body: "Always three, streamed token by token, each with a ready-to-say line (furigana / pinyin). Retry on failure; ideas stop if you jump in.",
      },
      {
        title: "Settings",
        body: "Pick conversation language, level, translation language, audio source (mic / system) and capture mode (hold to talk / always listening).",
      },
      {
        title: "Profile & memory",
        body: "Open it from the account menu. Add your role, goals and tone, plus long-term notes — the AI uses them when writing ideas.",
      },
      {
        title: "Account & history",
        body: "Signed-in sessions sync to the cloud and stay in History. Email sign-up is confirmed via link, and passwords can be reset by email.",
      },
    ],
  },
} as const;

const icons = [MessageSquare, Sparkles, Settings2, Brain, Languages];

/** First-run walkthrough of the main features, shown once per browser. */
export function OnboardingTour({ onOpenGuide }: { onOpenGuide?: () => void }) {
  const { prefs } = useKibo();
  const c = copy[prefs.uiLang] ?? copy.en;
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const close = React.useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const current = c.steps[step]!;
  const Icon = icons[step] ?? MessageSquare;
  const last = step === c.steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogContent className="glass-panel max-w-md gap-0 p-5">
        <div className="flex items-center gap-3">
          <span className="gradient-primary glow-sm flex size-10 shrink-0 items-center justify-center rounded-full text-primary-foreground">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {c.kicker} · {step + 1}/{c.steps.length}
            </p>
            <DialogTitle className="truncate text-base font-bold">{current.title}</DialogTitle>
          </div>
        </div>

        <DialogDescription className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {current.body}
        </DialogDescription>

        <div className="mt-4 flex items-center gap-1.5">
          {c.steps.map((s, i) => (
            <span
              key={s.title}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "gradient-primary w-6" : "w-1.5 bg-foreground/15",
              )}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigator.vibrate?.(8);
              if (step === 0) close();
              else setStep((s) => s - 1);
            }}
          >
            {step === 0 ? (
              c.skip
            ) : (
              <>
                <ChevronLeft className="size-4" /> {c.back}
              </>
            )}
          </Button>
          <div className="flex items-center gap-2">
            {last && onOpenGuide && (
              <Button
                variant="soft"
                size="sm"
                onClick={() => {
                  close();
                  onOpenGuide();
                }}
              >
                {c.openGuide}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                navigator.vibrate?.(8);
                if (last) close();
                else setStep((s) => s + 1);
              }}
            >
              {last ? (
                c.done
              ) : (
                <>
                  {c.next} <ChevronRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
