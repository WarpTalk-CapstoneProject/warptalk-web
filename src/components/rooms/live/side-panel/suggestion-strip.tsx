"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  CheckSquare,
  Lightbulb,
  Question,
  Warning,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { motion } from "motion/react";
import type { AiSuggestionDto } from "@/types/realtime";

/** How long an untouched suggestion stays on screen. Without this the strips accumulate
 * down the whole transcript and the panel stops reading as a conversation. */
const AUTO_DISMISS_MS = 60_000;

const CATEGORY_ICONS = {
  clarification: Question,
  term: BookOpen,
  action: CheckSquare,
  correction: Warning,
  fact: Lightbulb,
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  clarification: "Unanswered",
  term: "Term",
  action: "Action",
  correction: "Check",
  fact: "Reference",
};

/**
 * The one-line AI hint rendered directly above a transcript bubble.
 *
 * Deliberately quiet: it is unprompted, so it must read as an aside rather than compete
 * with what people actually said. It sits at the bubble's own alignment, never wider than
 * the bubble, and disappears on its own.
 */
export function SuggestionStrip({
  suggestion,
  isSelf,
  onDismiss,
}: {
  suggestion: AiSuggestionDto;
  isSelf: boolean;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(suggestion.detail?.trim());

  useEffect(() => {
    // Expanding is a signal the reader is using it — stop the countdown rather than
    // yanking the text out from under them mid-read.
    if (expanded) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [expanded, onDismiss]);

  const Icon =
    CATEGORY_ICONS[suggestion.category as keyof typeof CATEGORY_ICONS] ?? Lightbulb;
  const label = CATEGORY_LABELS[suggestion.category] ?? "Suggestion";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scaleY: 0.8 }}
      animate={{ opacity: 1, y: 0, scaleY: 1 }}
      exit={{ opacity: 0, y: -2, scaleY: 0.8 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{ originY: 1 }}
      className={`flex max-w-full flex-col gap-1 rounded-xl border border-dashed border-primary/35 bg-primary/[0.07] px-2 py-1 ${
        isSelf ? "items-end" : "items-start"
      }`}
    >
      <div className="flex w-full min-w-0 items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0 text-primary" weight="bold" aria-hidden />
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-primary/80">
          {label}
        </span>

        {hasDetail ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="min-w-0 flex-1 truncate text-left text-[11px] leading-snug text-ink-muted hover:text-ink"
          >
            {suggestion.content}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[11px] leading-snug text-ink-muted">
            {suggestion.content}
          </span>
        )}

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss suggestion"
          className="shrink-0 rounded p-0.5 text-ink-subtle hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-2.5 w-2.5" weight="bold" aria-hidden />
        </button>
      </div>

      {expanded && hasDetail ? (
        <p className="w-full text-[11px] leading-relaxed text-ink-subtle">
          {suggestion.detail}
        </p>
      ) : null}
    </motion.div>
  );
}
