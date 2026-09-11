"use client";

/**
 * A language's flag, drawn inline.
 *
 * WHY SVG AND NEVER THE EMOJI. WT-661 removed flag emoji from this product because Windows does
 * not draw them: 🇻🇳 arrives as the two letters "VN", so a picker full of flags became a picker
 * full of letter pairs on half the laptops it ran on. Inline SVG is the same picture on every OS
 * and needs no font, no network request and nothing the content-security policy has to admit.
 *
 * WHICH FLAG A LANGUAGE GETS IS NOT DECIDED HERE. WT-661's other objection stands — a flag names
 * a country, and English is spoken under many of them. The registry already made that call in
 * `SupportedLanguage.region` (English → US); this component draws whatever it says, so the choice
 * lives in exactly one place and a change to it is a change to the registry.
 *
 * The flag decorates; the name beside it is what carries the meaning, and is what a screen reader
 * hears. Hence aria-hidden.
 */

import { cn } from "@/lib/utils";

const FLAGS: Record<string, React.ReactNode> = {
  VN: (
    <>
      <rect width="30" height="20" fill="#DA251D" />
      <polygon
        fill="#FFFF00"
        points="15,4 16.76,9.43 22.47,9.43 17.85,12.79 19.62,18.22 15,14.86 10.38,18.22 12.15,12.79 7.53,9.43 13.24,9.43"
      />
    </>
  ),
  US: (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      {[0, 2, 4, 6, 8, 10, 12].map((stripe) => (
        <rect key={stripe} y={(stripe * 20) / 13} width="30" height={20 / 13} fill="#B22234" />
      ))}
      <rect width="12" height={(7 * 20) / 13} fill="#3C3B6E" />
    </>
  ),
  JP: (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      <circle cx="15" cy="10" r="6" fill="#BC002D" />
    </>
  ),
  KR: (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      <path d="M15 5a5 5 0 0 1 0 10a2.5 2.5 0 0 1 0-5a2.5 2.5 0 0 0 0-5z" fill="#C60C30" />
      <path d="M15 15a5 5 0 0 1 0-10a2.5 2.5 0 0 1 0 5a2.5 2.5 0 0 0 0 5z" fill="#003478" />
    </>
  ),
  FR: (
    <>
      <rect width="10" height="20" fill="#0055A4" />
      <rect x="10" width="10" height="20" fill="#FFFFFF" />
      <rect x="20" width="10" height="20" fill="#EF4135" />
    </>
  ),
  ES: (
    <>
      <rect width="30" height="20" fill="#AA151B" />
      <rect y="5" width="30" height="10" fill="#F1BF00" />
    </>
  ),
  CN: (
    <>
      <rect width="30" height="20" fill="#DE2910" />
      <polygon
        fill="#FFDE00"
        points="6,2.5 6.9,5.2 9.8,5.2 7.5,6.9 8.3,9.6 6,7.9 3.7,9.6 4.5,6.9 2.2,5.2 5.1,5.2"
      />
    </>
  ),
};

export function LanguageFlag({
  region,
  className,
}: {
  /** ISO-3166 alpha-2, from SupportedLanguage.region. */
  region?: string | null;
  className?: string;
}) {
  const flag = region ? FLAGS[region.toUpperCase()] : undefined;

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-[18px] shrink-0 overflow-hidden rounded-full ring-1 ring-border",
        // A region with no drawing yet gets a neutral disc rather than nothing, so a new language
        // added to the registry still lines up with the others instead of shifting its label left.
        !flag && "bg-surface-3",
        className,
      )}
    >
      {flag ? (
        <svg viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice" className="size-full">
          {flag}
        </svg>
      ) : null}
    </span>
  );
}
