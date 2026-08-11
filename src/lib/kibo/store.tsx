import * as React from "react";
import type { User } from "@supabase/supabase-js";
import { dict } from "./dict";
import { defaultPrefs, type Prefs, type SessionRecord } from "./types";
import type { UiLang } from "./types";
import { useSession } from "./use-session";
import {
  clearCloudSessions,
  deleteCloudSession,
  loadCloudPrefs,
  loadCloudSessions,
  saveCloudPrefs,
  saveCloudSession,
} from "./cloud";

const PREFS_KEY = "kibotalk.prefs";
const HISTORY_KEY = "kibotalk.history";

type TKey = keyof (typeof dict)["en"];

type Ctx = {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  t: (key: TKey) => string;
  history: SessionRecord[];
  addSession: (s: SessionRecord) => void;
  deleteSession: (id: string) => void;
  clearHistory: () => void;
  reset: () => void;
  hydrated: boolean;
  user: User | null;
  authLoading: boolean;
  syncing: boolean;
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
  const [syncing, setSyncing] = React.useState(false);
  const { user, loading: authLoading } = useSession();
  const userId = user?.id ?? null;
  const cloudReady = React.useRef(false);

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

  // Pull cloud state on sign-in, and push local-only sessions up once.
  React.useEffect(() => {
    cloudReady.current = false;
    if (!hydrated || !userId) return;
    let cancelled = false;
    setSyncing(true);
    (async () => {
      try {
        const [cloudPrefs, cloudSessions] = await Promise.all([
          loadCloudPrefs(userId),
          loadCloudSessions(userId),
        ]);
        if (cancelled) return;
        if (cloudPrefs) setPrefsState((p) => ({ ...p, ...cloudPrefs }));
        const cloudIds = new Set(cloudSessions.map((s) => s.id));
        const localOnly = history.filter((s) => !cloudIds.has(s.id));
        for (const s of localOnly) {
          try {
            s.id = await saveCloudSession(userId, s);
          } catch {
            /* ignore */
          }
        }
        if (cancelled) return;
        setHistory(
          [...localOnly, ...cloudSessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 50),
        );
      } finally {
        if (!cancelled) {
          cloudReady.current = true;
          setSyncing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, hydrated]);

  // Push preference changes to the cloud.
  React.useEffect(() => {
    if (!userId || !cloudReady.current) return;
    const id = window.setTimeout(() => void saveCloudPrefs(userId, prefs), 600);
    return () => window.clearTimeout(id);
  }, [prefs, userId]);

  // Light mode only: keep the UA color-scheme pinned so Android/Windows Chrome
  // never force-darkens our surfaces.
  React.useEffect(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  }, []);

  const value = React.useMemo<Ctx>(
    () => ({
      prefs,
      hydrated,
      user,
      authLoading,
      syncing,
      setPrefs: (patch) => setPrefsState((p) => ({ ...p, ...patch })),
      t: (key) => dict[prefs.uiLang][key],
      history,
      addSession: (s) => {
        setHistory((h) => [s, ...h].slice(0, 50));
        if (!userId) return;
        // Keep the local row's id in sync with the cloud row, otherwise a later
        // delete removes it locally but leaves the cloud copy behind.
        void (async () => {
          try {
            const cloudId = await saveCloudSession(userId, s);
            if (cloudId && cloudId !== s.id) {
              setHistory((h) => h.map((x) => (x.id === s.id ? { ...x, id: cloudId } : x)));
            }
          } catch {
            /* ignore */
          }
        })();
      },
      deleteSession: (id) => {
        setHistory((h) => h.filter((s) => s.id !== id));
        if (userId) void deleteCloudSession(userId, id);
      },

      clearHistory: () => {
        setHistory([]);
        if (userId) void clearCloudSessions(userId);
      },
      reset: () => {
        setHistory([]);
        setPrefsState(defaultPrefs);
        if (userId) void clearCloudSessions(userId);
      },
    }),
    [prefs, history, hydrated, user, authLoading, syncing, userId],
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
