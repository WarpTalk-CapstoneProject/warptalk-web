import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * WarpBot's face in a chat list: the product's own mark, not two letters.
 *
 * It used to be a violet square reading "WA" — the first two characters of whatever display name
 * happened to arrive. That is the fallback a person gets when their photo fails to load, and
 * using it for the assistant said the same thing about WarpBot that a missing avatar says about a
 * colleague. WarpBot is not a person and has no photo to be missing; it has a logo.
 *
 * WHITE PLATE IN BOTH THEMES, deliberately. The mark is solid black, so on a dark surface it
 * would be a black shape on a near-black square. The download page already presents it this way —
 * a white tile with the mark inset — and matching that keeps one treatment of the logo rather
 * than one per surface, which is the same mistake the loading mark had.
 */
export function WarpBotAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline bg-white shadow-sm",
        className,
      )}
    >
      <Image
        src="/assets/logos/warptalk-sidebar-icon.png"
        alt="WarpBot"
        width={28}
        height={28}
        // Inset, so the mark reads as a logo on a tile rather than a cropped image. `h-auto`
        // keeps the aspect ratio Next would otherwise warn about when only one side is styled.
        className="h-auto w-[15px] object-contain"
      />
    </span>
  );
}
