"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { describeStep, type AssistantStep } from "@/lib/meeting/assistant-tool-labels";
import { cn } from "@/lib/utils";
import {
  LumidotSpinner,
  LumidotSpinnerPlaceholder,
} from "@/components/ui/lumidot-spinner";

/**
 * What WarpBot did to answer, while it is doing it and afterwards.
 *
 * TWO STATES, ONE LIST
 *   While the turn is open the steps are the point: they are the difference between "something is
 *   happening" and "this might be broken", and they are why a long answer can be waited out
 *   patiently. Once the answer is on screen they stop being progress and become provenance —
 *   worth having, not worth a column of text above every reply.
 *
 *   So the same list is drawn twice: open while it runs, and folded into one line afterwards.
 *
 * THE SHAPE OF A STEP
 *   A title, and under it — when the model wrote one — the sentence explaining it. That second
 *   line is the whole difference between a progress indicator and an account of the work: a tool
 *   label says a search happened, the sentence says what the model was trying to establish.
 *
 *   Only the RUNNING title moves. It carries a light that travels through the glyphs
 *   (.assistant-step-shimmer), which is the same thing every agent surface worth copying does,
 *   and it replaces a band that used to sweep the entire box — including rows that had already
 *   finished, about which movement claims something untrue.
 *
 * WHAT THIS REPLACED
 *   The trail was DELETED on completion, under a comment arguing that a finished turn showing its
 *   steps claims they are still worth watching. Half right: they are not worth watching, and
 *   throwing them away also threw away the only record of which tools an answer came through —
 *   the thing a person checking a surprising answer wants first. Folding says both: over, and
 *   still here.
 */
export function AssistantWorkTrail({
  steps,
  running,
  durationMs,
  slow = false,
  className,
}: {
  steps: readonly AssistantStep[];
  /** The turn is still open — draw the list, and let the running title shimmer. */
  running: boolean;
  /** How long the turn took. Set once it is over; drives the summary line. */
  durationMs?: number | null;
  /** Past the deadline, and still going. */
  slow?: boolean;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (steps.length === 0) return null;

  if (running) {
    return (
      <div className={cn("py-1", className)}>
        <StepList steps={steps} />
        {slow ? (
          <p className="mt-1.5 pl-[15px] text-[12px] text-ink-subtle">
            Still working — this one is taking a while.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("py-1", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex items-center gap-1 rounded-md py-0.5 text-[12px] text-ink-subtle transition-colors hover:text-ink-muted"
      >
        <span>{summarize(steps.length, durationMs)}</span>
        <ChevronDown
          className={cn("size-3.5 transition-transform", isOpen ? "rotate-180" : "")}
          aria-hidden
        />
      </button>
      {isOpen ? <StepList steps={steps} finished /> : null}
    </div>
  );
}

function StepList({
  steps,
  finished = false,
}: {
  steps: readonly AssistantStep[];
  finished?: boolean;
}) {
  return (
    <ol className="flex flex-col gap-2 text-[12px]">
      {steps.map((step) => {
        const over = step.done || finished;
        const { title, detail, body } = describeStep(step, finished);

        return (
          <li key={step.key} className="flex flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              {/* One mark, two states, same footprint — so a step does not shift sideways by a
                  pixel at the moment it finishes, which reads as the list twitching.
                  The running mark is the product's ONE loading mark, at the one size it comes
                  in: a bespoke violet dot here meant the step that was working looked like a
                  different kind of "working" from the loader directly above it. */}
              {over ? <LumidotSpinnerPlaceholder /> : <LumidotSpinner />}
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span
                  className={cn(
                    "shrink-0 font-medium",
                    over ? "text-ink-subtle" : "text-ink assistant-step-shimmer",
                  )}
                >
                  {title}
                </span>
                {/* The target, subordinate to the title: the title is what is happening, this is
                    only what it is happening to — and it is the part that is sometimes absent,
                    which must not read as something missing. */}
                {detail ? (
                  <span className="truncate text-ink-subtle" title={detail}>
                    · {detail}
                  </span>
                ) : null}
              </span>
            </div>

            {/* The model's own sentence, indented under its heading behind a rule — the shape a
                quotation takes, because that is what it is. Never shimmers: the movement marks
                the step that is running, and repeating it on the body would make a paragraph
                harder to read for no added meaning. */}
            {body ? (
              <p className="ml-[2px] border-l border-hairline pl-3 text-[12px] leading-relaxed text-ink-subtle">
                {body}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * "Worked for 11 seconds".
 *
 * Falls back to the step count when nothing timed the turn — a trail replayed out of history has
 * no duration, and inventing one would be a number a person could check and find wrong.
 */
export function summarize(stepCount: number, durationMs?: number | null): string {
  if (durationMs == null || durationMs < 0) {
    return `Worked through ${stepCount} ${stepCount === 1 ? "step" : "steps"}`;
  }

  const seconds = Math.round(durationMs / 1000);
  if (seconds < 1) return "Worked for under a second";
  if (seconds < 60) return `Worked for ${seconds} ${seconds === 1 ? "second" : "seconds"}`;

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const head = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return rest === 0
    ? `Worked for ${head}`
    : `Worked for ${head} ${rest} ${rest === 1 ? "second" : "seconds"}`;
}
