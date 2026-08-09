import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSISTANT_DISPLAY_NAME,
  chatSenderName,
  isAssistantMessage,
} from "./chat-sender.ts";

const me = { id: "u-1", fullName: "Huynh Thai Tu" };
const participants = [
  { userId: "u-2", displayName: "Hanh Nhi" },
  { userId: "u-1", displayName: "Tu" },
];

const message = (over: Record<string, unknown> = {}) =>
  ({
    senderType: "user",
    messageType: "text",
    senderUserId: "u-2",
    senderDisplayName: "Hanh Nhi",
    ...over,
  }) as Parameters<typeof chatSenderName>[0];

test("WarpBot is recognised by the field the server actually sets", () => {
  // The panel asked messageType === "assistant". The server writes "assistant_response" and
  // marks the author with senderType "assistant", so the assistant branch never ran and
  // WarpBot's replies were labelled "User" — under the same name as a human's.
  assert.equal(
    isAssistantMessage({ senderType: "assistant", messageType: "assistant_response" }),
    true,
  );
  assert.equal(
    chatSenderName(
      message({ senderType: "assistant", messageType: "assistant_response", senderUserId: undefined }),
      me,
      participants,
    ),
    ASSISTANT_DISPLAY_NAME,
  );
});

test("a message from an older server is still recognised as the assistant", () => {
  assert.equal(isAssistantMessage({ senderType: "user", messageType: "assistant_response" }), true);
});

test("an ordinary message is never mistaken for the assistant", () => {
  assert.equal(isAssistantMessage({ senderType: "user", messageType: "text" }), false);
  assert.equal(chatSenderName(message(), me, participants), "Hanh Nhi");
});

test("my own messages carry my name", () => {
  assert.equal(
    chatSenderName(message({ senderUserId: "u-1", senderDisplayName: "Tu" }), me, participants),
    "Huynh Thai Tu",
  );
});

test("somebody who has left the room keeps the name the server sent", () => {
  // The old fallback went straight to "User", throwing away a name the message already
  // carried — so everyone who left lost their name on every message they had written.
  assert.equal(
    chatSenderName(
      message({ senderUserId: "u-9", senderDisplayName: "Manh Tuan" }),
      me,
      participants,
    ),
    "Manh Tuan",
  );
});

test("only a message with no name at all falls back to User", () => {
  assert.equal(
    chatSenderName(
      message({ senderUserId: "u-9", senderDisplayName: "" }),
      me,
      participants,
    ),
    "User",
  );
});
