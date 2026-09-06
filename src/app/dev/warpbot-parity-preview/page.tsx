"use client";

/**
 * The two WarpBot surfaces, side by side, so drift between them is visible.
 *
 * The widget and the in-meeting chat run one agent over one stream, and they had drifted: the
 * meeting chat answered in bold violet with no per-answer trail, the widget in ordinary ink with
 * one folded under every reply. Neither surface looks wrong on its own — that is exactly why the
 * difference survived. Putting them next to each other is the check.
 *
 * Both columns render the SAME components the real surfaces use. Not linked from anywhere.
 */

import { AssistantMarkdown } from "@/components/assistant/assistant-markdown";
import { AnswerSources } from "@/components/assistant/answer-sources";
import { AssistantWorkTrail } from "@/components/assistant/assistant-work-trail";
import { WarpBotAvatar } from "@/components/assistant/warpbot-avatar";
import {
  AssistantQuestionCard,
  parseAssistantQuestions,
} from "@/components/layout/assistant-question-card";
import {
  REASONING_STEP,
  THINKING_STEP,
  WRITING_STEP,
  type AssistantStep,
} from "@/lib/meeting/assistant-tool-labels";
import type { AnswerSource } from "@/lib/assistant/answer-sources";
import {
  LumidotSpinner,
  LumidotSpinnerPlaceholder,
} from "@/components/ui/lumidot-spinner";

/**
 * WarpBot asking rather than guessing — the shape the worker sends on the wire.
 *
 * Raw JSON, not a parsed object, so this exercises the same defensive parser the real panels use.
 */
const QUESTIONS_JSON = JSON.stringify({
  questions: [
    {
      header: "Meeting type",
      question: "What kind of meeting should I create?",
      options: [
        { label: "Standard", description: "Anyone with the link can join." },
        { label: "Private", description: "Invited participants only." },
      ],
    },
    {
      header: "Languages",
      question: "Which languages should it translate between?",
      multi_select: true,
      options: [{ label: "Vietnamese" }, { label: "English" }, { label: "Japanese" }],
    },
  ],
});

/** The turn from the production report: asked what C# is, workspace had nothing, web answered. */
const TRAIL: AssistantStep[] = [
  { key: "a", tool: THINKING_STEP, done: true },
  { key: "b", tool: "search_terminology", done: true, detail: "C#" },
  {
    key: "c",
    tool: REASONING_STEP,
    done: true,
    detail: "Nothing in the workspace",
    body: "The glossary and the transcript have no entry for this, so it is a general question.",
  },
  { key: "d", tool: "web_search", done: true, detail: "learn.microsoft.com" },
  { key: "e", tool: WRITING_STEP, done: true },
];

const SOURCES: AnswerSource[] = [
  { marker: "S1", kind: "glossary", title: "Workspace glossary" },
  { marker: "S2", kind: "web", title: "learn.microsoft.com", ref: "https://learn.microsoft.com" },
];

const ANSWER =
  "**C#** is a programming language from Microsoft, used for web, desktop and Unity games on"
  + " .NET. Your workspace glossary has no entry for it — this came from the web.";

function Column({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex-1 min-w-0">
      <p className="text-[12px] font-semibold text-ink">{title}</p>
      <p className="mt-0.5 mb-2 text-[11px] text-ink-muted">{note}</p>
      <div className="rounded-lg border border-hairline bg-canvas p-3">{children}</div>
    </section>
  );
}

export default function WarpBotParityPreviewPage() {
  return (
    <main className="min-h-dvh bg-surface-1 p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-[18px] font-semibold text-ink">WarpBot — one agent, two surfaces</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            The same answer, rendered by each surface&rsquo;s own markup. They should be
            indistinguishable apart from the avatar the meeting chat puts beside a message.
          </p>
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          <Column
            title="Global widget"
            note="text-ink · chips · folded trail"
          >
            {/* Exactly the classes global-chatbot puts on an assistant message. */}
            <div
              data-testid="widget-answer"
              className="max-w-[85%] text-[13px] leading-relaxed break-words text-ink py-2 pl-4"
            >
              <AssistantMarkdown>{ANSWER}</AssistantMarkdown>
              <AnswerSources sources={SOURCES} />
              <AssistantWorkTrail steps={TRAIL} running={false} durationMs={7400} />
            </div>
          </Column>

          <Column
            title="In-meeting chat"
            note="was: font-medium text-primary, and no trail at all"
          >
            <div className="flex gap-3 items-start">
              <WarpBotAvatar />
              {/* Exactly the classes chat-panel puts on an assistant message. */}
              <div
                data-testid="chat-answer"
                className="mt-0.5 max-w-full break-words text-left text-[13px] leading-relaxed text-ink"
              >
                <AssistantMarkdown>{ANSWER}</AssistantMarkdown>
                <AnswerSources sources={SOURCES} />
                <AssistantWorkTrail steps={TRAIL} running={false} durationMs={7400} />
              </div>
            </div>
          </Column>
        </div>

        {/* The clarifying question, on both surfaces.
            Added after the meeting chat spent days receiving this event and rendering nothing
            while the widget rendered it perfectly — the drift this page exists to make visible,
            in the one place the page did not yet look. */}
        <div className="flex flex-col gap-6 md:flex-row">
          <Column title="Global widget · asking" note="last in the thread, not on a bubble">
            <div className="pl-4">
              <AssistantQuestionCard
                questions={parseAssistantQuestions(QUESTIONS_JSON)}
                onSubmit={() => {}}
              />
            </div>
          </Column>

          <Column title="In-meeting chat · asking" note="everyone in the room can answer">
            <div className="px-1">
              <AssistantQuestionCard
                questions={parseAssistantQuestions(QUESTIONS_JSON)}
                onSubmit={() => {}}
              />
            </div>
          </Column>
        </div>

        <div className="rounded-lg border border-hairline bg-canvas p-3">
          <p className="mb-2 text-[12px] font-semibold text-ink">The trail while it runs</p>
          <AssistantWorkTrail
            steps={TRAIL.slice(0, 4).map((step, index) => ({ ...step, done: index < 3 }))}
            running
          />
        </div>

        {/* The streaming draft, in the shape the finished message takes — same avatar, same ink,
            same markdown — so the reply does not visibly jump when it lands. */}
        <div className="rounded-lg border border-hairline bg-canvas p-3">
          <p className="mb-2 text-[12px] font-semibold text-ink">
            In-meeting, while the answer is being written
          </p>
          <div className="flex items-start gap-3" data-testid="draft-sample">
            <WarpBotAvatar />
            <div className="mt-0.5 max-w-full break-words text-left text-[13px] leading-relaxed text-ink">
              <AssistantMarkdown>
                {"**C#** is a programming language from Microsoft, used for web, deskt"}
              </AssistantMarkdown>
            </div>
          </div>
          <div className="mt-2">
            <AssistantWorkTrail
              steps={[...TRAIL.slice(0, 4), { key: "w", tool: WRITING_STEP, done: false }]}
              running
            />
          </div>
        </div>

        {/* Every loading mark in the product, at every size it can appear, in one row. They were
            scale-75 in the widget, scale-[0.42] on the meeting chat's thinking line and unscaled
            in the dialogs — three sizes for one idea. Lined up here so a fourth cannot appear
            unnoticed. */}
        <div className="rounded-lg border border-hairline bg-canvas p-3">
          <p className="mb-2 text-[12px] font-semibold text-ink">One mark, one size</p>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 text-[13px] text-ink-subtle">
              <LumidotSpinner />
              widget loader
            </span>
            <span className="flex items-center gap-2 text-[12px] text-ink-muted">
              <LumidotSpinner />
              meeting chat
            </span>
            <span className="flex items-center gap-2 text-[12px] text-ink-muted">
              <LumidotSpinner />
              running step
            </span>
            <span className="flex items-center gap-2 text-[12px] text-ink-subtle">
              <LumidotSpinnerPlaceholder />
              finished step
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
