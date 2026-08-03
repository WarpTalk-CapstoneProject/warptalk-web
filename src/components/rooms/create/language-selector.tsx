import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { CheckCircle, Plus } from "@phosphor-icons/react/dist/ssr";
import { getFlagEmoji } from "@/lib/language-flag";

const languageOptions = [
  { code: "vi-VN", label: "Vietnamese" },
  { code: "en-US", label: "English" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "fr-FR", label: "French" },
  { code: "es-ES", label: "Spanish" },
];

/**
 * Meeting-language picker. A meeting is defined by the SET of languages that will be
 * spoken in it (no source→target direction). Each participant's own speak/listen
 * language comes from their profile at join time; this set just declares which
 * languages the room expects, which bounds AI transcription/translation and reduces
 * hallucination. At least one language must always remain selected.
 */
export function LanguageSelector({
  languages,
  onLanguagesChange,
}: {
  languages: string[];
  onLanguagesChange: (languages: string[]) => void;
}) {
  function toggleLanguage(code: string) {
    if (languages.includes(code)) {
      if (languages.length === 1) return; // Must keep at least one language
      onLanguagesChange(languages.filter((item) => item !== code));
    } else {
      onLanguagesChange([...languages, code]);
    }
  }

  return (
    <div className="flex items-center gap-1 px-1 py-1 rounded-full border border-border/60 bg-transparent select-none text-[13px]">
      <Popover>
        <PopoverTrigger className="flex items-center outline-none cursor-pointer">
          {languages.map((code, i) => (
            <div key={code} className="flex items-center">
              {i > 0 && <span className="text-muted-foreground/40 font-bold text-[13px] px-1">;</span>}
              <div className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-full hover:bg-surface-2 transition-colors">
                <span className="leading-none text-[14px]">{getFlagEmoji(code)}</span>
                {languages.length === 1 && (
                  <span className="font-medium text-ink">
                    {languageOptions.find(o => o.code === code)?.label.substring(0, 2).toUpperCase() || code.split('-')[0].toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-center">
            <span className="text-muted-foreground/40 font-bold text-[13px] px-1">;</span>
            <div className="flex items-center justify-center px-2 py-[5px] rounded-full hover:bg-surface-2 transition-colors">
              <Plus weight="bold" size={12} className="text-ink-muted" />
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[180px] rounded-xl bg-canvas border-border/50 p-1.5 shadow-xl z-[100]">
          <Command className="bg-transparent">
            <CommandList>
              <CommandGroup heading="Meeting languages" className="text-[11px] text-ink-muted">
                {languageOptions.map((language) => {
                  const isSelected = languages.includes(language.code);
                  return (
                    <CommandItem
                      key={language.code}
                      onSelect={() => toggleLanguage(language.code)}
                      className="w-full rounded-md text-[13px] aria-selected:bg-surface-2 mb-0.5 cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] leading-none">{getFlagEmoji(language.code)}</span>
                        <span className="truncate font-medium text-ink">{language.label}</span>
                      </div>
                      <div data-slot="command-shortcut" className="flex shrink-0 ml-auto items-center">
                        {isSelected && <CheckCircle weight="fill" color="#3b82f6" className="h-3.5 w-3.5" />}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
