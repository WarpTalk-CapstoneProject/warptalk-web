import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { composerReadiness } from "../composer-readiness.ts";

const WORKSPACE = "ws-1";

describe("WT-541 — WarpBot's composer in the admin portal", () => {
  test("with a workspace and a message, it sends", () => {
    const state = composerReadiness({
      text: "hello",
      attachmentCount: 0,
      activeWorkspaceId: WORKSPACE,
    });

    assert.equal(state.canSend, true);
    assert.equal(state.blocker, null);
    assert.equal(state.hint, null);
    // The id travels WITH the yes, so the send handler cannot re-derive a different one.
    assert.equal(state.workspaceId, WORKSPACE);
  });

  test("a refusal carries no workspace to send to", () => {
    // Which is what stops a caller reading the id off a "no" and sending anyway.
    for (const activeWorkspaceId of [null, WORKSPACE]) {
      const state = composerReadiness({ text: "", attachmentCount: 0, activeWorkspaceId });
      assert.equal(state.canSend, false);
      assert.equal(state.workspaceId, null);
    }
  });

  test("an attachment on its own is a question", () => {
    // WT-474. "What is this?" is a real turn.
    const state = composerReadiness({
      text: "   ",
      attachmentCount: 1,
      activeWorkspaceId: WORKSPACE,
    });

    assert.equal(state.canSend, true);
  });

  test("no active workspace blocks the send — the reported bug", () => {
    // The admin portal lives outside [workspaceSlug], so nothing there sets one. This used to
    // let the button look alive and swallow the turn.
    const state = composerReadiness({
      text: "hello",
      attachmentCount: 0,
      activeWorkspaceId: null,
    });

    assert.equal(state.canSend, false);
    assert.equal(state.blocker, "no-workspace");
    assert.match(state.hint ?? "", /workspace/i);
  });

  test("an attachment does not get around the missing workspace either", () => {
    const state = composerReadiness({
      text: "",
      attachmentCount: 3,
      activeWorkspaceId: undefined,
    });

    assert.equal(state.blocker, "no-workspace");
  });

  test("the missing workspace is reported before the empty box", () => {
    // It is the blocker that survives whatever they type next, so it is the one worth saying
    // while the box is still empty — before they compose a question into a dead composer.
    const state = composerReadiness({
      text: "",
      attachmentCount: 0,
      activeWorkspaceId: null,
    });

    assert.equal(state.blocker, "no-workspace");
  });

  test("an empty box with a workspace says so, and says something different", () => {
    const state = composerReadiness({
      text: "",
      attachmentCount: 0,
      activeWorkspaceId: WORKSPACE,
    });

    assert.equal(state.canSend, false);
    assert.equal(state.blocker, "empty");
    assert.doesNotMatch(state.hint ?? "", /workspace/i);
  });

  test("whitespace is not a message", () => {
    const state = composerReadiness({
      text: "  \n\t ",
      attachmentCount: 0,
      activeWorkspaceId: WORKSPACE,
    });

    assert.equal(state.blocker, "empty");
  });

  test("an empty-string workspace id is no workspace", () => {
    // The widget reads `context.workspaceId ?? ""` in places, so "" reaches this.
    const state = composerReadiness({
      text: "hello",
      attachmentCount: 0,
      activeWorkspaceId: "",
    });

    assert.equal(state.blocker, "no-workspace");
  });
});
