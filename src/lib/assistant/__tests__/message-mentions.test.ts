import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parseMessageMentions } from "../message-mentions.ts";

describe("WarpBot — mentions read back onto a user message", () => {
  test("reads the shape the send path stores, without the server's workspace stamp", () => {
    const raw = JSON.stringify([
      { entityType: "plugin", entityId: "google_meet", label: "Google Meet", workspaceId: "ws-1" },
    ]);
    assert.deepEqual(parseMessageMentions(raw), [
      { entityType: "plugin", entityId: "google_meet", label: "Google Meet" },
    ]);
  });

  test("absent, blank, or malformed JSON means no chips — never a thrown render", () => {
    for (const raw of [null, undefined, "", "   ", "{not json", '{"entityType":"plugin"}']) {
      assert.deepEqual(parseMessageMentions(raw), []);
    }
  });

  test("drops rows it cannot draw honestly, keeps the rest", () => {
    const raw = JSON.stringify([
      { entityType: "spaceship", entityId: "x", label: "X" },
      { entityType: "room", entityId: "", label: "Standup" },
      { entityType: "member", entityId: "u-1", label: "" },
      null,
      { entityType: "document", entityId: "d-1", label: "  Spec  " },
    ]);
    assert.deepEqual(parseMessageMentions(raw), [
      { entityType: "document", entityId: "d-1", label: "Spec" },
    ]);
  });

  test("the same entity twice is one chip", () => {
    const row = { entityType: "plugin", entityId: "google_drive", label: "Google Drive" };
    assert.deepEqual(parseMessageMentions(JSON.stringify([row, row])), [
      { entityType: "plugin", entityId: "google_drive", label: "Google Drive" },
    ]);
  });
});
