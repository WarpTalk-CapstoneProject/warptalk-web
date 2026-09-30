import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  assistantScopeFor,
  isAdminPortalPath,
  PLATFORM_SCOPE_LABEL,
  PLATFORM_SUGGESTED_PROMPTS,
} from "../assistant-scope.ts";
import { composerReadiness } from "../composer-readiness.ts";
import { answerSourceHref, isAdminPath, parseAnswerSources } from "../answer-sources.ts";

describe("platform-scope WarpBot — which widget opens where", () => {
  test("a system admin on /admin gets the platform WarpBot", () => {
    for (const pathname of ["/admin", "/admin/workspaces/acme", "/admin/health"]) {
      assert.equal(assistantScopeFor({ pathname, isSystemAdmin: true }), "platform", pathname);
    }
  });

  test("a workspace page keeps today's behaviour, admin or not", () => {
    for (const pathname of ["/acme/meetings", "/acme/admin", "/administrator", "/", null]) {
      assert.equal(assistantScopeFor({ pathname, isSystemAdmin: true }), "workspace", String(pathname));
      assert.equal(assistantScopeFor({ pathname, isSystemAdmin: false }), "workspace", String(pathname));
    }
  });

  test("a non-admin who reaches /admin is not offered the platform mode", () => {
    // The server refuses the platform routes anyway; this just keeps the widget honest.
    assert.equal(assistantScopeFor({ pathname: "/admin", isSystemAdmin: false }), "workspace");
    assert.equal(isAdminPortalPath("/admin-tools"), false);
  });

  test("the chip and the three suggested prompts are the ones the owner asked for", () => {
    assert.equal(PLATFORM_SCOPE_LABEL, "Platform");
    assert.deepEqual(
      [...PLATFORM_SUGGESTED_PROMPTS],
      [
        "Revenue this month vs last",
        "Workspaces running low on credits",
        "Any failing pipeline stages today?",
      ],
    );
  });
});

describe("platform-scope WarpBot — the composer", () => {
  test("platform scope sends with no workspace, and the yes carries none", () => {
    const state = composerReadiness({
      text: "Revenue this month vs last",
      attachmentCount: 0,
      activeWorkspaceId: null,
      scope: "platform",
    });
    assert.equal(state.canSend, true);
    assert.equal(state.scope, "platform");
    assert.equal(state.workspaceId, null);
  });

  test("platform scope ignores a stale active workspace — the turn still belongs to none", () => {
    // An admin who visited a workspace earlier has one persisted in zustand.
    const state = composerReadiness({
      text: "hi",
      attachmentCount: 0,
      activeWorkspaceId: "ws-1",
      scope: "platform",
    });
    assert.equal(state.workspaceId, null);
  });

  test("platform scope is text only: an attachment alone is not a platform question", () => {
    const state = composerReadiness({
      text: "",
      attachmentCount: 2,
      activeWorkspaceId: null,
      scope: "platform",
    });
    assert.equal(state.canSend, false);
    assert.equal(state.blocker, "empty");
  });

  test("workspace scope is unchanged — still no workspace, no send (WT-541)", () => {
    const state = composerReadiness({ text: "hi", attachmentCount: 0, activeWorkspaceId: null });
    assert.equal(state.canSend, false);
    assert.equal(state.blocker, "no-workspace");
  });
});

describe("platform-scope WarpBot — admin page citations", () => {
  test("an admin chip links to its /admin page", () => {
    const [source] = parseAnswerSources(
      JSON.stringify([{ marker: "S1", kind: "admin", title: "Workspace · Acme", ref: "/admin/workspaces/acme" }]),
    );
    assert.equal(source.kind, "admin");
    assert.equal(answerSourceHref(source), "/admin/workspaces/acme");
    assert.equal(
      answerSourceHref({ ...source, ref: "/admin?period=month&month=2026-08" }),
      "/admin?period=month&month=2026-08",
    );
  });

  test("a model-chosen ref cannot escape the admin portal", () => {
    for (const ref of [
      "//evil.test/admin",
      "https://evil.test/admin",
      "javascript:alert(1)",
      "/admin/../acme/documents",
      "/administrator",
      "/acme/admin",
      "/admin\\\\evil",
    ]) {
      assert.equal(isAdminPath(ref), false, ref);
      assert.equal(answerSourceHref({ marker: "S1", kind: "admin", title: "x", ref }), null, ref);
    }
  });
});
