export type UiLang = "ja" | "en" | "zh";
export type ConvLang = "ja" | "en" | "zh";
export type Level = "beginner" | "intermediate" | "advanced";
export type AudioSource = "microphone" | "system" | "both";
export type Lifecycle = "idle" | "preparing" | "running" | "paused" | "stopped";
/** How turns are captured: hold a button, or listen non-stop and ask manually. */
export type CaptureMode = "push" | "continuous";
/** How the transcript and suggestion panels are arranged. */
export type PanelLayout = "auto" | "row" | "column";
/** Whether the two side panels scroll together or on their own. */
export type ScrollSync = "linked" | "independent";
/** Phone dock presentation: floating rounded card, or an edge-anchored bar. */
export type DockStyle = "float" | "bar";
export type Prefs = {
  uiLang: UiLang;
  conversationLang: ConvLang;
  /** Language the other person's lines are translated into for the user. */
  translateLang: ConvLang;
  level: Level;
  audioSource: AudioSource;
  micDeviceId: string;
  captureMode: CaptureMode;
  panelLayout: PanelLayout;
  /** Linked = the two side panels follow each other while scrolling. */
  scrollSync: ScrollSync;
  /** Phone push-to-talk dock: floating card or bottom-edge bar. */
  dockStyle: DockStyle;
  /** Size multiplier for the phone dock controls. 1 = default. */
  dockScale: number;
  /** Collapsed dock hides hints and shrinks to bare talk buttons. */
  dockCollapsed: boolean;

  /** Manual typography tuning for the side-by-side (row) layout. 1 = default. */
  rowFontScale: number;
  rowLineScale: number;
  rowGapScale: number;
  /** Scale the suggestion font size up or down to fit the screen. 1 = default. */
  suggestionFontScale: number;
  /** Who the user is — fed to the coach so replies sound like them. */
  profileName: string;
  profileAbout: string;
  profileGoal: string;
  /** Extended profile used to personalise the coach's tone and examples. */
  profileNativeLang: ConvLang;
  profileCity: string;
  profileRole: string;
  profileAge: string;
  profileGoals: string[];
  profileScenes: string[];
  profileTones: string[];
  profileStuck: string[];
  /** Let the coach read the profile fields when generating ideas. */
  useProfileContext: boolean;
  /** Let the coach read saved long-term memories. */
  useMemoryContext: boolean;
  /** When true, finished “other” lines auto-trigger three reply ideas. */
  autoSuggest: boolean;
  /** Show buy-time phrases while waiting for suggestions. */
  showStallingTip: boolean;
  /** Vibration feedback on buttons / hold-to-talk. */
  hapticsEnabled: boolean;
  /** Developer panel for voice-activity diagnostics. */
  showVadDiagnostics: boolean;
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

  audioSource: "microphone",
  micDeviceId: "",
  captureMode: "push",
  panelLayout: "auto",
  scrollSync: "independent",
  dockStyle: "bar",
  dockScale: 1,
  dockCollapsed: true,

  rowFontScale: 1,
  rowLineScale: 1,
  rowGapScale: 1,
  suggestionFontScale: 1,
  profileName: "",
  profileAbout: "",
  profileGoal: "",
  profileNativeLang: "zh",
  profileCity: "",
  profileRole: "",
  profileAge: "",
  profileGoals: [],
  profileScenes: [],
  profileTones: [],
  profileStuck: [],

  useProfileContext: true,
  useMemoryContext: true,
  autoSuggest: true,
  showStallingTip: false,
  hapticsEnabled: true,
  showVadDiagnostics: false,
  onboarded: false,
};
