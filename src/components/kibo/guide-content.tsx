import * as React from "react";
import {
  Brain,
  Check,
  CircleDot,
  Hand,
  Headphones,
  Languages,
  Lightbulb,
  MessageSquare,
  Radio,
  Settings2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PillGroup } from "./pill-group";
import { useKibo } from "@/lib/kibo/store";
import type { CaptureMode } from "@/lib/kibo/types";

const copy = {
  zh: {
    featuresTitle: "全部功能一览",
    featuresIntro: "下面是当前版本里你能用到的每一项功能。",
    fStage: "语音对话主界面",
    fStageBody: [
      "中间的黄色小球会随着音量呼吸缩放，说明正在采集声音。",
      "球体左侧浮现最近的对话：对方是深黄色，你自己是深色字，旧的一条会淡出上滑。",
      "球体右侧浮现三条回复思路，逐条淡入；每条下方有含义说明。",
      "点击开始 / 暂停 / 结束按钮控制整场会话。",
    ],
    fIdeas: "回复思路（每次固定三条）",
    fIdeasBody: [
      "由 DeepSeek V4 Flash 生成，流式逐字输出，不用等整段写完。",
      "包含可直接照读的句子，日语带假名注音；每条附带你的界面语言释义。",
      "生成失败时点「重试」，会带着原来的上下文重新生成。",
      "你抢着接话时，正在输出的思路会自动中断，避免干扰。",
    ],
    fSettings: "设置",
    fSettingsBody: [
      "对话语言、你的水平、翻译语言：决定转写与思路的语言与难度。",
      "音频来源：面对面选麦克风，线上通话选系统音频，也可两者同时。",
      "采集模式：按住说话 / 持续聆听，随时切换。",
      "界面语言与设备选择也在这里，手机上重复的麦克风已自动去重。",
    ],
    fMemory: "我的资料与记忆",
    fMemoryBody: [
      "在右上角头像菜单里进入「我的资料与记忆」。",
      "资料卡片：称呼、母语、城市时区、身份、年龄段，以及学习目标、常用场景、期望语气等多选标签。",
      "记忆条目：随手记下长期背景，可置顶、可配图，AI 生成思路时会参考。",
      "所有内容登录后自动云同步，换设备继续用。",
    ],
    fAccount: "账号与历史",
    fAccountBody: [
      "邮箱注册需点击验证邮件里的链接；忘记密码可通过邮箱重置。",
      "登录后会话记录自动上云，点右上角历史图标可展开回看完整转写。",
      "管理员账号会在头像菜单里多出「管理后台」入口。",
    ],
    title: "两种模式，怎么用才顺手",
    intro:
      "对方说完一句，系统会自动生成三条回复思路。两种采集模式只决定「怎么断句」，不改变自动出思路。",
    modeLabel: "先选一种模式试试",
    push: "按住说话",
    pushShort: "最稳",
    continuous: "持续聆听",
    continuousShort: "更自然",
    pushTitle: "按住说话（推荐新手）",
    pushBody: [
      "谁在说话，就按住谁的按钮：自己说按「我说」，对方说按「对方说」。",
      "松手 = 这句话结束；如果是对方说完，会立刻自动生成三条思路。",
      "按住时手指可以滑出按钮，仍然在录，松开才结束。",
      "同时开麦克风+系统音频时，只会录你按住的那一路，不会串录。",
    ],
    contTitle: "持续聆听（自动断句 + 自动思路）",
    contBody: [
      "开始后一直转写；静音一小段会被自动切成一句。",
      "对方每说完一句，三条思路会自动出现；也可再点「给我思路」重问。",
      "先切换「当前说话人」再让对方说，转写归属才正确。",
      "适合线上会议、播客等你腾不出手的场景。",
    ],
    drill: "3 分钟测试流程",
    steps: [
      "打开设置，确认对话语言、翻译语言和音频来源（面对面用麦克风，线上通话用系统音频）。",
      "选择「按住说话」，开始会话，按住「对方说」念一句话，松手，观察转写与自动生成的三条思路。",
      "在思路输出时按住「我说」，思路应立刻中断，说明打断逻辑正常。",
      "切到「持续聆听」，让对方说两三句，确认每句结束后思路会自动刷新。",
    ],
    tips: "让断句更稳的小技巧",
    tipList: [
      "按住说话时：一句话说完再松手，不要在中间停顿超过 1 秒松手。",
      "同时采集麦克风和系统音频时戴耳机，避免外放回声互相干扰。",
      "环境很吵时优先用「按住说话」，它不依赖静音检测。",
      "持续聆听时对方说完稍停一下，方便自动切句；也可随时点「给我思路」重问。",
    ],
    done: "已完成",
    progress: "{a}/{b} 步已完成",
  },
  ja: {
    featuresTitle: "機能一覧",
    featuresIntro: "現在のバージョンで使えるすべての機能です。",
    fStage: "音声会話メイン画面",
    fStageBody: [
      "中央の球が音量に合わせて呼吸するように動きます。",
      "左側に直近の会話が表示されます（相手は濃い黄色、自分は濃い文字色）。",
      "右側に 3 つのヒントがフェードインします。各ヒントの下に意味の説明があります。",
      "開始／一時停止／終了ボタンでセッションを操作します。",
    ],
    fIdeas: "返答のヒント（常に 3 つ）",
    fIdeasBody: [
      "DeepSeek V4 Flash がストリーミングで生成します。",
      "そのまま読める文つき。日本語はふりがな、中国語はピンイン付き。",
      "失敗時は「再試行」で同じ文脈のまま再生成します。",
      "あなたが話し始めると、生成中のヒントは自動で止まります。",
    ],
    fSettings: "設定",
    fSettingsBody: [
      "会話言語・レベル・翻訳言語を選べます。",
      "音声ソース：対面はマイク、オンラインはシステム音声、両方も可能。",
      "取り込みモード：押して話す／常時聞き取りをいつでも切り替え。",
      "表示言語とデバイス選択もここにあります。",
    ],
    fMemory: "プロフィールと記憶",
    fMemoryBody: [
      "右上のアカウントメニューから開きます。",
      "呼び名・母語・都市・立場・年代、目標や場面、望むトーンをタグで設定。",
      "長期的な背景を記憶として保存でき、画像添付とピン留めも可能。",
      "ログインすると自動でクラウド同期されます。",
    ],
    fAccount: "アカウントと履歴",
    fAccountBody: [
      "メール登録は確認リンクをクリック。パスワードは再設定できます。",
      "セッション履歴は自動保存され、履歴アイコンから確認できます。",
      "管理者にはメニューに「管理画面」が表示されます。",
    ],
    title: "2 つのモードの使い分け",
    intro:
      "相手の一文が終わると、3つの返答ヒントが自動で出ます。モードは「どう区切るか」だけを変え、自動ヒントは共通です。",
    modeLabel: "まずモードを選ぶ",
    push: "押して話す",
    pushShort: "最も安定",
    continuous: "常時聞き取り",
    continuousShort: "自然",
    pushTitle: "押して話す（初めての方におすすめ）",
    pushBody: [
      "話している人のボタンを押し続けます（自分／相手）。",
      "離した瞬間に 1 文が確定。相手側ならすぐ 3 つのヒントが自動生成されます。",
      "押している間は指がボタンから外れても録音は続きます。",
      "マイク＋システム音声の同時取得時は、押している側だけを録ります。",
    ],
    contTitle: "常時聞き取り（自動区切り＋自動ヒント）",
    contBody: [
      "開始後はずっと文字起こし。短い無音で一文に区切られます。",
      "相手の一文が終わるたびにヒントが自動更新。必要なら「ヒントをもらう」で再生成も可。",
      "話者を切り替えてから相手に話してもらうと、話者の割り当てが正確になります。",
      "オンライン会議やポッドキャストに向いています。",
    ],
    drill: "3 分間のテスト手順",
    steps: [
      "設定で会話言語・翻訳言語・音声ソースを確認します。",
      "「押して話す」を選び、「相手」を押しながら 1 文読み、離して転写と自動ヒントを確認します。",
      "ヒント生成中に「自分」を押すと、生成がすぐ止まることを確認します。",
      "「常時聞き取り」に切り替え、2〜3 文話して文ごとにヒントが更新されるか確認します。",
    ],
    tips: "区切りを安定させるコツ",
    tipList: [
      "押して話すときは、文を言い終わってから離す。",
      "マイクとシステム音声を同時に取る場合はイヤホンを使う。",
      "騒音下では「押して話す」を優先する（無音検出に依存しない）。",
      "常時聞き取りでは相手が言い終わって少し間を置くと区切りやすい。",
    ],
    done: "完了",
    progress: "{a}/{b} 完了",
  },
  en: {
    featuresTitle: "Everything you can do",
    featuresIntro: "A full tour of the features in the current version.",
    fStage: "Live voice stage",
    fStageBody: [
      "The orb in the middle breathes with your input level while audio is captured.",
      "Recent turns float to its left — the other person in deep amber, you in a dark readable tone.",
      "Three reply ideas float to its right, each with a short meaning line underneath.",
      "Start, pause, and stop buttons control the whole session.",
    ],
    fIdeas: "Reply ideas (always three)",
    fIdeasBody: [
      "Generated by DeepSeek V4 Flash and streamed token by token.",
      "Each includes a ready-to-say line, with furigana for Japanese and pinyin for Chinese.",
      "If generation fails, Retry reuses the original context.",
      "If you jump in and speak, the streaming ideas stop automatically.",
    ],
    fSettings: "Settings",
    fSettingsBody: [
      "Conversation language, your level, and translation language shape the transcript and ideas.",
      "Audio source: microphone in person, system audio for calls, or both at once.",
      "Capture mode: hold to talk or always listening, switchable any time.",
      "Interface language and device pickers live here too; duplicate phone mics are deduplicated.",
    ],
    fMemory: "Profile & memory",
    fMemoryBody: [
      "Open it from the account menu in the top right.",
      "Profile card: name, native language, city/timezone, role, age range, plus goal/scene/tone tags.",
      "Memory notes hold long-term context, can be pinned, and support image attachments.",
      "Everything syncs to the cloud once you are signed in.",
    ],
    fAccount: "Account & history",
    fAccountBody: [
      "Email sign-up is confirmed via link; passwords can be reset by email.",
      "Sessions are saved automatically — open History and expand a row to read the full transcript.",
      "Admins get an extra Admin dashboard entry in the account menu.",
    ],
    title: "Two modes — how they actually behave",
    intro:
      "When the other person finishes a line, three reply ideas appear automatically. The two capture modes only change how turns are cut — not whether ideas auto-fire.",
    modeLabel: "Pick a mode to try",
    push: "Hold to talk",
    pushShort: "Most reliable",
    continuous: "Always listening",
    continuousShort: "Hands-free",
    pushTitle: "Hold to talk (best to start with)",
    pushBody: [
      "Hold the button of whoever is speaking — “me” or “other”.",
      "Releasing ends the line; if it was the other person, three ideas generate right away.",
      "Your finger can slide off the button while holding; only release stops it.",
      "With mic + system audio, only the held side is recorded — no cross-talk.",
    ],
    contTitle: "Always listening (auto-cut + auto ideas)",
    contBody: [
      "Transcription runs continuously; a short silence cuts a turn.",
      "Each finished “other” line refreshes the three ideas; “Give me ideas” re-asks anytime.",
      "Switch the current speaker before the other person talks so lines are attributed correctly.",
      "Best for online meetings or podcasts when your hands are busy.",
    ],
    drill: "3-minute test drill",
    steps: [
      "Open Settings and confirm conversation language, translation language, and audio source.",
      "Choose “Hold to talk”, start, hold “other”, read one sentence, release, and check transcript + auto ideas.",
      "While ideas stream, hold “me” — generation should stop instantly.",
      "Switch to “Always listening”, let two or three lines land, and confirm ideas refresh after each.",
    ],
    tips: "Tips for stable turn breaks",
    tipList: [
      "In hold-to-talk, finish the sentence before releasing.",
      "Wear headphones when capturing microphone and system audio together.",
      "In noisy places prefer hold-to-talk — it never relies on silence detection.",
      "In always-listening, pause briefly after they finish so the auto-cut can fire.",
    ],
    done: "Done",
    progress: "{a}/{b} steps done",
  },
} as const;

function Block({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: readonly string[];
}) {
  return (
    <div className="glass-quiet rounded-xl p-3.5">
      <div className="flex items-center gap-2">
        <span className="gradient-primary glow-sm flex size-7 shrink-0 items-center justify-center rounded-full text-primary-foreground">
          {icon}
        </span>
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((line) => (
          <li key={line} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <CircleDot className="mt-0.5 size-3 shrink-0 text-primary/70" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shared guide body: mode explainer, interactive drill checklist, and tips. */
export function GuideContent() {
  const { prefs, setPrefs } = useKibo();
  const c = copy[prefs.uiLang] ?? copy.en;
  const [checked, setChecked] = React.useState<number[]>([]);

  const toggle = (i: number) => {
    navigator.vibrate?.(8);
    setChecked((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold tracking-tight">{c.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.intro}</p>
      </div>

      <PillGroup<CaptureMode>
        label={c.modeLabel}
        value={prefs.captureMode}
        onChange={(v) => setPrefs({ captureMode: v })}
        options={[
          { value: "push", label: c.push, description: c.pushShort },
          { value: "continuous", label: c.continuous, description: c.continuousShort },
        ]}
      />

      <div>
        <h3 className="text-sm font-bold tracking-tight">{c.featuresTitle}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.featuresIntro}</p>
      </div>
      <Block icon={<MessageSquare className="size-3.5" />} title={c.fStage} items={c.fStageBody} />
      <Block icon={<Sparkles className="size-3.5" />} title={c.fIdeas} items={c.fIdeasBody} />
      <Block
        icon={<Settings2 className="size-3.5" />}
        title={c.fSettings}
        items={c.fSettingsBody}
      />
      <Block icon={<Brain className="size-3.5" />} title={c.fMemory} items={c.fMemoryBody} />
      <Block icon={<Languages className="size-3.5" />} title={c.fAccount} items={c.fAccountBody} />

      <Block icon={<Hand className="size-3.5" />} title={c.pushTitle} items={c.pushBody} />
      <Block icon={<Radio className="size-3.5" />} title={c.contTitle} items={c.contBody} />

      <div className="glass-quiet rounded-xl p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="gradient-primary glow-sm flex size-7 shrink-0 items-center justify-center rounded-full text-primary-foreground">
              <Lightbulb className="size-3.5" />
            </span>
            <h3 className="text-sm font-bold">{c.drill}</h3>
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground">
            {c.progress
              .replace("{a}", String(checked.length))
              .replace("{b}", String(c.steps.length))}
          </span>
        </div>
        <ol className="mt-2 space-y-1.5">
          {c.steps.map((step, i) => {
            const on = checked.includes(i);
            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={on}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-left transition-all",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    on ? "bg-primary/10" : "hover:bg-foreground/5",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                      on
                        ? "gradient-primary border-transparent text-primary-foreground"
                        : "border-foreground/25 text-muted-foreground",
                    )}
                  >
                    {on ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "text-xs leading-relaxed",
                      on ? "text-foreground/60 line-through" : "text-muted-foreground",
                    )}
                  >
                    {step}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <Block icon={<Headphones className="size-3.5" />} title={c.tips} items={c.tipList} />
    </div>
  );
}
