import * as React from "react";
import { dict } from "./dict";
import { defaultPrefs, type Prefs, type SessionRecord } from "./types";
import type { UiLang } from "./types";

const PREFS_KEY = "kibotalk.prefs";
const HISTORY_KEY = "kibotalk.history";

type TKey = keyof (typeof dict)["en"];

type Ctx = {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  t: (key: TKey) => string;
  history: SessionRecord[];
  addSession: (s: SessionRecord) => void;
  clearHistory: () => void;
  reset: () => void;
  hydrated: boolean;
};

const KiboContext = React.createContext<Ctx | null>(null);

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function KiboProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = React.useState<Prefs>(defaultPrefs);
  const [history, setHistory] = React.useState<SessionRecord[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setPrefsState(read(PREFS_KEY, defaultPrefs));
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    document.documentElement.lang = prefs.uiLang === "zh" ? "zh-CN" : prefs.uiLang;
  }, [prefs, hydrated]);

  React.useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history, hydrated]);

  React.useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = prefs.theme === "dark" || (prefs.theme === "system" && mq?.matches === true);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    if (prefs.theme !== "system" || !mq) return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [prefs.theme]);

  const value = React.useMemo<Ctx>(
    () => ({
      prefs,
      hydrated,
      setPrefs: (patch) => setPrefsState((p) => ({ ...p, ...patch })),
      t: (key) => dict[prefs.uiLang][key],
      history,
      addSession: (s) => setHistory((h) => [s, ...h].slice(0, 50)),
      clearHistory: () => setHistory([]),
      reset: () => {
        setHistory([]);
        setPrefsState(defaultPrefs);
      },
    }),
    [prefs, history, hydrated],
  );

  return <KiboContext.Provider value={value}>{children}</KiboContext.Provider>;
}

export function useKibo() {
  const ctx = React.useContext(KiboContext);
  if (!ctx) throw new Error("useKibo must be used inside KiboProvider");
  return ctx;
}

export function langLabel(lang: "ja" | "en" | "zh", ui: UiLang) {
  const map = { ja: "languageJapanese", en: "languageEnglish", zh: "languageChinese" } as const;
  return dict[ui][map[lang]];
}

export function levelLabel(level: "beginner" | "intermediate" | "advanced", ui: UiLang) {
  const map = {
    beginner: "levelBeginner",
    intermediate: "levelIntermediate",
    advanced: "levelAdvanced",
  } as const;
  return dict[ui][map[level]];
}

export type { TKey };
