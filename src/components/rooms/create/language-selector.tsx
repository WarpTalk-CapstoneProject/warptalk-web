import React from "react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { CheckCircle, Plus } from "@phosphor-icons/react/dist/ssr";
import {
  getLanguageCode,
  isLanguageAllowedByPolicy,
  meetingLanguagePickerOptions,
} from "@/lib/language/languages";
import { LanguageLabel } from "@/components/language/language-label";
import { normalizeLanguage } from "@/lib/language/language-profile";

/**
 * Meeting-language picker. A meeting is defined by the SET of languages that will be
 * spoken in it (no source→target direction). Each participant's own speak/listen
 * language comes from their profile at join time; this set just declares which
 * languages the room expects, which bounds AI transcription/translation and reduces
 * hallucination. At least one language must always remain selected.
 *
 * WT-271: the list is the "meeting" scope narrowed by the workspace's `allowedTargetLanguages`
 * policy. Languages the policy forbids are NOT listed — no greyed rows, no "Blocked" tag, no
 * footnote (owner, 1 Oct 2026; this reverses the earlier show-disabled design). The one
 * exception is a forbidden language the room already holds: it stays listed, selected, so the
 * host can remove it — see `meetingLanguagePickerOptions`. The server still validates the set
 * on save; hiding here is presentation only.
 *
 * A policy that is empty or absent means unrestricted — see `isLanguageAllowedByPolicy`.
 */
export function LanguageSelector({
  languages,
  onLanguagesChange,
  allowedTargetLanguages,
  readOnly = false,
}: {
  languages: string[];
  onLanguagesChange: (languages: string[]) => void;
  /** The workspace's `allowedTargetLanguages`, as bare ISO-639-1 codes. Empty ⇒ unrestricted. */
  allowedTargetLanguages?: string[] | null;
  /** When true, renders a static read-only pill without a popover or add button. */
  readOnly?: boolean;
}) {
  const t = useTranslations("rooms.create.language");
  // The picker offers locale tags ("vi-VN"); the server stores bare codes, because
  // LanguageHelper.NormalizeLanguageCode splits on the dash before saving. So a room that
  // already had Vietnamese came back as "vi", `["en","vi"].includes("vi-VN")` was false, the
  // row read as unselected, and clicking it appended another one — which the server then
  // normalised to a second "vi". One click, one duplicate, five times over in the report.
  //
  // Comparing the way the server does is the fix. Deduping on the way in is what heals the
  // rooms already carrying ["en","vi","vi","vi","vi","vi"]: the next save writes the clean
  // set, and until then the pills show one flag per language instead of five.
  const selected = languages.reduce<string[]>((unique, code) => {
    const bare = normalizeLanguage(code);
    return bare && !unique.some((item) => normalizeLanguage(item) === bare)
      ? [...unique, code]
      : unique;
  }, []);

  function isPicked(code: string) {
    const bare = normalizeLanguage(code);
    return selected.some((item) => normalizeLanguage(item) === bare);
  }

  function toggleLanguage(code: string) {
    if (isPicked(code)) {
      if (selected.length === 1) return; // Must keep at least one language
      const bare = normalizeLanguage(code);
      onLanguagesChange(selected.filter((item) => normalizeLanguage(item) !== bare));
    } else {
      // A forbidden language is never listed unpicked, but it never enters the set either,
      // even if something else calls this.
      if (!isLanguageAllowedByPolicy(code, allowedTargetLanguages)) return;
      onLanguagesChange([...selected, code]);
    }
  }

  // Rooms store locale tags, so the option value is the tag; the name comes from the registry
  // rather than being spelled out again here.
  const options = meetingLanguagePickerOptions(selected, allowedTargetLanguages).map((language) => ({
    code: language.locale,
    label: language.name,
  }));

  if (readOnly) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/60 bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.02)] select-none text-[12px]">
        {selected.map((code, i) => (
          <div key={code} className="flex items-center">
            {i > 0 && <span className="text-muted-foreground/40 px-1 text-[12px]">·</span>}
            <LanguageLabel value={code} showName={selected.length === 1} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 px-1 py-1 rounded-full border border-border/60 bg-transparent select-none text-[13px]">
      <Popover>
        <PopoverTrigger className="flex items-center outline-none cursor-pointer">
          {/* Separated by a middot, not a semicolon. A semicolon between two flags reads as a
              typo or a stray character — and the same control punctuated the gap before the
              "+" with one too, so the pill ended on a dangling mark. */}
          {selected.map((code, i) => (
            <div key={code} className="flex items-center">
              {i > 0 && <span className="text-muted-foreground/40 px-0.5 text-[13px]">·</span>}
              <div className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-full hover:bg-surface-2 transition-colors">
                {/* Full name rather than the first two letters of it: "VI" is not a language
                    anyone recognises, and a single picked language has room to say so. Several
                    at once stay flags-only, where the label carries the name on hover. */}
                <LanguageLabel value={code} showName={selected.length === 1} />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-center px-2 py-[5px] rounded-full hover:bg-surface-2 transition-colors">
            <Plus weight="bold" size={12} className="text-ink-muted" />
          </div>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[210px] rounded-xl bg-surface-1 border-border/50 p-1.5 shadow-xl z-[100]">
          <Command className="bg-transparent">
            <CommandList>
              <CommandGroup heading={t("heading")} className="text-[11px] text-ink-muted">
                {options.map((language) => {
                  const isSelected = isPicked(language.code);
                  return (
                    <CommandItem
                      key={language.code}
                      onSelect={() => toggleLanguage(language.code)}
                      className="w-full rounded-md text-[13px] aria-selected:bg-surface-2 mb-0.5 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[14px] leading-none">{getLanguageCode(language.code)}</span>
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
