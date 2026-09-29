"use client";

/**
 * WT-716 — the two pieces of Clean-view UI every transcript surface shares.
 *
 * One file, imported by the live side panel, the room record, the caption lane's host and the Meet
 * widget, for the reason the widget bubble's header gives about its own copy of the live bubble: a
 * reader looking from one surface to another must see one transcript, and two toggles that label
 * the choice differently are two products.
 */

import { FileText, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { TranscriptViewMode } from "@/lib/transcript/clean-transcript";
import { cn } from "@/lib/utils";

/**
 * Original transcript toggle button.
 *
 * Clean is the default view: fillers and repetitions are filtered by default.
 * Instead of displaying dual Clean / Verbatim version tabs side-by-side, this provides
 * a single focused toggle button when the reader wants to inspect the raw original transcript.
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
  const t = useTranslations("meetingTranscript.cleanView");
  const isOriginal = value === "verbatim";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOriginal}
      title={isOriginal ? t("showCleanTitle") : t("originalTitle")}
      onClick={() => onChange(isOriginal ? "clean" : "verbatim")}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium transition-colors",
        isOriginal
          ? "bg-surface-2 font-semibold text-ink shadow-xs"
          : "text-muted-foreground hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      <FileText className="size-3.5" />
      <span>{t("original")}</span>
    </button>
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
  const t = useTranslations("meetingTranscript.cleanView");
  const label = t("selfRepair", { rawText });
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
