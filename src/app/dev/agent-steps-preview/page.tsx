"use client";

/**
 * The agent trail and the scroller edge, drawable without a live turn.
 *
 * WHY THIS EXISTS
 *   Both are only reachable behind a signed-in session, an open WarpBot conversation and a
 *   model that happens to be mid-tool-call — so every previous change to them was verified by
 *   asking somebody to go and look. A shimmer that does not run, or a fade band sitting over
 *   the newest message, is exactly the class of defect that survives that.
 *
 *   Same purpose as the other dev/* previews: not a test, a place to SEE it.
 */

import { useRef, useState } from "react";

import { AssistantWorkTrail } from "@/components/assistant/assistant-work-trail";
import { ScrollFadeEdge, ScrollToLatestChip } from "@/components/ui/scroll-to-latest";
import { useScrollToLatest } from "@/hooks/use-scroll-to-latest";
import {
  REASONING_STEP,
  THINKING_STEP,
  WRITING_STEP,
  type AssistantStep,
} from "@/lib/meeting/assistant-tool-labels";

const RUNNING_STEPS: AssistantStep[] = [
  { key: "a", tool: THINKING_STEP, done: true },
  {
    key: "b",
    tool: REASONING_STEP,
    done: true,
    detail: "Clarifying specifications and sources",
    body:
      "I will re-check the official Qwen/Alibaba announcements and compare the release notes,"
      + " because the name “Qwen 3.8” needs to be verified first.",
  },
  { key: "c", tool: "web_search", done: true, detail: "qwen.ai" },
  { key: "d", tool: "search_documents", done: true, detail: "onboarding checklist" },
  {
    key: "e",
    tool: REASONING_STEP,
    done: false,
    detail: "Weighing what the sources actually say",
    body: "Two of the three pages describe a different model family, so I am discarding them.",
  },
];

const FINISHED_STEPS: AssistantStep[] = [
  ...RUNNING_STEPS.map((step) => ({ ...step, done: true })),
  { key: "f", tool: WRITING_STEP, done: true },
];

export default function AgentStepsPreviewPage() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [lines] = useState(() => Array.from({ length: 24 }, (_, index) => index + 1));
  const { isAway, scrollToLatest } = useScrollToLatest(scrollerRef, { threshold: 80 });

  return (
    <main className="min-h-screen bg-canvas p-8 text-ink">
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <header>
          <h1 className="text-lg font-semibold">Agent steps preview</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            The running title carries the travelling light; the finished ones do not.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-surface-1 p-4">
          <h2 className="mb-3 text-[13px] font-medium text-ink-muted">Running</h2>
          <AssistantWorkTrail steps={RUNNING_STEPS} running />
        </section>

        <section className="rounded-xl border border-border bg-surface-1 p-4">
          <h2 className="mb-3 text-[13px] font-medium text-ink-muted">Running, past the deadline</h2>
          <AssistantWorkTrail steps={RUNNING_STEPS} running slow />
        </section>

        <section className="rounded-xl border border-border bg-surface-1 p-4">
          <h2 className="mb-3 text-[13px] font-medium text-ink-muted">Finished (click to open)</h2>
          <AssistantWorkTrail steps={FINISHED_STEPS} running={false} durationMs={13_400} />
        </section>

        <section className="rounded-xl border border-border bg-surface-1 p-4">
          <h2 className="mb-3 text-[13px] font-medium text-ink-muted">
            Scroller — the fade and the chip appear together, and only when there is more below
          </h2>
          <div className="relative flex h-64 min-h-0 flex-col">
            <div
              ref={scrollerRef}
              data-testid="preview-scroller"
              className="min-h-0 flex-1 overflow-y-auto px-2"
            >
              {lines.map((line) => (
                <p key={line} className="py-2 text-[13px] text-ink">
                  Message {line} — the newest line must be readable, not under a band.
                </p>
              ))}
            </div>
            <ScrollFadeEdge visible={isAway} />
            <ScrollToLatestChip visible={isAway} onClick={scrollToLatest} />
          </div>
          <p className="mt-2 text-[12px] text-ink-subtle" data-testid="preview-away">
            isAway: {String(isAway)}
          </p>
        </section>
      </div>
    </main>
  );
}
