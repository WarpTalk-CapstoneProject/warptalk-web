"use client";

import { ChevronDown } from "lucide-react";
import { Lumidot } from "lumidot";
import { useState } from "react";

import {
  assistantToolDoneLabel,
  assistantToolLabel,
  type AssistantStep,
} from "@/lib/meeting/assistant-tool-labels";
import { cn } from "@/lib/utils";

/**
 * What WarpBot did to answer, while it is doing it and afterwards.
 *
 * TWO STATES, ONE LIST
 *   While the turn is open the steps are the point: they are the difference between "something is
 *   happening" and "this might be broken", and they are why a long answer can be waited out
 *   patiently. Once the answer is on screen they stop being progress and become provenance — worth
 *   having, not worth a column of text above every reply.
 *
 *   So the same list is drawn twice: open while it runs, and folded into one line afterwards.
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
  lumidotVariant,
  className,
}: {
  steps: readonly AssistantStep[];
  /** The turn is still open — draw the list, and the sweep across it. */
  running: boolean;
  /** How long the turn took. Set once it is over; drives the summary line. */
  durationMs?: number | null;
  /** Past the deadline, and still going. */
  slow?: boolean;
  /** Passed through so the marker here is the same Lumidot the surface uses elsewhere. */
  lumidotVariant?: React.ComponentProps<typeof Lumidot>["variant"];
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (steps.length === 0) return null;

  if (running) {
    return (
      <div className={cn("relative overflow-hidden rounded-lg py-1", className)}>
        {/* The sweep. Purely decorative and behind the text, so it cannot make a step harder to
            read — the point is peripheral movement that says "still going" without another
            spinner, next to a list whose last row already has one. */}
        <span aria-hidden className="assistant-sweep" />
        <StepList steps={steps} lumidotVariant={lumidotVariant} />
        {slow ? (
          <p className="mt-1 pl-4 text-[12px] text-ink-subtle">
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
      {isOpen ? <StepList steps={steps} lumidotVariant={lumidotVariant} finished /> : null}
    </div>
  );
}

function StepList({
  steps,
  lumidotVariant,
  finished = false,
}: {
  steps: readonly AssistantStep[];
  lumidotVariant?: React.ComponentProps<typeof Lumidot>["variant"];
  finished?: boolean;
}) {
  return (
    <ol className="relative flex flex-col gap-1 pl-4 text-[12px]">
      {steps.map((step) => (
        <li key={step.key} className="flex items-center gap-2">
          {step.done || finished ? (
            // A dot, not a tick. The tick read as a verdict on the answer; this is only a step
            // that has gone past.
            <span aria-hidden className="size-[5px] shrink-0 rounded-full bg-hairline-strong" />
          ) : (
            // The same Lumidot that means "thinking" one line up. A second spinner shape for the
            // same fact — WarpBot is working — reads as a different kind of waiting, and there is
            // only one kind here.
            <span className="flex size-[11px] shrink-0 origin-center scale-[0.34] items-center justify-center">
              <Lumidot variant={lumidotVariant} pattern="frame" glow={4} />
            </span>
          )}
          <span className={step.done || finished ? "text-ink-subtle" : "text-ink-muted"}>
            {step.done || finished
              ? assistantToolDoneLabel(step.tool)
              : assistantToolLabel(step.tool)}
          </span>
        </li>
      ))}
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
