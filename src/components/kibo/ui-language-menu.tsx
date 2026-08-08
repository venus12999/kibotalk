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
      <DropdownMenuTrigger className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Languages className="size-3.5" />
        {labels[prefs.uiLang]}
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
