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
        className="object-contain object-left"
      />
    </span>
  );
}
