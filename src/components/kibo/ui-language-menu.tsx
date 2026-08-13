import { Languages, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useKibo } from "@/lib/kibo/store";
import type { UiLang } from "@/lib/kibo/types";

const labels: Record<UiLang, string> = { ja: "日本語", en: "English", zh: "中文" };

type Props = {
  /** Icon-only trigger for black/white home header. */
  compact?: boolean;
};

export function UiLanguageMenu({ compact = false }: Props) {
  const { prefs, setPrefs, t } = useKibo();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("uiLanguage")} · ${labels[prefs.uiLang]}`}
        title={t("uiLanguage")}
        className={
          compact
            ? "glass-chip inline-flex size-10 cursor-pointer items-center justify-center rounded-[0.85rem] text-foreground transition hover:brightness-[1.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97]"
            : "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-3"
        }
      >
        {compact ? (
          <Languages className="size-4" strokeWidth={1.75} />
        ) : (
          <>
            <Languages className="size-3.5" />
            <span className="hidden sm:inline">{labels[prefs.uiLang]}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {(Object.keys(labels) as UiLang[]).map((lang) => (
          <DropdownMenuItem key={lang} onSelect={() => setPrefs({ uiLang: lang })}>
            {labels[lang]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
