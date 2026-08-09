export type UiLang = "ja" | "en" | "zh";
export type ConvLang = "ja" | "en" | "zh";
export type Level = "beginner" | "intermediate" | "advanced";
export type Theme = "system" | "light" | "dark";
export type AudioSource = "microphone" | "system" | "both";
export type Lifecycle = "idle" | "preparing" | "running" | "paused" | "stopped";

export type Prefs = {
  uiLang: UiLang;
  conversationLang: ConvLang;
  level: Level;
  theme: Theme;
  audioSource: AudioSource;
  micDeviceId: string;
  onboarded: boolean;
};

export type Turn = {
  id: string;
  speaker: "user" | "other";
  text: string;
  at: number;
  sttFailed?: boolean;
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
  level: "beginner",
  theme: "system",
  audioSource: "microphone",
  micDeviceId: "",
  onboarded: false,
};
