import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  mentionTokenLabel,
  parseMessageMentions,
  splitMentionTokens,
} from "../message-mentions.ts";

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

describe("WarpBot — a mention is drawn where it was typed", () => {
  const meet = { entityType: "plugin" as const, entityId: "google_meet", label: "Google Meet" };
  const google = { entityType: "plugin" as const, entityId: "google", label: "Google" };

  test("the token becomes a chip in place, and the sentence keeps its end", () => {
    const { segments, unplaced } = splitMentionTokens("tạo 1 cuộc họp bằng @Google Meet nhé", [meet]);
    assert.deepEqual(segments, [
      { kind: "text", text: "tạo 1 cuộc họp bằng " },
      { kind: "mention", mention: meet },
      { kind: "text", text: " nhé" },
    ]);
    assert.deepEqual(unplaced, []);
  });

  test("a message sent before the token was kept draws its chips above, as before", () => {
    const { segments, unplaced } = splitMentionTokens("tao 1 cuoc hop bang", [meet]);
    assert.deepEqual(segments, [{ kind: "text", text: "tao 1 cuoc hop bang" }]);
    assert.deepEqual(unplaced, [meet]);
  });

  test("the longer label wins where one name contains another", () => {
    const { segments, unplaced } = splitMentionTokens("@Google Meet", [google, meet]);
    assert.deepEqual(segments, [{ kind: "mention", mention: meet }]);
    assert.deepEqual(unplaced, [google]);
  });
});

describe("WarpBot — a meeting's summary and transcript (WT-887)", () => {
  const room = { entityType: "room" as const, entityId: "r-1", label: "Standup" };
  const summary = { entityType: "summary" as const, entityId: "r-1", label: "Standup" };
  const transcript = { entityType: "transcript" as const, entityId: "r-1", label: "Standup" };

  test("read back from history like any other mention, bare title and all", () => {
    const raw = JSON.stringify([
      { ...summary, workspaceId: "ws-1" },
      { ...transcript, workspaceId: "ws-1" },
      { entityType: "minutes", entityId: "r-1", label: "Standup" },
    ]);
    // "minutes" is never offered by the web, so a row of it has no chip to draw.
    assert.deepEqual(parseMessageMentions(raw), [summary, transcript]);
  });

  test("the token carries the kind, so it does not collide with the room's own", () => {
    assert.equal(mentionTokenLabel(summary), "Summary · Standup");
    assert.equal(mentionTokenLabel(transcript), "Transcript · Standup");
    assert.equal(mentionTokenLabel(room), "Standup");
  });

  test("the room, its summary and its transcript each find their own token", () => {
    const { segments, unplaced } = splitMentionTokens(
      "so sánh @Summary · Standup với @Transcript · Standup của @Standup",
      [room, summary, transcript],
    );
    assert.deepEqual(segments, [
      { kind: "text", text: "so sánh " },
      { kind: "mention", mention: summary },
      { kind: "text", text: " với " },
      { kind: "mention", mention: transcript },
      { kind: "text", text: " của " },
      { kind: "mention", mention: room },
    ]);
    assert.deepEqual(unplaced, []);
  });
});
