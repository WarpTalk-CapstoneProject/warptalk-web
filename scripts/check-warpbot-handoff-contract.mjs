#!/usr/bin/env node
/**
 * "Move this to the widget so I can keep discussing" — the chain, end to end on this side.
 *
 * The handover crosses four processes (worker → meeting service → this client → assistant
 * service), and every link can be dropped without an error: a handler nobody registers, a store
 * value nobody consumes, a button wired to nothing. A unit test of any one file passes over all
 * of those. So this reads the files against each other:
 *
 *   1. The meeting session listens for ChatAssistantHandoff and acts ONLY for the person who
 *      asked (the room group is shared).
 *   2. Both doors — that event and the chat panel's button — go through ONE function.
 *   3. That function seeds a new conversation and asks the widget to open it.
 *   4. The widget consumes the request and opens the conversation.
 *   5. Every new tool names itself in the trail, running and done.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "./lib/strip-comments.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => stripComments(fs.readFileSync(path.join(root, rel), "utf8"));

const session = read("src/components/rooms/live/persistent-meeting-session.tsx");
const panel = read("src/components/rooms/live/chat-panel.tsx");
const runner = read("src/lib/assistant/continue-in-widget.ts");
const widget = read("src/components/layout/global-chatbot.tsx");
const store = read("src/stores/assistant-widget-store.ts");
const labels = read("src/lib/meeting/assistant-tool-labels.ts");

// 1
assert.match(session, /chatConnection\.on\(\s*"ChatAssistantHandoff"/, "the meeting session must listen for ChatAssistantHandoff");
const handoffBlock = session.slice(session.indexOf('"ChatAssistantHandoff"'), session.indexOf('"ChatAssistantHandoff"') + 800);
assert.match(handoffBlock, /requestedByUserId/, "the handoff must be addressed: only the asker's widget opens");
assert.match(handoffBlock, /continueMeetingChatInWidget\(/, "the handoff event must go through continueMeetingChatInWidget");

// 2
assert.match(panel, /continueMeetingChatInWidget\(/, "the chat panel's Continue in widget button must use the same function");
assert.match(panel, /data-testid="continue-in-widget"/, "the explicit Continue in widget button is missing");

// 3
assert.match(runner, /createConversation\(\s*workspaceId,\s*seed\s*\)/, "the handover must create a SEEDED conversation");
assert.match(runner, /buildMeetingHandoffSeed\(/, "the seed must come from buildMeetingHandoffSeed");
assert.match(runner, /openConversation\(/, "the handover must ask the widget to open the new conversation");

// 4
assert.match(store, /pendingConversationId/, "the widget store must carry the conversation to open");
assert.match(widget, /consumePendingConversation\(\)/, "the widget must consume the pending conversation");
assert.match(widget, /openConversationById\(/, "the widget must open it through the same path as history");

// 5
for (const tool of ["create_action_item", "add_glossary_term", "share_meeting_minutes", "continue_in_widget"]) {
  assert.ok(labels.split(tool).length >= 3, `${tool} needs a running AND a done label`);
}

console.log("WarpBot handoff contract: OK");
