import Image from "next/image";

import { cn } from "@/lib/utils";

type WarpTalkBrandProps = {
  compact?: boolean;
  className?: string;
};

export function WarpTalkBrand({ compact = false, className }: WarpTalkBrandProps) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden", compact ? "h-4 w-[18px]" : "h-4 w-[65px]", className)}>
      <Image
        src={compact ? "/assets/logos/warptalk-sidebar-icon.png" : "/assets/logos/warptalk-sidebar-logo.png"}
        alt="WarpTalk"
        fill
        priority
        sizes={compact ? "18px" : "65px"}
        // The PNGs are black on an opaque white ground. Multiply drops the white on a light
        // surface; on a dark one it would leave a black mark on black, so dark mode inverts it to
        // white on black and screens the black away.
        className="object-contain object-left mix-blend-multiply dark:invert dark:mix-blend-screen"
      />
    </span>
  );
}
