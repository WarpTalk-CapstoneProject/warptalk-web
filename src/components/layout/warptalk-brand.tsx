import Image from "next/image";

import { cn } from "@/lib/utils";

type WarpTalkBrandProps = {
  compact?: boolean;
  className?: string;
};

export function WarpTalkBrand({ compact = false, className }: WarpTalkBrandProps) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden", compact ? "h-8 w-9" : "h-9 w-[145px]", className)}>
      <Image
        src={compact ? "/assets/logos/warptalk-sidebar-icon.png" : "/assets/logos/warptalk-sidebar-logo.png"}
        alt="WarpTalk"
        fill
        priority
        sizes={compact ? "36px" : "145px"}
        className="object-contain object-left"
      />
    </span>
  );
}
