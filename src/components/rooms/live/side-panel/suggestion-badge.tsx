"use client";

import {
  BookOpen,
  CheckSquare,
  Lightbulb,
  Question,
  Sparkle,
  Warning,
  X,
  MagnifyingGlass,
} from "@phosphor-icons/react/dist/ssr";
import { motion } from "motion/react";
import type { AiSuggestionDto } from "@/types/realtime";
import { useAssistantWidgetStore } from "@/stores/assistant-widget-store";
import { AnswerSources } from "@/components/assistant/answer-sources";
import { parseAnswerSources } from "@/lib/assistant/answer-sources";

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
 * What the badge's one-word label actually means, said in full when it is opened.
 *
 * WT-371 Bug 6, half two: "Thông tin suggest hiển thị không rõ cấu trúc (gồm những gì)". The
 * badge said UNANSWERED and the panel it opened showed two paragraphs of prose. Nothing told the
 * reader what kind of observation this was, so there was no way to know whether the first line
 * was a question, a definition or a warning — or why it had appeared at all.
 *
 * These are the same five categories the suggester decides between, phrased for the person
 * reading rather than for the model writing.
 */
const CATEGORY_MEANINGS: Record<string, string> = {
  clarification: "A question that was asked and not answered",
  term: "A term used in this meeting without being defined",
  action: "A commitment with no owner or no deadline",
  correction: "This contradicts something said earlier",
  fact: "From a document attached to this meeting",
};

/**
 * The next steps a hint offers, per category.
 *
 * A hint that only describes what it noticed leaves the reader to act on it in another window.
 * "This acronym was never defined" is a fact; "Research this term" is a thing to do — and the
 * widget can already do it, with web search, the workspace documents and the glossary behind it.
 *
 * WHY A LIST AND NOT ONE BUTTON
 *     A noticed term is worth looking up on the web AND worth checking against what this
 *     workspace has already written about it, and those are different answers. Naming both is
 *     what makes the hint a place work starts rather than a notice that work is needed.
 *
 * WHY THE WORDING IS PER CATEGORY
 *     The useful step is not the same for each. A term wants looking up, an unanswered question
 *     wants asking, a figure wants checking against the documents it should have come from, a
 *     contradiction wants resolving. One label for all five would have fitted none of them.
 *
 * Two at most. This card sits inside a transcript bubble in a side panel, and a row of
 * choices there competes with the conversation it is commenting on.
 */
type SuggestionAction = {
  label: string;
  /** Built from the hint, and handed to the widget as a question. */
  prompt: (subject: string, detail: string) => string;
};

const GENERIC_ACTIONS: SuggestionAction[] = [
  {
    label: "Ask WarpBot",
    prompt: (subject, detail) =>
      `About our meeting: ${subject}${detail ? `\n\nContext: ${detail}` : ""}`,
  },
];

const CATEGORY_ACTIONS: Record<string, SuggestionAction[]> = {
  term: [
    {
      label: "Research this term",
      prompt: (subject) => `Research this term from our meeting and explain it plainly: ${subject}`,
    },
    {
      label: "Find it in our documents",
      prompt: (subject) =>
        `Search our workspace documents and glossary for this term and tell me how we use it: ${subject}`,
    },
  ],
  clarification: [
    {
      label: "Ask WarpBot this",
      prompt: (subject, detail) =>
        `This came up in our meeting and went unanswered: ${subject}${detail ? `\n\nContext: ${detail}` : ""}`,
    },
    {
      label: "Find who would know",
      prompt: (subject) =>
        `Who in this workspace has worked on this, based on our meetings and documents? ${subject}`,
    },
  ],
  fact: [
    {
      label: "Check this in the documents",
      prompt: (subject, detail) =>
        `Check this against our workspace documents and say whether it matches: ${subject}${detail ? `\n\nContext: ${detail}` : ""}`,
    },
  ],
  correction: [
    {
      label: "Check which is right",
      prompt: (subject, detail) =>
        `Two things said in our meeting disagree. Work out which one our documents support: ${subject}${detail ? `\n\nContext: ${detail}` : ""}`,
    },
  ],
  action: [
    {
      label: "Draft this task",
      prompt: (subject, detail) =>
        `Turn this into a task with a clear owner and a deadline, and say what is still missing: ${subject}${detail ? `\n\nContext: ${detail}` : ""}`,
    },
  ],
};

function actionsFor(suggestion: AiSuggestionDto): { label: string; prompt: string }[] {
  const subject = suggestion.content.trim();
  const detail = suggestion.detail?.trim() ?? "";
  const actions = CATEGORY_ACTIONS[suggestion.category] ?? GENERIC_ACTIONS;
  return actions.slice(0, 2).map((action) => ({
    label: action.label,
    prompt: action.prompt(subject, detail),
  }));
}

function labelFor(category: string) {
  return CATEGORY_LABELS[category] ?? "Suggestion";
}

function meaningFor(category: string) {
  return CATEGORY_MEANINGS[category] ?? "Noticed automatically from what was said";
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
  const askWarpBot = useAssistantWidgetStore((state) => state.askWarpBot);
  // Indexed here too rather than shared through a helper — same reason as in SuggestionBadge:
  // react-hooks/static-components has to see the fixed set, and cannot through a call.
  const Icon =
    CATEGORY_ICONS[suggestion.category as keyof typeof CATEGORY_ICONS] ?? Sparkle;

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
          {/* Three stated parts, in a fixed order, so the panel has a shape a reader can
              learn: what kind of observation this is, the observation, then the evidence
              for it. Before, `content` and `detail` arrived as two unlabelled paragraphs
              and there was no way to tell which was which — or why any of it appeared. */}
          <p
            className={`flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide ${
              isSelf ? "text-white/60" : "text-primary/70"
            }`}
          >
            <Icon className="h-2.5 w-2.5" weight="bold" aria-hidden />
            {labelFor(suggestion.category)}
          </p>
          <p
            className={`text-[10px] leading-snug ${isSelf ? "text-white/60" : "text-ink-subtle"}`}
          >
            {meaningFor(suggestion.category)}
          </p>
          <p
            className={`mt-1.5 text-[11px] font-medium leading-snug ${isSelf ? "text-white" : "text-ink"}`}
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
          {/* Above the disclaimer, not below it: a named document is the answer to "where did
              this come from", and the disclaimer is what is left when there is no answer.
              A "fact" hint only exists when the meeting had documents attached, so this is
              exactly the category the reader most needs to be able to check. */}
          <AnswerSources
            sources={parseAnswerSources(suggestion.sourcesJson)}
            tone={isSelf ? "inverted" : "default"}
          />
          {/* The action, under the evidence and above the disclaimer: it is only worth offering
              once the reader has seen what the hint is and where it came from. */}
          <div className="mt-2 flex flex-wrap gap-1">
            {actionsFor(suggestion).map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => askWarpBot(action.prompt)}
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors ${
                  isSelf
                    ? "bg-white/15 text-white hover:bg-white/25"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                }`}
              >
                <MagnifyingGlass className="h-2.5 w-2.5" weight="bold" aria-hidden />
                {action.label}
              </button>
            ))}
          </div>

          {/* Said once, at the bottom, because an unprompted hint that does not say where it
              came from reads as the product asserting a fact. */}
          <p
            className={`mt-1.5 text-[9px] ${isSelf ? "text-white/45" : "text-ink-subtle/70"}`}
          >
            Generated automatically — check before relying on it.
          </p>
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
