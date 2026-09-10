import { getLanguageCode, getLanguageName } from "@/lib/language/languages";
import { cn } from "@/lib/utils";

/**
 * A language as a person should read it: its code plus the full English name.
 *
 * The single place that turns a language value into display text. Values reach the UI in
 * several shapes — bare codes from the AI side ("vi"), locale tags from rooms ("vi-VN"),
 * occasionally a name already — and every one of them renders the same here. Whatever the
 * caller holds stays untouched; this only decides what is shown.
 *
 * WT-661: the short mark used to be a flag emoji. See `getLanguageCode` for why it is a language
 * code now — in one line, Windows renders no flag glyphs and a country is not a language.
 */
export function LanguageLabel({
  value,
  showCode = true,
  showName = true,
  className,
}: {
  value?: string | null;
  /** Off for places too narrow for the chip to sit well, e.g. a dense table cell. */
  showCode?: boolean;
  /** Off for compact strips showing several languages at once, where codes alone carry it. */
  showName?: boolean;
  className?: string;
}) {
  if (!value) return null;

  const code = showCode ? getLanguageCode(value) : "";
  const name = getLanguageName(value);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      // Code-only still has to be readable to a screen reader and on hover.
      title={showName ? undefined : name}
      aria-label={showName ? undefined : name}
    >
      {code ? (
        // aria-hidden because `name` next to it, or the aria-label above, already says this in
        // full — a screen reader announcing "E N Vietnamese" would be reading the same fact twice.
        <span
          aria-hidden
          className="rounded bg-surface-3 px-1 py-px text-[10px] font-medium leading-none tracking-wide text-ink-muted"
        >
          {code}
        </span>
      ) : null}
      {showName ? <span>{name}</span> : null}
    </span>
  );
}

/**
 * The same text without markup, for `title`, `aria-label`, option elements and anywhere else
 * that takes a string rather than a node.
 */
export function languageLabelText(value?: string | null, showCode = true) {
  if (!value) return "";
  const code = showCode ? getLanguageCode(value) : "";
  const name = getLanguageName(value);
  return code ? `${code} · ${name}` : name;
}
