"use client";

/**
 * WT-716 — the two pieces of Clean-view UI every transcript surface shares.
 *
 * One file, imported by the live side panel, the room record, the caption lane's host and the Meet
 * widget, for the reason the widget bubble's header gives about its own copy of the live bubble: a
 * reader looking from one surface to another must see one transcript, and two toggles that label
 * the choice differently are two products.
 */

import { Undo2 } from "lucide-react";

import type { TranscriptViewMode } from "@/lib/transcript/clean-transcript";
import { cn } from "@/lib/utils";

/**
 * Clean | Verbatim, as a two-segment switch.
 *
 * WORDS, NOT ICONS. The panels around it already carry icon toggles (conversation / document /
 * timeline), and this is a different kind of choice: not how the lines are laid out but WHICH WORDS
 * are shown. An icon for "fillers removed" is a guess the reader has to hover to check.
 *
 * The tooltips say what each mode does, including the one thing that is easy to get wrong about
 * it: switching is for this reader only. Nobody else in the room sees their transcript change.
 */
export function TranscriptViewModeToggle({
  value,
  onChange,
  className,
}: {
  value: TranscriptViewMode;
  onChange: (mode: TranscriptViewMode) => void;
  className?: string;
}) {
  const options: { key: TranscriptViewMode; label: string; title: string }[] = [
    {
      key: "clean",
      label: "Clean",
      title: "Fillers and repeated words removed, one sentence per line. Only changes your view.",
    },
    {
      key: "verbatim",
      label: "Verbatim",
      title: "Exactly what the speech recogniser wrote down. Only changes your view.",
    },
  ];

  return (
    <div
      role="group"
      aria-label="Transcript wording"
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5", className)}
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          title={option.title}
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
          className={cn(
            "rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground transition-colors hover:text-ink",
            value === option.key ? "bg-surface-2 text-ink" : "",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The mark on a sentence the speaker corrected mid-flow ("thứ hai, à không, thứ ba" → "thứ ba").
 *
 * The clean line states the speaker's final intent, which is a judgement — so the words they
 * actually said are one hover away, without switching the whole transcript to Verbatim. A native
 * tooltip rather than a floating card: the bubbles this sits in clip their overflow for the speaker
 * stripe, and a card would be cut off by exactly the bubble it explains.
 */
export function SelfRepairMarker({
  rawText,
  inverted = false,
}: {
  rawText: string;
  /** On the reader's own bubble, which is the solid primary colour. */
  inverted?: boolean;
}) {
  const label = `The speaker corrected themselves. As said: "${rawText}"`;
  return (
    <span
      role="img"
      title={label}
      aria-label={label}
      data-self-repair
      className={cn(
        "ml-1 inline-flex size-4 translate-y-[2px] cursor-help items-center justify-center rounded-full align-baseline",
        inverted ? "bg-white/20 text-white" : "bg-surface-3 text-ink-subtle",
      )}
    >
      <Undo2 className="size-2.5" aria-hidden />
    </span>
  );
}
