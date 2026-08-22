#!/usr/bin/env node
/**
 * A step says WHAT is happening, WHAT TO, and the movement points at the line it describes.
 *
 * WHAT WAS WRONG
 *   1. The trail's shimmer was a band travelling across the whole box — every row at once,
 *      finished ones included — claiming "all of this is happening" about a list where exactly
 *      one thing was.
 *   2. Every step was a bare verb. "Searching documents" and "Searching the web" name the tool
 *      and nothing else, so four steps in a row said only that four tools ran, and a wrong turn
 *      (searching for the wrong thing) was invisible until the answer came back wrong.
 *   3. The two longest stretches of a slow turn — reading the question, writing the answer —
 *      were not steps at all. They were a bare "Thinking..." with no trail.
 *
 * WHY A CONTRACT AND NOT ONLY UNIT TESTS
 *   The target crosses four processes: the worker computes it, two .NET consumers relay it, and
 *   two React surfaces render it. Every one of those hops has silently dropped a field before in
 *   this codebase (the tool NAME itself was dropped by the meeting consumer for months). A unit
 *   test on either end passes happily while the wire in between carries nothing.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// 1. THE SHIMMER IS IN THE TEXT, NOT AROUND THE LIST.
const trail = read("src/components/assistant/assistant-work-trail.tsx");
const css = read("src/app/globals.css");

assert.ok(
  !trail.includes("assistant-sweep") && !css.includes("assistant-sweep"),
  "The full-frame sweep is gone: it drew a moving highlight behind every row at once, including"
    + " the finished ones. If it is back, the movement is claiming something about steps that"
    + " have already ended.",
);
assert.ok(
  css.includes(".assistant-step-shimmer") && css.includes("background-clip: text"),
  "The shimmer must be clipped to the text of the running step — that is what makes the movement"
    + " a statement about the line it runs through.",
);
assert.ok(
  !/currentColor/.test(css.split(".assistant-step-shimmer")[1]?.split("}")[0] ?? ""),
  "The shimmer gradient must not be built on currentColor: background-clip:text needs the text"
    + " transparent, currentColor then resolves to transparent, and the step vanishes entirely.",
);
assert.match(
  trail,
  /over \? "text-ink-subtle" : "text-ink assistant-step-shimmer"/,
  "Only the RUNNING step may shimmer. A finished step that keeps moving says it is still going.",
);

// THE POSITION RANGE. With background-size: 200%, a position outside 0..100% slides the image
// clear of the element; background-repeat: no-repeat then leaves the glyphs with no paint, and
// under -webkit-text-fill-color: transparent the running step is INVISIBLE. The first version
// animated 180% -> -80% and lost the first characters of every title for most of each cycle.
const shimmerBlock = css.slice(
  css.indexOf("@keyframes assistant-step-shimmer"),
  css.indexOf("}", css.indexOf(".assistant-step-shimmer {")),
);
for (const [, position] of shimmerBlock.matchAll(/background-position:\s*(-?\d+)%/g)) {
  const value = Number(position);
  assert.ok(
    value >= 0 && value <= 100,
    `background-position: ${value}% slides the gradient off the element, and a no-repeat`
      + " background under transparent text means the step's glyphs disappear. Keep every"
      + " keyframe within 0..100%.",
  );
}
assert.match(
  shimmerBlock,
  /background-size:\s*200% 100%/,
  "The 0..100% position range above is only safe at background-size: 200%.",
);

// THE FADE EDGE ONLY EXISTS WHEN THERE IS SOMETHING BELOW.
// It rendered unconditionally, so at the bottom — where a reader spends most of their time — a
// soft band sat over the last lines of the answer, and the newest message was the hardest to
// read. "There is more below" is false at the bottom.
const scrollEdge = read("src/components/ui/scroll-to-latest.tsx");
assert.match(
  scrollEdge,
  /visible = true,/,
  "ScrollFadeEdge must take a visible flag.",
);
assert.match(
  scrollEdge,
  /visible \? "opacity-100 backdrop-blur-\[3px\]" : "opacity-0"/,
  "The blur must be DROPPED when hidden, not merely faded: backdrop-filter on a transparent"
    + " element still repaints the strip under it on every scroll frame.",
);
assert.match(
  read("src/components/layout/global-chatbot.tsx"),
  /<ScrollFadeEdge visible=\{isAway\} \/>/,
  "The widget must pass isAway to the fade edge — the component gaining the flag while the one"
    + " caller keeps the default is the same bug with an option added.",
);

// 2. THE TARGET IS CARRIED, NOT INVENTED.
const labels = read("src/lib/meeting/assistant-tool-labels.ts");
assert.match(
  labels,
  /detail\?: string/,
  "AssistantStep must carry the target the worker computed.",
);
// The CONDITIONAL, not the identifier: a `title={detail}` left on a row that no longer
// renders it still contains the word, and the first version of this check passed against
// exactly that.
assert.match(
  trail,
  /\{detail \? \(/,
  "The trail must render the target. A field carried across four processes and then not drawn is"
    + " the exact shape of every dropped-field bug this chain has already had.",
);

// The labels lost their ellipsis when the target arrived — "Searching documents… onboarding"
// reads as the NAME being truncated, which is the wrong half.
assert.ok(
  !/: "[^"]*…"/.test(labels),
  "Running labels must not end in an ellipsis: it sits between the label and its target and reads"
    + " as a truncation of the label.",
);

// 3. THE WIRE, HOP BY HOP.
const backend = path.resolve(root, "..", "warptalk-backend");
const ai = path.resolve(root, "..", "warptalk-ai");
const readIfPresent = (abs) => (fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null);

// Skipped rather than failed when the sibling checkouts are absent — CI runs this repo alone,
// and a check that cannot see the other side must not invent a verdict about it.
const toolHops = [
  [path.join(ai, "shared/schemas.py"), "tool_detail", "the worker's result schema"],
  [
    path.join(ai, "ai_assistant_worker/chat_worker.py"),
    "describe_tool_target",
    "the worker's publish path",
  ],
  [
    path.join(backend, "assistant/src/WarpTalk.AssistantService.API/Services/AssistantNotifier.cs"),
    "toolDetail",
    "the assistant SignalR payload",
  ],
  [
    path.join(
      backend,
      "assistant/src/WarpTalk.AssistantService.API/Services/AssistantChatResultConsumerService.cs",
    ),
    "tool_detail",
    "the assistant Redis consumer",
  ],
  [
    path.join(backend, "meeting/src/WarpTalk.MeetingService.API/Services/MeetingChatNotifier.cs"),
    "toolDetail",
    "the meeting-chat SignalR payload",
  ],
  [
    path.join(
      backend,
      "meeting/src/WarpTalk.MeetingService.API/HostedServices/MeetingChatAssistantResultConsumerService.cs",
    ),
    "tool_detail",
    "the meeting-chat Redis consumer",
  ],
];

let checkedHops = 0;
for (const [file, needle, what] of [...toolHops, ...[]]) {
  const text = readIfPresent(file);
  if (text === null) continue;
  checkedHops += 1;
  assert.ok(
    text.includes(needle),
    `${what} does not carry the target (${needle} missing from ${path.basename(file)}). A hop that`
      + " drops it renders every step nameless on the surface below it.",
  );
}

// Both browser surfaces read it off the wire.
// Pinned at the STARTED handler specifically. The completed handler reads it too, and a check
// for the bare identifier passes on either one — so the started path could drop it while this
// still went green, which is the hop a reader notices first.
assert.match(
  read("src/components/layout/global-chatbot.tsx"),
  /detail: payload\.toolDetail/,
  "The widget must read toolDetail from the AssistantToolCallStarted payload.",
);
assert.ok(
  read("src/components/rooms/live/persistent-meeting-session.tsx").includes("payload?.toolDetail"),
  "The in-meeting chat must read toolDetail from ChatAssistantToolCallStarted — it is the surface"
    + " that had the tool name dropped for months, so it is the one to pin.",
);

// 3b. THE MODEL'S OWN ACCOUNT OF THE STEP.
// A tool step says WHAT ran and never why, and between two calls there is no tool to name at
// all — the longest silent stretch of a slow turn. These hops carry the sentence that fills it.
const reasoningHops = [
  [path.join(ai, "shared/openai_options.py"), "reasoning_summary_options", "the model options"],
  [
    path.join(ai, "ai_assistant_worker/chat_worker.py"),
    "response.reasoning_summary_text.delta",
    "the worker's stream handler",
  ],
  [
    path.join(backend, "assistant/src/WarpTalk.AssistantService.API/Services/AssistantNotifier.cs"),
    "AssistantReasoning",
    "the assistant SignalR payload",
  ],
  [
    path.join(backend, "meeting/src/WarpTalk.MeetingService.API/Services/MeetingChatNotifier.cs"),
    "ChatAssistantReasoning",
    "the meeting-chat SignalR payload",
  ],
];
for (const [file, needle, what] of reasoningHops) {
  const text = readIfPresent(file);
  if (text === null) continue;
  checkedHops += 1;
  assert.ok(
    text.includes(needle),
    `${what} does not carry the model's reasoning (${needle} missing). Without it the trail is`
      + " back to naming tools and saying nothing between them.",
  );
}
assert.ok(
  read("src/components/layout/global-chatbot.tsx").includes('"AssistantReasoning"'),
  "The widget must subscribe to AssistantReasoning.",
);
assert.ok(
  read("src/components/rooms/live/persistent-meeting-session.tsx").includes(
    '"ChatAssistantReasoning"',
  ),
  "The in-meeting chat must subscribe to ChatAssistantReasoning.",
);
assert.match(
  labels,
  /export function describeStep/,
  "describeStep must decide a step's shape in ONE place — the branch picks the title, whether"
    + " there is an inline target and whether there is a paragraph, and deciding that per"
    + " component is how two surfaces draw one event differently.",
);
assert.match(
  trail,
  /\{body \? \(/,
  "The trail must render the model's paragraph. Carried across four processes and not drawn is"
    + " the exact shape of every dropped-field bug this chain has had.",
);

// 4. READING AND WRITING ARE STEPS.
for (const marker of ["THINKING_STEP", "WRITING_STEP"]) {
  assert.ok(
    labels.includes(marker),
    `${marker} must exist: the stretch before the first tool and the stretch spent writing the`
      + " answer are the two longest parts of a slow turn, and they used to show no step at all.",
  );
}
const widget = read("src/components/layout/global-chatbot.tsx");
assert.ok(
  widget.includes("tool: THINKING_STEP") && widget.includes("tool: WRITING_STEP"),
  "The widget must actually push both lifecycle steps — a constant that is exported and never"
    + " used is the bug with a name on it.",
);

console.log(
  `Assistant step detail contract: PASS (${checkedHops} cross-repo hops checked)`,
);
