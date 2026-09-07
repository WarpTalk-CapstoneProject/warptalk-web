#!/usr/bin/env node
/**
 * The two WarpBot surfaces must look like one agent.
 *
 * The global widget and the in-meeting chat run the SAME worker over the same stream, and they
 * had drifted into showing its work two different ways: the meeting chat answered in bold violet
 * where the widget answered in ordinary ink, and it kept one live trail pinned to the bottom of
 * the panel where the widget folds a trail under every reply. Same agent, two voices.
 *
 * Drift like that is invisible to a unit test of either side — each is internally consistent.
 * What catches it is asserting the two files against each other, which is what this does.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const widget = read("src/components/layout/global-chatbot.tsx");
const chatPanel = read("src/components/rooms/live/chat-panel.tsx");
const store = read("src/stores/translationRoom-store.ts");
const session = read("src/components/rooms/live/persistent-meeting-session.tsx");

// ── the same three pieces under every answer ─────────────────────────────────

for (const [surface, source] of [
  ["the widget", widget],
  ["the in-meeting chat", chatPanel],
]) {
  assert.match(
    source,
    /<AssistantMarkdown>/,
    `${surface} must render WarpBot's markdown, not the source of it.`,
  );
  assert.match(
    source,
    /<AnswerSources\b/,
    `${surface} must show the source chips under an answer.`,
  );
  assert.match(
    source,
    /<AssistantWorkTrail\b/,
    `${surface} must show the work trail.`,
  );
}

// ── the same colour ──────────────────────────────────────────────────────────

// The meeting chat rendered WarpBot in `font-medium text-primary` — violet and bolder than
// anything else in the panel — so the same agent read as a system notice there and as a reply in
// the widget. Ink in both.
assert.doesNotMatch(
  chatPanel,
  /text-\[13px\] font-medium leading-relaxed text-primary/,
  "WarpBot's answer must not be violet in the meeting chat: the widget renders it in text-ink, and one agent cannot have two voices.",
);

// ── a trail under EVERY answer, not just the last ────────────────────────────

assert.match(
  chatPanel,
  /assistantTrails\[message\.id\]/,
  "The meeting chat must draw the trail belonging to each message. A single trail at the foot of the panel belongs to whatever was asked last.",
);
assert.match(
  store,
  /sealAssistantTrail:/,
  "The store must be able to attach a finished trail to the answer that produced it.",
);
assert.match(
  chatPanel,
  /sealAssistantTrail\(/,
  "Sealing must actually be called from the panel — a store action nothing invokes is the trail still vanishing.",
);

// ── the same lifecycle steps ─────────────────────────────────────────────────

// The widget seeds "reading your question" before the first tool and names "writing the answer"
// once prose starts. The meeting chat gets no token stream, so it takes both from the two moments
// it genuinely knows: the turn opening, and the answer arriving.
for (const step of ["THINKING_STEP", "WRITING_STEP"]) {
  assert.match(
    widget,
    new RegExp(step),
    `The widget must name the ${step} lifecycle step.`,
  );
  assert.match(
    store,
    new RegExp(step),
    `The in-meeting trail must name the ${step} lifecycle step too — the surfaces show one agent.`,
  );
}

// ── the turn must OPEN on a step, not on a bare spinner ─────────────────────

// The bug this catches, which shipped once already: the store seeded "reading your question"
// only when it saw the state go idle -> thinking, but the panel sets "thinking" itself the
// moment somebody sends an @agent mention (waiting for the round trip leaves the send looking
// ignored). Every later signal then took the "already running" branch, nothing ever seeded, and
// the seed was dead code. The trail began at the first tool call and the stretch before it —
// the longest part of a slow turn — showed a spinner where the widget shows a step.
//
// Invisible to a store test, which cannot see which action the panel calls. Hence here.
assert.match(
  chatPanel,
  /beginAssistantTurn\(\)/,
  "The chat panel must OPEN the turn through beginAssistantTurn, so the trail starts at the send.",
);
// Comments stripped first. The prose right above the call SAYS
// `setAssistantState("thinking")` while explaining why it is no longer used, and a check that
// reads it as code fails on the correct file — the same trap that made an earlier assertion in
// this batch pass against broken code, in reverse.
const chatPanelCode = chatPanel
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

assert.doesNotMatch(
  chatPanelCode,
  /answersWhenAskedRef\.current = [\s\S]{0,200}?setAssistantState\("thinking"\)/,
  'Opening a turn with setAssistantState("thinking") moves the state without starting a trail — the seed then never fires.',
);
assert.match(
  store,
  /beginAssistantTurn:/,
  "The store must expose beginAssistantTurn.",
);

// ── the answer streams on BOTH surfaces ─────────────────────────────────────

// The widget has streamed since it shipped; the meeting chat persisted its reply first and
// broadcast it whole, so the room saw nothing between the question and the finished answer while
// the widget beside it was visibly writing. Measured, the agent takes the same time on both —
// 3.1s median in-meeting against 3.6s in the widget — so the gap was entirely in the showing.
//
// Four hops, and the chain is only as good as its weakest: the worker already emitted chunks,
// and the meeting consumer was reading them purely to flip a status column.
// The RENDER, not the identifier: `/assistantDraft/` matches a renamed-away variable too, which
// is how a mutation that removed the draft entirely passed this check the first time.
assert.match(
  chatPanel,
  /<AssistantMarkdown>\{assistantDraft\}<\/AssistantMarkdown>/,
  "The meeting chat must render the answer as it is written, not only once it is persisted.",
);
assert.match(
  store,
  /appendAssistantDraft:/,
  "The store must accumulate the streamed answer.",
);
assert.match(
  store,
  /assistantDraft: ""/,
  "The draft must be cleared — the persisted message is authoritative, and a turn that dies must not leave its half-sentence for the next question.",
);
assert.match(
  session,
  /"ChatAssistantChunk"/,
  "Nothing accumulates a draft the hub never delivers: the session must subscribe to the chunk event.",
);

// ── the step a hosted tool only reports at the END ──────────────────────────
//
// OpenAI's hosted web search never enters the worker's dispatch loop, so no function call is
// dispatched for it and the started event fires before the item naming the query is on the wire.
// In production the event that carries the searched site is the COMPLETED one — and the meeting
// consumer dropped that type, so a whole web-search turn left no trace: the trail sat on
// "Reading your question" for the length of the search while the widget listed every source.
assert.match(
  session,
  /"ChatAssistantToolCallCompleted"/,
  "The session must subscribe to the finished tool call — for a hosted search it is the only event that names what was searched.",
);
assert.match(
  store,
  /noteAssistantToolFinished:/,
  "The store must be able to close a step and fill in the target the started event could not carry.",
);
// Folded, not appended: the same search drawn twice — once blank, once named — is what
// re-using the started event would produce.
assert.match(
  store,
  // Anchored on the IMPLEMENTATION, not the interface entry that declares the same name a
  // few hundred lines earlier — anchoring on the first occurrence measures the distance to
  // the wrong thing and fails on correct code.
  /noteAssistantToolFinished: \(toolName[\s\S]{0,3000}?step\.detail \|\| toolDetail/,
  "A finished tool call must FILL a missing target rather than overwrite one already reported for the same call.",
);

console.log(
  "WarpBot surface parity OK (markdown, chips, trail, colour, lifecycle steps, turn opening, streaming)",
);
