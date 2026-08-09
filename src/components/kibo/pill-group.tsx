import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string; description?: string };

export function PillGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="glass-quiet flex w-full gap-2 rounded-2xl p-1.5"
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-center transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "gradient-primary glow-sm text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="text-sm font-semibold">{opt.label}</span>
              {opt.description ? (
                <span className="max-w-[120px] text-[10px] leading-tight opacity-90">
                  {opt.description}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

