"use client";

import { CheckCircle } from "@phosphor-icons/react/dist/ssr";

import { getLanguageCode, getLanguageName } from "@/lib/language/languages";

/**
 * One section of the "My language" picker: a title, a one-line hint, then code + name + a filled
 * check on the one in use.
 *
 * The meeting's own row renderer, moved out of meeting-control-bar.tsx (where it was module-private)
 * so the bridge popup over Google Meet draws the SAME picker instead of a copy that drifts (W4b,
 * PO 2026-10-01: one language flow, the native picker). check-bridge-popup-language-contract.mjs
 * holds both callers to this file.
 */
export function LanguageColumn({
  title,
  hint,
  options,
  selected,
  onSelect,
}: {
  title: string;
  hint: string;
  options: string[];
  selected?: string;
  onSelect: (language: string) => void;
}) {
  return (
    <div role="group" aria-label={title}>
      <p className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
        {title}
      </p>
      <p className="px-2.5 pb-1 text-[11px] leading-snug text-ink-muted">{hint}</p>
      <div className="max-h-40 overflow-y-auto">
        {options.map((language) => (
          <button
            key={language}
            type="button"
            role="menuitemradio"
            aria-checked={selected === language}
            onClick={() => onSelect(language)}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
              selected === language ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <span>{getLanguageCode(language)}</span>
            <span className="flex-1 truncate">{getLanguageName(language)}</span>
            {selected === language ? <CheckCircle className="h-3.5 w-3.5 shrink-0" weight="fill" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
