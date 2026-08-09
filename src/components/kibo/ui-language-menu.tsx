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

export function UiLanguageMenu() {
  const { prefs, setPrefs } = useKibo();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-3">
        <Languages className="size-3.5" />
        <span className="hidden sm:inline">{labels[prefs.uiLang]}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
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
