import React from "react";
import { cn } from "@/lib/utils";

export const PillButton = React.forwardRef<HTMLButtonElement, { icon: React.ElementType, label?: React.ReactNode, active: boolean, onClick?: () => void }>(({ icon: Icon, label, active, onClick, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors border shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        active 
          ? "border-border bg-surface-1 text-ink hover:bg-surface-2" 
          : "border-border/60 bg-white dark:bg-transparent text-ink-muted hover:text-ink hover:border-border hover:bg-surface-1"
      )}
      {...props}
    >
      <Icon weight={active ? "duotone" : "bold"} size={14} className={active ? "text-ink" : "text-ink-muted/70"} />
      {label}
    </button>
  );
});
PillButton.displayName = "PillButton";
