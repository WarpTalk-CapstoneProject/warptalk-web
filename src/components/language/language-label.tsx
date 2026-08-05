import { getFlagEmoji } from "@/lib/language-flag";
import { getLanguageName } from "@/lib/languages";
import { cn } from "@/lib/utils";

/**
 * A language as a person should read it: flag plus the full English name.
 *
 * The single place that turns a language value into display text. Values reach the UI in
 * several shapes — bare codes from the AI side ("vi"), locale tags from rooms ("vi-VN"),
 * occasionally a name already — and every one of them renders the same here. Whatever the
 * caller holds stays untouched; this only decides what is shown.
 */
export function LanguageLabel({
  value,
  showFlag = true,
  showName = true,
  className,
}: {
  value?: string | null;
  /** Off for places too narrow for an emoji to sit well, e.g. a dense table cell. */
  showFlag?: boolean;
  /** Off for compact strips showing several languages at once, where flags alone carry it. */
  showName?: boolean;
  className?: string;
}) {
  if (!value) return null;

  const flag = showFlag ? getFlagEmoji(value) : "";
  const name = getLanguageName(value);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      // Flag-only still has to be readable to a screen reader and on hover.
      title={showName ? undefined : name}
      aria-label={showName ? undefined : name}
    >
      {flag ? (
        <span aria-hidden className="leading-none">
          {flag}
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
export function languageLabelText(value?: string | null, showFlag = true) {
  if (!value) return "";
  const flag = showFlag ? getFlagEmoji(value) : "";
  const name = getLanguageName(value);
  return flag ? `${flag} ${name}` : name;
}
