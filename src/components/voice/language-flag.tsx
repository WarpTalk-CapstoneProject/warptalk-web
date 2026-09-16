"use client";

/**
 * A language's flag, from the `country-flag-icons` set.
 *
 * WHY AN ICON SET AND NEVER THE EMOJI. WT-661 removed flag emoji from this product because Windows
 * does not draw them: 🇻🇳 arrives as the two letters "VN", so a picker full of flags became a
 * picker full of letter pairs on half the laptops it ran on. The icons are bundled SVG components:
 * the same picture on every OS, no font, no network request, nothing the CSP has to admit.
 *
 * WHY THE SQUARE (1x1) SET. The flag sits in a circle. Cropping a 3:2 flag to a circle keeps its
 * middle third, which pushes an off-centre emblem out of frame — Vietnam's star drifted left in
 * the hand-drawn version this replaces. The 1x1 set is drawn square with the emblem re-centred.
 *
 * WHICH FLAG A LANGUAGE GETS IS NOT DECIDED HERE. WT-661's other objection stands — a flag names
 * a country, and English is spoken under many of them. The registry already made that call in
 * `SupportedLanguage.region` (English → US); this component draws whatever it says, so the choice
 * lives in exactly one place and a change to it is a change to the registry.
 *
 * The flag decorates; the name beside it is what carries the meaning, and is what a screen reader
 * hears. Hence aria-hidden.
 */

import { CN, ES, FR, JP, KR, US, VN } from "country-flag-icons/react/1x1";
import { cn } from "@/lib/utils";

// Named imports, not the whole set: the package has ~250 flags and only the registry's regions
// should reach the bundle. A language added to the registry adds its flag here.
const FLAGS: Record<string, typeof VN> = { CN, ES, FR, JP, KR, US, VN };

export function LanguageFlag({
  region,
  className,
}: {
  /** ISO-3166 alpha-2, from SupportedLanguage.region. */
  region?: string | null;
  className?: string;
}) {
  const Flag = region ? FLAGS[region.toUpperCase()] : undefined;

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-[18px] shrink-0 overflow-hidden rounded-full ring-1 ring-border",
        // A region with no icon yet gets a neutral disc rather than nothing, so a new language
        // added to the registry still lines up with the others instead of shifting its label left.
        !Flag && "bg-surface-3",
        className,
      )}
    >
      {Flag ? <Flag className="size-full" /> : null}
    </span>
  );
}
