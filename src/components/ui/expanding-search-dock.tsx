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
};

export function ExpandingSearchDock({
  value,
  onValueChange,
  placeholder = "Search...",
  ariaLabel = "Search",
  className,
  inputClassName,
}: ExpandingSearchDockProps) {
  const [open, setOpen] = React.useState(Boolean(value));
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (value) setOpen(true);
  }, [value]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function collapseIfEmpty() {
    if (!value.trim()) setOpen(false);
  }

  return (
    <motion.div
      animate={{ width: open ? 292 : 36 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "relative flex h-9 shrink-0 items-center overflow-hidden rounded-full border border-border bg-canvas/80 text-ink shadow-[0_8px_20px_rgba(15,15,15,0.04)] backdrop-blur-md",
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
        className="ml-1 size-7 rounded-full text-ink-muted hover:bg-neutral-100 hover:text-ink"
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
                className="mr-1 size-6 rounded-full text-ink-muted hover:bg-neutral-100 hover:text-ink"
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
