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
    <div className="space-y-1.5">
      {label ? <p className="text-xs font-semibold text-foreground/70">{label}</p> : null}
      <div
        role="radiogroup"
        aria-label={label}
        className="glass-quiet flex w-full items-stretch gap-1 rounded-xl p-1"
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
                "min-w-0 flex-1 cursor-pointer rounded-lg px-1.5 py-2 text-sm font-semibold transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "flex flex-col items-center justify-center gap-0.5 text-center leading-tight",
                active
                  ? "gradient-primary text-primary-foreground glow shadow-sm"
                  : "text-foreground/70 hover:text-foreground",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="w-full break-words">{opt.label}</span>
              {opt.description ? (
                <span className="w-full text-[10px] font-medium break-words opacity-80">
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
