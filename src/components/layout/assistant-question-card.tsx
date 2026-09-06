"use client";

/**
 * WarpBot asking rather than guessing.
 *
 * WHY A CARD AND NOT A SENTENCE
 *   The assistant needs four things before it can create a meeting — title, type, and the two
 *   language ends — and a user who is asked for them in prose answers two and forgets the rest.
 *   Options that can be tapped are answerable in one gesture, and the ones that were not tapped
 *   stay visibly unanswered.
 *
 * THE ANSWER IS AN ORDINARY MESSAGE
 *   Submitting does not resume a paused turn — nothing is paused. The picks are formatted into a
 *   normal chat message and sent like any other, so the assistant reads them on its next turn
 *   with full history. That is why the user can also just ignore the card and type something
 *   else: it is a shortcut for answering, never a modal that has to be satisfied.
 *
 * FREE TEXT IS ALWAYS AVAILABLE
 *   Every question carries an "Other" field the model did not have to think of. A card whose
 *   options do not cover the real answer, with no way to say so, is worse than no card — it
 *   forces a wrong pick and then acts on it.
 */

import { useState } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

export type AssistantQuestionOption = {
  label: string;
  description?: string;
  value?: string;
};

export type AssistantQuestion = {
  question: string;
  header: string;
  options: AssistantQuestionOption[];
  multi_select?: boolean;
};

/**
 * Parse the questions the worker forwarded.
 *
 * Defensive on purpose: this JSON came from a language model via two services, and a card that
 * throws would take the whole chat panel down with it. A malformed payload renders nothing and
 * leaves the user's own message box, which still works.
 */
export function parseAssistantQuestions(json: string): AssistantQuestion[] {
  try {
    const parsed = JSON.parse(json) as { questions?: unknown };
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
    return questions.filter(
      (q): q is AssistantQuestion =>
        typeof q === "object"
        && q !== null
        && typeof (q as AssistantQuestion).question === "string"
        && Array.isArray((q as AssistantQuestion).options),
    );
  } catch {
    return [];
  }
}

/** The picks, as the sentence the assistant will read on its next turn. */
export function formatAnswers(
  questions: AssistantQuestion[],
  answers: Record<number, string[]>,
): string {
  return questions
    .map((question, index) => {
      const picked = answers[index] ?? [];
      if (!picked.length) return null;
      const rendered = picked.map((answer) => {
        const option = question.options.find((item) => item.label === answer);
        return option?.value?.trim() || answer;
      });
      return `${question.header}: ${rendered.join(", ")}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function AssistantQuestionCard({
  questions,
  onSubmit,
  disabled,
}: {
  questions: AssistantQuestion[];
  onSubmit: (message: string) => void;
  disabled?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [other, setOther] = useState<Record<number, string>>({});
  const [sent, setSent] = useState(false);

  if (!questions.length) return null;

  function toggle(index: number, label: string, multi: boolean) {
    setAnswers((current) => {
      const existing = current[index] ?? [];
      if (!multi) return { ...current, [index]: [label] };
      return {
        ...current,
        [index]: existing.includes(label)
          ? existing.filter((value) => value !== label)
          : [...existing, label],
      };
    });
  }

  // Everything picked, plus anything typed into an Other box that was not also picked.
  const merged: Record<number, string[]> = {};
  questions.forEach((_, index) => {
    const picked = answers[index] ?? [];
    const typed = (other[index] ?? "").trim();
    merged[index] = typed ? [...picked, typed] : picked;
  });
  const answeredCount = questions.filter((_, i) => merged[i].length > 0).length;

  function submit() {
    const message = formatAnswers(questions, merged);
    if (!message) return;
    setSent(true);
    onSubmit(message);
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-3">
      <div className="space-y-3.5">
        {questions.map((question, index) => {
          const multi = Boolean(question.multi_select);
          const picked = answers[index] ?? [];

          return (
            <div key={`${question.header}-${index}`}>
              <div className="flex items-center gap-2">
                <span className="rounded border border-border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-muted">
                  {question.header}
                </span>
                {multi ? (
                  <span className="text-[10px] text-ink-subtle">Pick any</span>
                ) : null}
              </div>
              <p className="mt-1.5 text-[12px] leading-snug text-ink">{question.question}</p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {question.options.map((option) => {
                  const selected = picked.includes(option.label);
                  return (
                    <button
                      key={option.label}
                      type="button"
                      disabled={sent || disabled}
                      onClick={() => toggle(index, option.label, multi)}
                      title={option.description}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        selected
                          ? "border-ink bg-ink text-surface-1"
                          : "border-border bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      {selected ? <Check size={10} weight="bold" /> : null}
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {/* Never absent. The model does not always know the real answer's shape, and a
                  card that forces a wrong pick is worse than one that was never shown. */}
              <input
                value={other[index] ?? ""}
                disabled={sent || disabled}
                onChange={(event) =>
                  setOther((current) => ({ ...current, [index]: event.target.value }))
                }
                placeholder="Something else…"
                className="mt-2 h-7 w-full rounded-md border border-border bg-surface-1 px-2 text-[11px] text-ink outline-none placeholder:text-ink-subtle focus:border-ink/30 disabled:opacity-60"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-hairline pt-2.5">
        <span className="text-[10px] text-ink-subtle">
          {sent
            ? "Sent"
            : `${answeredCount} of ${questions.length} answered — or just type your reply below`}
        </span>
        <button
          type="button"
          disabled={sent || disabled || answeredCount === 0}
          onClick={submit}
          className="inline-flex h-7 items-center rounded-full bg-foreground px-3 text-[11px] font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send answers
        </button>
      </div>
    </div>
  );
}
