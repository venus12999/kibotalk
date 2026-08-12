import * as React from "react";
import { useKibo } from "@/lib/kibo/store";
import { useSession } from "@/lib/kibo/use-session";
import type { ConvLang, Prefs } from "@/lib/kibo/types";
import { cn } from "@/lib/utils";

const NATIVE_LANGS: { value: ConvLang; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];

const ROLES = ["留学生", "上班族", "求职中", "旅行者", "其他"];
const AGES = ["18 以下", "18–22", "23–28", "29–35", "36+"];
const GOALS = ["现场接话", "打工面试", "旅行交流", "考试口语", "日常闲聊"];
const SCENES = ["便利店", "咖啡店", "车站", "医院", "面试", "宿舍"];
const TONES = ["自然口语", "礼貌敬语", "短句优先", "更自信"];
const STUCK = ["沉默", "笑一下", "说英文顶上", "看手机"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-foreground/60">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-full border border-[var(--glass-border)] bg-[var(--glass-quiet)] px-4 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:bg-[var(--glass)] focus-visible:ring-2 focus-visible:ring-ring backdrop-blur-md";

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "gradient-primary text-primary-foreground glow shadow-sm"
          : "border border-[var(--glass-border)] bg-[var(--glass-quiet)] text-foreground/70 backdrop-blur-sm hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ChipRow({
  label,
  options,
  values,
  onToggle,
}: {
  label: string;
  options: string[];
  values: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground/60">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o} label={o} active={values.includes(o)} onClick={() => onToggle(o)} />
        ))}
      </div>
    </div>
  );
}

const MULTI_KEYS = ["profileGoals", "profileScenes", "profileTones", "profileStuck"] as const;
type MultiKey = (typeof MULTI_KEYS)[number];

export function ProfileCard() {
  const { prefs, setPrefs, syncing } = useKibo();
  const { user } = useSession();

  const toggle = (key: MultiKey, value: string) => {
    const current = (prefs[key] as string[]) ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    setPrefs({ [key]: next } as Partial<Prefs>);
  };

  return (
    <section className="orb-sheet space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold tracking-tight">用户档案</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            身份、目标、偏好、场景、语气 —— Kibo 会照着这些来给回复思路。
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--glass-border)] bg-[var(--glass-quiet)] px-3 py-1 text-[11px] font-semibold text-foreground/80 backdrop-blur-sm">
          {syncing ? "同步中" : "可同步"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="怎么称呼你">
          <input
            className={inputClass}
            value={prefs.profileName}
            placeholder="林晚"
            maxLength={40}
            onChange={(e) => setPrefs({ profileName: e.target.value })}
          />
        </Field>
        <Field label="邮箱">
          <input
            className={cn(inputClass, "text-muted-foreground")}
            value={user?.email ?? ""}
            placeholder="you@example.com"
            readOnly
          />
        </Field>
        <Field label="母语">
          <select
            className={inputClass}
            value={prefs.profileNativeLang}
            onChange={(e) => setPrefs({ profileNativeLang: e.target.value as ConvLang })}
          >
            {NATIVE_LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="所在城市 / 时区">
          <input
            className={inputClass}
            value={prefs.profileCity}
            placeholder="东京 · GMT+9"
            maxLength={60}
            onChange={(e) => setPrefs({ profileCity: e.target.value })}
          />
        </Field>
        <Field label="身份">
          <select
            className={inputClass}
            value={prefs.profileRole}
            onChange={(e) => setPrefs({ profileRole: e.target.value })}
          >
            <option value="">未选择</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="年龄段">
          <select
            className={inputClass}
            value={prefs.profileAge}
            onChange={(e) => setPrefs({ profileAge: e.target.value })}
          >
            <option value="">未选择</option>
            {AGES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <ChipRow
        label="学习目标（可多选）"
        options={GOALS}
        values={prefs.profileGoals}
        onToggle={(v) => toggle("profileGoals", v)}
      />
      <ChipRow
        label="常用场景"
        options={SCENES}
        values={prefs.profileScenes}
        onToggle={(v) => toggle("profileScenes", v)}
      />
      <ChipRow
        label="希望答句语气"
        options={TONES}
        values={prefs.profileTones}
        onToggle={(v) => toggle("profileTones", v)}
      />
      <ChipRow
        label="卡壳时你通常会…"
        options={STUCK}
        values={prefs.profileStuck}
        onToggle={(v) => toggle("profileStuck", v)}
      />
    </section>
  );
}
