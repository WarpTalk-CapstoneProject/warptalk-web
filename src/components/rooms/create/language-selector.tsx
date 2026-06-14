import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { CheckCircle, Plus } from "@phosphor-icons/react/dist/ssr";

const languageOptions = [
  { code: "vi", label: "Vietnamese" },
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
];

function getFlagEmoji(locale: string) {
  if (!locale) return "";
  const parts = locale.split("-");
  let countryCode = parts.length > 1 ? parts[1].toUpperCase() : "";
  if (!countryCode) {
    const map: Record<string, string> = { en: "US", vi: "VN", ja: "JP", ko: "KR", fr: "FR", es: "ES" };
    countryCode = map[locale.toLowerCase()] || locale.toUpperCase();
  }
  const codePoints = countryCode.split("").map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function LanguageSelector({ 
  source, 
  onSourceChange, 
  targets, 
  onTargetsChange,
  isMultiLang
}: { 
  source: string; 
  onSourceChange: (lang: string) => void;
  targets: string[]; 
  onTargetsChange: (languages: string[]) => void;
  isMultiLang: boolean;
}) {
  function toggleTarget(code: string) {
    if (isMultiLang) {
      if (targets.includes(code)) {
        if (targets.length === 1) return; // Must have at least one target
        onTargetsChange(targets.filter((item) => item !== code));
      } else {
        onTargetsChange([...targets, code]);
      }
    } else {
      onTargetsChange([code]);
    }
  }

  const targetLang = targets.length > 0 ? targets[0] : "vi";

  return (
    <div className="flex items-center gap-1 px-1 py-1 rounded-full border border-border/60 bg-transparent select-none text-[13px]">
      <Popover>
        <PopoverTrigger className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-full cursor-pointer hover:bg-surface-2 transition-colors">
          <span className="leading-none text-[14px]">{getFlagEmoji(source)}</span>
          <span className="font-medium text-ink">{languageOptions.find(o => o.code === source)?.label.substring(0, 2).toUpperCase() || source.split('-')[0].toUpperCase()}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[180px] rounded-xl bg-canvas border-border/50 p-1.5 shadow-xl z-[100]">
          <Command className="bg-transparent">
            <CommandList>
              <CommandGroup heading="Source Language" className="text-[11px] text-ink-muted">
                {languageOptions.map((language) => {
                  const isSelected = source === language.code;
                  return (
                    <CommandItem
                      key={language.code}
                      onSelect={() => onSourceChange(language.code)}
                      className="rounded-md text-[13px] aria-selected:bg-surface-2 mb-0.5 cursor-pointer flex items-center gap-2"
                    >
                      <span className="text-[14px] leading-none">{getFlagEmoji(language.code)}</span>
                      <span className="truncate font-medium text-ink">{language.label}</span>
                      {isSelected && <CheckCircle weight="fill" className="ml-auto text-emerald-500 h-3.5 w-3.5" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <span className="text-muted-foreground/40 font-bold px-1">
        {isMultiLang ? (
          <span className="text-[13px]">;</span>
        ) : (
          <span className="text-[11px]">→</span>
        )}
      </span>

      <Popover>
        <PopoverTrigger className="flex items-center outline-none cursor-pointer">
          {targets.map((t, i) => (
            <div key={t} className="flex items-center">
              {i > 0 && <span className="text-muted-foreground/40 font-bold text-[13px] px-1">;</span>}
              <div className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-full hover:bg-surface-2 transition-colors">
                <span className="leading-none text-[14px]">{getFlagEmoji(t)}</span>
                {targets.length === 1 && !isMultiLang && (
                  <span className="font-medium text-ink">{languageOptions.find(o => o.code === targetLang)?.label.substring(0, 2).toUpperCase() || targetLang.split('-')[0].toUpperCase()}</span>
                )}
              </div>
            </div>
          ))}
          {isMultiLang && (
            <div className="flex items-center">
              <span className="text-muted-foreground/40 font-bold text-[13px] px-1">;</span>
              <div className="flex items-center justify-center px-2 py-[5px] rounded-full hover:bg-surface-2 transition-colors">
                <Plus weight="bold" size={12} className="text-ink-muted" />
              </div>
            </div>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[180px] rounded-xl bg-canvas border-border/50 p-1.5 shadow-xl z-[100]">
          <Command className="bg-transparent">
            <CommandList>
              <CommandGroup heading="Target Languages" className="text-[11px] text-ink-muted">
                {languageOptions.map((language) => {
                  const isSelected = targets.includes(language.code);
                  return (
                    <CommandItem
                      key={language.code}
                      onSelect={() => toggleTarget(language.code)}
                      className="rounded-md text-[13px] aria-selected:bg-surface-2 mb-0.5 cursor-pointer flex items-center gap-2"
                    >
                      <span className="text-[14px] leading-none">{getFlagEmoji(language.code)}</span>
                      <span className="truncate font-medium text-ink">{language.label}</span>
                      {isSelected && <CheckCircle weight="fill" className="ml-auto text-emerald-500 h-3.5 w-3.5" />}
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
