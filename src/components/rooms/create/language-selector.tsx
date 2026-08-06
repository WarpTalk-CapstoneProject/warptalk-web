import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { CheckCircle, Plus } from "@phosphor-icons/react/dist/ssr";
import { getFlagEmoji } from "@/lib/language-flag";
import { isLanguageAllowedByPolicy, languagesInScope } from "@/lib/languages";
import { LanguageLabel } from "@/components/language/language-label";
import { cn } from "@/lib/utils";

// Rooms store locale tags, so the option value is the tag; the name comes from the registry
// rather than being spelled out again here.
const languageOptions = languagesInScope("meeting").map((language) => ({
  code: language.locale,
  label: language.name,
}));

/**
 * Meeting-language picker. A meeting is defined by the SET of languages that will be
 * spoken in it (no source→target direction). Each participant's own speak/listen
 * language comes from their profile at join time; this set just declares which
 * languages the room expects, which bounds AI transcription/translation and reduces
 * hallucination. At least one language must always remain selected.
 *
 * WT-271: the list is the "meeting" scope narrowed by the workspace's `allowedTargetLanguages`
 * policy. Languages the policy forbids are shown DISABLED with the reason attached rather
 * than dropped: a host who has run Korean meetings before would otherwise watch Korean
 * silently vanish and conclude the product broke, with nothing pointing at the workspace
 * setting or at the admin who owns it. The list also stays the same length in every
 * workspace, so "where did it go" never has to be asked. Hiding would have been fewer lines
 * and no more honest.
 *
 * A policy that is empty or absent means unrestricted — see `isLanguageAllowedByPolicy`.
 */
export function LanguageSelector({
  languages,
  onLanguagesChange,
  allowedTargetLanguages,
}: {
  languages: string[];
  onLanguagesChange: (languages: string[]) => void;
  /** The workspace's `allowedTargetLanguages`, as bare ISO-639-1 codes. Empty ⇒ unrestricted. */
  allowedTargetLanguages?: string[] | null;
}) {
  function toggleLanguage(code: string) {
    if (languages.includes(code)) {
      if (languages.length === 1) return; // Must keep at least one language
      onLanguagesChange(languages.filter((item) => item !== code));
    } else {
      // Belt to the disabled row's braces: a forbidden language never enters the set, even
      // if something else calls this.
      if (!isLanguageAllowedByPolicy(code, allowedTargetLanguages)) return;
      onLanguagesChange([...languages, code]);
    }
  }

  const options = languageOptions.map((language) => ({
    ...language,
    isAllowed: isLanguageAllowedByPolicy(language.code, allowedTargetLanguages),
  }));
  const hasBlockedLanguage = options.some((language) => !language.isAllowed);

  return (
    <div className="flex items-center gap-1 px-1 py-1 rounded-full border border-border/60 bg-transparent select-none text-[13px]">
      <Popover>
        <PopoverTrigger className="flex items-center outline-none cursor-pointer">
          {languages.map((code, i) => (
            <div key={code} className="flex items-center">
              {i > 0 && <span className="text-muted-foreground/40 font-bold text-[13px] px-1">;</span>}
              <div className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-full hover:bg-surface-2 transition-colors">
                {/* Full name rather than the first two letters of it: "VI" is not a language
                    anyone recognises, and a single picked language has room to say so. Several
                    at once stay flags-only, where the label carries the name on hover. */}
                <LanguageLabel value={code} showName={languages.length === 1} />
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
        <PopoverContent align="start" className="w-[210px] rounded-xl bg-canvas border-border/50 p-1.5 shadow-xl z-[100]">
          <Command className="bg-transparent">
            <CommandList>
              <CommandGroup heading="Meeting languages" className="text-[11px] text-ink-muted">
                {options.map((language) => {
                  const isSelected = languages.includes(language.code);
                  // A forbidden language that is somehow already picked (an older room, or a
                  // policy tightened after the fact) stays clickable so it can be removed —
                  // disabling it there would trap the host with a set the server refuses.
                  const isDisabled = !language.isAllowed && !isSelected;
                  const blockedReason = `${language.label} is not allowed by this workspace's language policy.`;
                  return (
                    <CommandItem
                      key={language.code}
                      disabled={isDisabled}
                      onSelect={() => toggleLanguage(language.code)}
                      title={language.isAllowed ? undefined : blockedReason}
                      aria-label={language.isAllowed ? undefined : blockedReason}
                      className={cn(
                        "w-full rounded-md text-[13px] aria-selected:bg-surface-2 mb-0.5 flex items-center justify-between gap-2",
                        isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[14px] leading-none">{getFlagEmoji(language.code)}</span>
                        <span className="truncate font-medium text-ink">{language.label}</span>
                      </div>
                      <div data-slot="command-shortcut" className="flex shrink-0 ml-auto items-center">
                        {isSelected && <CheckCircle weight="fill" color="#3b82f6" className="h-3.5 w-3.5" />}
                        {!language.isAllowed && !isSelected && (
                          <span className="text-[10px] uppercase tracking-wide text-ink-muted">
                            Blocked
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {/* The reason, said once, rather than an unexplained gap in the list. */}
              {hasBlockedLanguage && (
                <p className="px-2 pt-1 pb-0.5 text-[10px] leading-snug text-ink-muted">
                  Blocked languages are not permitted by this workspace&apos;s language policy.
                  A workspace admin can change it in workspace settings.
                </p>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
