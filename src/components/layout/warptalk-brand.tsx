import Image from "next/image";

import { cn } from "@/lib/utils";

type WarpTalkBrandProps = {
  compact?: boolean;
  className?: string;
};

export function WarpTalkBrand({ compact = false, className }: WarpTalkBrandProps) {
  const width = compact ? 352 : 806;
  const height = compact ? 272 : 200;

  return (
    <span className={cn("relative block shrink-0 overflow-hidden", compact ? "h-4 w-[18px]" : "h-4 w-[65px]", className)}>
      <Image
        src={compact ? "/assets/logos/warptalk-sidebar-icon.png" : "/assets/logos/warptalk-sidebar-logo.png"}
        alt="WarpTalk"
        width={width}
        height={height}
        priority
        className="object-contain object-left mix-blend-multiply"
        style={{ width: "auto", height: "100%" }}
      />
    </span>
  );
}
