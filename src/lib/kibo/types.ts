export type UiLang = "ja" | "en" | "zh";
export type ConvLang = "ja" | "en" | "zh";
export type Level = "beginner" | "intermediate" | "advanced";
export type Theme = "system" | "light" | "dark";
export type AudioSource = "microphone" | "system" | "both";
export type Lifecycle = "idle" | "preparing" | "running" | "paused" | "stopped";
/** How turns are captured: hold a button, or listen non-stop and ask manually. */
export type CaptureMode = "push" | "continuous";
/** How the transcript and suggestion panels are arranged. */
export type PanelLayout = "auto" | "row" | "column";

export type Prefs = {
  uiLang: UiLang;
  conversationLang: ConvLang;
  /** Language the other person's lines are translated into for the user. */
  translateLang: ConvLang;
  level: Level;
  theme: Theme;
  audioSource: AudioSource;
  micDeviceId: string;
  captureMode: CaptureMode;
  panelLayout: PanelLayout;
  /** Manual typography tuning for the side-by-side (row) layout. 1 = default. */
  rowFontScale: number;
  rowLineScale: number;
  rowGapScale: number;
  onboarded: boolean;

};

export type Turn = {
  id: string;
  speaker: "user" | "other";
  text: string;
  at: number;
  sttFailed?: boolean;
  /** Translation of `text` into the user's chosen translation language. */
  translation?: string;
};


/** One word/morpheme span of a suggested reply, with reading for ruby text. */
export type Segment = {
  /** Surface form as written. */
  t: string;
  /** Reading (furigana / pinyin); empty when the surface needs no gloss. */
  r?: string;
  role?: "content" | "particle" | "punct";
};

export type Candidate = {
  text: string;
  meaning: string;
  segments?: Segment[];
};


export type Round = {
  id: string;
  prompt: string;
  candidates: Candidate[];
};

export type SessionRecord = {
  id: string;
  startedAt: number;
  endedAt: number;
  conversationLang: ConvLang;
  level: Level;
  turns: Turn[];
  summary: string;
};

export const defaultPrefs: Prefs = {
  uiLang: "en",
  conversationLang: "ja",
  translateLang: "en",
  level: "beginner",

  theme: "system",
  audioSource: "microphone",
  micDeviceId: "",
  captureMode: "push",
  panelLayout: "auto",
  rowFontScale: 1,
  rowLineScale: 1,
  rowGapScale: 1,
  onboarded: false,

};
