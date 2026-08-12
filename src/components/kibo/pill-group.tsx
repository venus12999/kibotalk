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
      {label ? <p className="text-xs font-medium text-foreground/65">{label}</p> : null}
      <div
        role="radiogroup"
        aria-label={label}
        className="flex w-full items-stretch gap-0.5 rounded-md border border-[var(--glass-border)] bg-[oklch(100%_0_0_/_0.18)] p-0.5 backdrop-blur-sm"
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
                "min-w-0 flex-1 cursor-pointer rounded-[5px] px-1.5 py-1.5 text-[13px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "flex flex-col items-center justify-center gap-0.5 text-center leading-tight",
                active
                  ? "bg-primary/85 text-primary-foreground shadow-[0_1px_0_oklch(100%_0_0_/_0.35)_inset]"
                  : "text-foreground/60 hover:bg-[oklch(100%_0_0_/_0.22)] hover:text-foreground",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="w-full break-words">{opt.label}</span>
              {opt.description ? (
                <span className="w-full text-[10px] font-normal break-words opacity-75">
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
