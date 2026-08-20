#!/usr/bin/env node
/**
 * Source chips must reach both surfaces that run the chat agent, and must not link anywhere
 * a model could choose.
 *
 * WHY THIS EXISTS
 *   The worker already computed which sources an answer rests on and published them on
 *   `sources_json`. Nothing on this side read the field: it crossed Redis, crossed two .NET
 *   services, and stopped. A complete, correct, tested mechanism wired to nothing — the same
 *   failure this repo has hit repeatedly and now guards against by contract rather than by
 *   memory (see check-summary-state-wired.mjs).
 *
 *   Two surfaces is the part that rots. The global widget and the in-meeting chat panel run the
 *   same agent through the same worker, and it is entirely possible to wire the chips into one
 *   and ship. Then WarpBot cites its sources in the sidebar and appears to invent everything it
 *   says in a meeting.
 *
 * THE RULES
 *   1. Both surfaces parse `sourcesJson` and render <AnswerSources/>.
 *   2. Both DTO types carry the field, or the payload is dropped at the type boundary and the
 *      parse silently receives undefined forever.
 *   3. The completed/replay paths carry it — those are the only paths that ever have it, since
 *      the worker resolves citations once the whole answer exists.
 *   4. A chip's href is http(s) or nothing. The ref arrives from a model's tool result and
 *      crosses two service boundaries; a `javascript:` ref reaching an href would be
 *      model-authored script running on the page.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const LIB = "src/lib/assistant/answer-sources.ts";
const CHIP = "src/components/assistant/answer-sources.tsx";
const WIDGET = "src/components/layout/global-chatbot.tsx";
const PANEL = "src/components/rooms/live/chat-panel.tsx";
const ASSISTANT_TYPES = "src/types/assistant.ts";
const REALTIME_TYPES = "src/types/realtime.ts";

const failures = [];
const lib = read(LIB);
const chip = read(CHIP);
const widget = read(WIDGET);
const panel = read(PANEL);

// ---- Rule 1: both surfaces are wired -------------------------------------------------------
for (const [path, source] of [
  [WIDGET, widget],
  [PANEL, panel],
]) {
  if (!/from\s+"@\/lib\/assistant\/answer-sources"/.test(source)) {
    failures.push(
      `${path}: does not import from lib/assistant/answer-sources. Both surfaces run the same ` +
        `agent — one of them citing its sources and the other not is worse than neither.`,
    );
  }
  if (!/parseAnswerSources\s*\(/.test(source)) {
    failures.push(`${path}: never calls parseAnswerSources, so no chip can ever render.`);
  }
  if (!/<AnswerSources\b/.test(source)) {
    failures.push(`${path}: never renders <AnswerSources/>.`);
  }
}

// ---- Rule 2: the field survives the type boundary -------------------------------------------
if (!/sourcesJson\??:\s*string\s*\|\s*null/.test(read(ASSISTANT_TYPES))) {
  failures.push(
    `${ASSISTANT_TYPES}: AssistantMessageDto has no sourcesJson. The backend sends it and this ` +
      `type is what the widget reads history through.`,
  );
}
if (!/sourcesJson\??:\s*string\s*\|\s*null/.test(read(REALTIME_TYPES))) {
  failures.push(
    `${REALTIME_TYPES}: ChatMessageDto has no sourcesJson. Meeting chat messages arrive as this ` +
      `type over the hub and out of history alike.`,
  );
}

// ---- Rule 3: the paths that actually carry sources ------------------------------------------
if (!/"AssistantMessageCompleted"[\s\S]{0,400}?sourcesJson/.test(widget)) {
  failures.push(
    `${WIDGET}: the AssistantMessageCompleted handler does not read sourcesJson. It is the only ` +
      `live event that carries it — the worker resolves citations once the answer is whole, so ` +
      `there is nothing to read on a chunk.`,
  );
}
if (!/message\.sourcesJson/.test(widget)) {
  failures.push(
    `${WIDGET}: conversation history is replayed without sourcesJson, so reopening a chat strips ` +
      `the provenance off every answer in it.`,
  );
}

// ---- Rule 4: no model-chosen protocol reaches an href ---------------------------------------
if (!/protocol\s*===\s*"http:"\s*\|\|\s*url\.protocol\s*===\s*"https:"/.test(lib)) {
  failures.push(
    `${LIB}: answerSourceHref no longer restricts the url protocol. The ref comes from a model's ` +
      `tool result; javascript:/data: reaching an href is script execution on the page.`,
  );
}
if (!/target="_blank"[\s\S]{0,200}?rel="noopener noreferrer"/.test(chip)) {
  failures.push(
    `${CHIP}: a web chip opens a new tab without rel="noopener noreferrer".`,
  );
}

// ---- The chips must stay honest about what they claim ---------------------------------------
if (!/if\s*\(sources\.length === 0\)\s*return null/.test(chip)) {
  failures.push(
    `${CHIP}: renders something when there are no sources. An answer that cited nothing is normal ` +
      `— it rested on the conversation — and an empty "Sources" row reads as a failure.`,
  );
}

if (failures.length > 0) {
  console.error("answer-sources contract FAILED:\n");
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log("answer-sources contract OK");
