import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string };

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
      {label ? (
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      ) : null}
      <div
        role="radiogroup"
        aria-label={label}
        className="glass-quiet flex w-full items-center gap-1 rounded-xl p-1"
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
                "flex-1 cursor-pointer rounded-lg px-2 py-1.5 text-sm font-semibold transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}


