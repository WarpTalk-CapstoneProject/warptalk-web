"use client";

import {
  BookOpen,
  CheckSquare,
  Lightbulb,
  Question,
  Sparkle,
  Warning,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { motion } from "motion/react";
import type { AiSuggestionDto } from "@/types/realtime";

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

function labelFor(category: string) {
  return CATEGORY_LABELS[category] ?? "Suggestion";
}

/**
 * The mark on a transcript bubble that says the AI noticed something about this line.
 *
 * WHY A BADGE AND NOT THE OLD STRIP
 *     This used to be a full-width hint rendered above the bubble, which auto-dismissed
 *     after 60 seconds because otherwise the strips stacked down the transcript until it
 *     stopped reading as a conversation. That solved the crowding by throwing the content
 *     away: scroll back through a meeting and every suggestion that had ever been made was
 *     gone, which is indistinguishable from the feature not existing.
 *
 *     A badge does not crowd, so it does not need to disappear. It sits on the bubble's own
 *     header beside the speaker and the time, costs one line of nothing until someone wants
 *     it, and opens in place.
 *
 * It stays quiet on purpose. Nobody asked for this hint — it is generated unprompted from
 * what was said — so it announces itself and then waits, rather than competing with the
 * thing an actual person actually said.
 */
export function SuggestionBadge({
  suggestion,
  open,
  onToggle,
}: {
  suggestion: AiSuggestionDto;
  open: boolean;
  onToggle: () => void;
}) {
  // Indexed, not returned from a helper: react-hooks/static-components can see that this
  // resolves to one of a fixed set of module-level components, and cannot see it through a
  // function call.
  const Icon =
    CATEGORY_ICONS[suggestion.category as keyof typeof CATEGORY_ICONS] ?? Sparkle;

  return (
    <motion.button
      type="button"
      layout="position"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onClick={onToggle}
      aria-expanded={open}
      title={suggestion.content}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide transition-colors ${
        open
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-primary/30 bg-primary/[0.08] text-primary/80 hover:bg-primary/15"
      }`}
    >
      <Icon className="h-2.5 w-2.5" weight="bold" aria-hidden />
      {labelFor(suggestion.category)}
    </motion.button>
  );
}

/** What the badge opens: the hint itself, inside the bubble it belongs to. */
export function SuggestionDetail({
  suggestion,
  isSelf,
  onDismiss,
}: {
  suggestion: AiSuggestionDto;
  isSelf: boolean;
  onDismiss: () => void;
}) {
  const hasDetail = Boolean(suggestion.detail?.trim());

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div
        className={`mt-2 flex items-start gap-2 rounded-lg border border-dashed px-2 py-1.5 ${
          isSelf ? "border-white/30 bg-white/10" : "border-primary/30 bg-primary/[0.06]"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p
            className={`text-[11px] leading-snug ${isSelf ? "text-white" : "text-ink"}`}
          >
            {suggestion.content}
          </p>
          {hasDetail ? (
            <p
              className={`mt-1 text-[11px] leading-relaxed ${
                isSelf ? "text-white/75" : "text-ink-subtle"
              }`}
            >
              {suggestion.detail}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss suggestion"
          className={`shrink-0 rounded p-0.5 ${
            isSelf
              ? "text-white/60 hover:bg-white/15 hover:text-white"
              : "text-ink-subtle hover:bg-surface-2 hover:text-ink"
          }`}
        >
          <X className="h-2.5 w-2.5" weight="bold" aria-hidden />
        </button>
      </div>
    </motion.div>
  );
}
