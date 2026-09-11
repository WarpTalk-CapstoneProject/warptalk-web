#!/usr/bin/env node
/**
 * The WarpBot surfaces must look like one agent.
 *
 * The global widget and the in-meeting chat run the SAME worker over the same stream, and they
 * had drifted into showing its work two different ways: the meeting chat answered in bold violet
 * where the widget answered in ordinary ink, and it kept one live trail pinned to the bottom of
 * the panel where the widget folds a trail under every reply. Same agent, two voices.
 *
 * WT-525 t5 added a third: the WarpBot tab of the widget that floats over Google Meet. It is a
 * private 1-to-1 assistant on the global widget's path, so it is held to the widget here — and to
 * the two things that make it private, which a screenshot cannot show.
 *
 * Drift like that is invisible to a unit test of either side — each is internally consistent.
 * What catches it is asserting the files against each other, which is what this does.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const widget = read("src/components/layout/global-chatbot.tsx");
const chatPanel = read("src/components/rooms/live/chat-panel.tsx");
const store = read("src/stores/translationRoom-store.ts");
const session = read("src/components/rooms/live/persistent-meeting-session.tsx");
const popupPane = read("src/components/rooms/bridge/widget/warpbot-pane.tsx");
const popupThread = read("src/components/rooms/bridge/widget/warpbot/use-private-warpbot-thread.ts");
const popupShell = read("src/components/rooms/bridge/widget/widget-shell.tsx");

// ── the same three pieces under every answer ─────────────────────────────────

for (const [surface, source] of [
  ["the widget", widget],
  ["the in-meeting chat", chatPanel],
  ["the Meet popup's WarpBot tab", popupPane],
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

// ── the third surface: the Meet popup's WarpBot tab (WT-525 t5, WT-620) ────────

// Comments stripped, for the reason given above chatPanelCode: both files explain in prose what
// they deliberately do NOT do, and a check that reads the prose as code fails on correct files.
// JSX comments go first, so their braces do not survive the block-comment pass.
const stripComments = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const popupPaneCode = stripComments(popupPane);
const popupThreadCode = stripComments(popupThread);

// Ink, like the widget. The meeting chat's violet was the bug this file was written for; a new
// surface is the likeliest place for it to come back.
assert.doesNotMatch(
  popupPaneCode,
  /text-primary/,
  "WarpBot's answer in the popup must be ink, as in the widget — one agent cannot have two voices.",
);

// A trail folded under EVERY answer, read off the message it belongs to — not one trail for the
// pane, which would belong to whatever was asked last.
assert.match(
  popupPaneCode,
  /<AssistantWorkTrail\s+steps=\{message\.steps \?\? \[\]\}\s+running=\{false\}/,
  "The popup must draw each answer's own folded trail under it, as the widget does.",
);

// Streams: the answer is rendered from the message the chunks append to, not only once persisted.
assert.match(
  popupPaneCode,
  /<AssistantMarkdown>\{message\.content\}<\/AssistantMarkdown>/,
  "The popup must render the answer as it is written.",
);
assert.match(
  popupThreadCode,
  /"AssistantMessageChunk"[\s\S]{0,1200}?payload\.delta/,
  "The popup must append streamed chunks to the answer.",
);

// Same lifecycle steps, and the turn opens on one: the popup seeds "reading your question" at the
// send, as the meeting chat's beginAssistantTurn does, rather than waiting on a bare spinner.
for (const step of ["THINKING_STEP", "WRITING_STEP"]) {
  assert.match(
    popupThreadCode,
    new RegExp(step),
    `The popup's trail must name the ${step} lifecycle step too — the surfaces show one agent.`,
  );
}
assert.match(
  popupThreadCode,
  /const dispatch = async[\s\S]{0,1200}?updateSteps\(\(\) => \[THINKING\]\)/,
  "The popup must OPEN its turn on the thinking step when the question is sent.",
);

// The folded trail is read from a ref. The widget reads `steps` in its completed handler from the
// closure of the effect that registered it — the render in which the conversation id arrived,
// with an empty trail — so there is nothing to fold. The popup must not inherit that.
assert.match(
  popupThreadCode,
  /"AssistantMessageCompleted"[\s\S]{0,800}?const finishedSteps = stepsRef\.current/,
  "The popup must fold the trail from stepsRef — the closure's `steps` is an earlier render's empty trail.",
);

// The same agent: the global widget's hub and its hooks, not a copy of the endpoint.
for (const [what, pattern] of [
  ["the assistant hub", /createHubConnection\("\/api\/v1\/assistant\/chat-hub"\)/],
  ["useCreateAssistantConversation", /useCreateAssistantConversation\(\)/],
  ["useSendAssistantMessage", /useSendAssistantMessage\(\)/],
]) {
  assert.match(widget, pattern, `The widget must use ${what} (the popup is held to it).`);
  assert.match(popupThreadCode, pattern, `The popup must use ${what}, as the widget does.`);
}

// PRIVATE. Nothing the popup asks may reach the room: not the meeting chat's send, not its hub.
// An @WarpBot through the meeting chat would put the question in front of every participant.
assert.doesNotMatch(
  `${popupPaneCode}\n${popupThreadCode}`,
  /useSendMeetingChat|\/api\/v1\/meetings\/chat-hub|"ChatAssistant/,
  "The popup's WarpBot is private: it must not send through, or listen on, the meeting chat.",
);
assert.match(
  popupPane,
  /Only you see this conversation\. Nothing is posted to the Google Meet chat\./,
  "The popup must say, at the top, that the conversation is private and nothing goes to Meet's chat.",
);

// Exactly two tabs, Transcript and WarpBot. Meet has the call's chat; a participant chat tab here
// would be a second one, and the one people would mistake this private box for.
const tabsBlock = popupShell.match(/const TABS[\s\S]*?\];/)?.[0] ?? "";
assert.deepEqual(
  [...tabsBlock.matchAll(/id: "(\w+)"/g)].map((match) => match[1]),
  ["transcript", "warpbot"],
  "The Meet widget has exactly two tabs, Transcript and WarpBot — no participant chat.",
);

// The widget's composer: its placeholder, Enter sends, Shift+Enter is a new line.
for (const [surface, source] of [
  ["the widget", widget],
  ["the Meet popup's WarpBot tab", popupPane],
]) {
  assert.match(source, /"Ask WarpBot\.\.\."/, `${surface} must use the "Ask WarpBot..." placeholder.`);
}
assert.match(
  popupPaneCode,
  /event\.key !== "Enter" \|\| event\.shiftKey\) return;/,
  "In the popup, Enter must send and Shift+Enter must fall through to a new line.",
);

// WT-580's queue, as the code defines it — imported, never a second literal. The assistant service
// builds history from completed rows, so a question sent mid-answer is answered against two user
// turns in a row; the popup holds it exactly as the meeting chat does.
assert.match(
  popupThreadCode,
  /decideAgentSend\(\{\s*asksTheAgent: true,/,
  "The popup must hold a question asked mid-answer, through decideAgentSend.",
);
assert.match(
  popupPaneCode,
  /\{MAX_QUEUED_AGENT_ASKS\}/,
  "The popup must name the queue limit from lib/meeting/assistant-queue, not a copy of it.",
);
assert.doesNotMatch(
  `${popupPaneCode}\n${popupThreadCode}`,
  /MAX_QUEUED_AGENT_ASKS\s*=/,
  "The queue limit is defined once, in lib/meeting/assistant-queue.",
);

console.log(
  "WarpBot surface parity OK (markdown, chips, trail, colour, lifecycle steps, turn opening, streaming; Meet popup: private, two tabs, composer, queue)",
);
