export type UiLang = "ja" | "en" | "zh";
export type ConvLang = "ja" | "en" | "zh";
export type Level = "beginner" | "intermediate" | "advanced";
export type Theme = "system" | "light" | "dark";
export type AudioSource = "microphone" | "system" | "both";
export type NodeId = "local" | "japan" | "relay";
export type Lifecycle = "idle" | "preparing" | "running" | "paused" | "stopped";

export type Prefs = {
  uiLang: UiLang;
  conversationLang: ConvLang;
  level: Level;
  theme: Theme;
  audioSource: AudioSource;
  launchAtLogin: boolean;
  defaultNode: NodeId;
  onboarded: boolean;
  voiceprint: boolean;
};

export type Turn = {
  id: string;
  speaker: "user" | "other";
  text: string;
  at: number;
  sttFailed?: boolean;
};

export type Candidate = {
  text: string;
  meaning: string;
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
  launchAtLogin: false,
  defaultNode: "japan",
  onboarded: false,
  voiceprint: false,
};
