"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ExpandingSearchDockProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  iconButtonClassName?: string;
  clearButtonClassName?: string;
  collapsedWidth?: number;
  expandedWidth?: number;
};

export function ExpandingSearchDock({
  value,
  onValueChange,
  placeholder = "Search...",
  ariaLabel = "Search",
  className,
  inputClassName,
  iconButtonClassName,
  clearButtonClassName,
  // 28, so the collapsed pill is the same circle as WorkspaceIconButton — 36 made it a
  // visibly wider lozenge sitting between two round buttons.
  collapsedWidth = 28,
  expandedWidth = 292,
}: ExpandingSearchDockProps) {
  const [open, setOpen] = React.useState(Boolean(value));
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function collapseIfEmpty() {
    if (!value.trim()) setOpen(false);
  }

  return (
    <motion.div
      animate={{ width: open ? expandedWidth : collapsedWidth }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        // Collapsed, this has to be indistinguishable from the WorkspaceIconButton pair beside it —
        // same 28px circle, same hairline, same absence of fill. It carried `bg-canvas/80`, a grey
        // disc, so the search button read as a filled/selected state next to two outlined ones and
        // the row looked like three controls from two different products.
        //
        // The fill returns only once there is text to read against, which is what focus-within and
        // the open width already mark.
        "relative flex h-[28px] shrink-0 items-center overflow-hidden rounded-full border border-border/60 text-ink shadow-sm transition-colors",
        open ? "bg-surface-1" : "bg-transparent hover:bg-surface-2",
        "focus-within:border-neutral-400 focus-within:bg-surface-1",
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={open ? "Focus search" : ariaLabel}
        onClick={() => setOpen(true)}
        className={cn(
          "ml-0.5 size-6 rounded-full text-muted-foreground hover:bg-transparent hover:text-foreground",
          iconButtonClassName
        )}
      >
        <MagnifyingGlass size={15} />
      </Button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="input"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.14 }}
            className="flex min-w-0 flex-1 items-center"
          >
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              onBlur={collapseIfEmpty}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  onValueChange("");
                  setOpen(false);
                }
              }}
              aria-label={ariaLabel}
              placeholder={placeholder}
              className={cn(
                "h-8 min-w-0 flex-1 bg-transparent pr-2 text-[12px] outline-none placeholder:text-ink-subtle",
                inputClassName
              )}
            />
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Clear search"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onValueChange("");
                  inputRef.current?.focus();
                }}
                className={cn(
                  "mr-1 size-6 rounded-full text-ink-muted hover:bg-neutral-100 hover:text-ink",
                  clearButtonClassName
                )}
              >
                <X size={12} />
              </Button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
