import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  describeMembersUsed,
  memberPluginAction,
  pendingRequestBadge,
  validatePrivatePluginDraft,
  workspacePluginSubtitle,
} from "../plugin-availability.ts";

describe("memberPluginAction", () => {
  test("a plugin the workspace has is connected as before", () => {
    assert.deepEqual(
      memberPluginAction({ workspaceAvailability: "added", installationStatus: "not_installed" }, "WarpTalk Demo"),
      { kind: "connect", caption: null, subtitle: null },
    );
  });

  test("a listing with no workspace verdict behaves exactly as before the marketplace", () => {
    assert.equal(
      memberPluginAction({ workspaceAvailability: undefined, installationStatus: "not_installed" }, "X").kind,
      "connect",
    );
  });

  test("a private plugin says the workspace added it", () => {
    const action = memberPluginAction({ workspaceAvailability: "private", installationStatus: "not_installed" }, "X");
    assert.equal(action.kind, "connect");
    assert.equal(action.subtitle, "Added by your workspace");
  });

  test("a plugin the workspace does not have is requested, naming the workspace", () => {
    assert.deepEqual(
      memberPluginAction({ workspaceAvailability: "not_added", installationStatus: "not_installed" }, "WarpTalk Demo"),
      { kind: "request", caption: "Not added to WarpTalk Demo yet", subtitle: null },
    );
  });

  test("an already-asked plugin waits for the owner", () => {
    assert.deepEqual(
      memberPluginAction(
        { workspaceAvailability: "not_added", requestStatus: "pending", installationStatus: "not_installed" },
        "WarpTalk Demo",
      ),
      { kind: "requested", caption: "Waiting for your workspace owner", subtitle: null },
    );
  });

  test("an installed plugin the workspace does not have keeps its dialog, so the grant can be revoked", () => {
    const action = memberPluginAction(
      { workspaceAvailability: "not_added", requestStatus: "pending", installationStatus: "installed" },
      "WarpTalk Demo",
    );
    assert.equal(action.kind, "connect");
    assert.equal(action.caption, "Not added to WarpTalk Demo yet");
  });

  test("a missing workspace name still reads as a sentence", () => {
    assert.equal(
      memberPluginAction({ workspaceAvailability: "not_added", installationStatus: "not_installed" }, null).caption,
      "Not added to this workspace yet",
    );
  });
});

describe("pendingRequestBadge", () => {
  test("no badge for none", () => {
    assert.equal(pendingRequestBadge(undefined), null);
    assert.equal(pendingRequestBadge({ pendingRequests: [] }), null);
  });

  test("counts, and caps", () => {
    const one = { pendingRequests: [{}] } as never;
    assert.equal(pendingRequestBadge(one), "1");
    const many = { pendingRequests: Array.from({ length: 120 }, () => ({})) } as never;
    assert.equal(pendingRequestBadge(many), "99+");
  });
});

describe("owner page copy", () => {
  test("usage line never claims a zero as usage", () => {
    assert.equal(describeMembersUsed(0), "No member has used it here yet");
    assert.equal(describeMembersUsed(1), "1 member has used it here");
    assert.equal(describeMembersUsed(5), "5 members have used it here");
  });

  test("a private plugin shows its server and its scope", () => {
    assert.equal(
      workspacePluginSubtitle({ availability: "private", description: "", mcpServerUrl: "https://crm.warptalk.io.vn/mcp" }),
      "crm.warptalk.io.vn/mcp · only this workspace",
    );
    assert.equal(
      workspacePluginSubtitle({ availability: "added", description: "Turn action items into issues", mcpServerUrl: null }),
      "Turn action items into issues",
    );
  });
});

describe("validatePrivatePluginDraft", () => {
  test("needs a name and an https URL", () => {
    assert.deepEqual(Object.keys(validatePrivatePluginDraft({ label: "", mcpServerUrl: "", description: "" })).sort(), [
      "label",
      "mcpServerUrl",
    ]);
    assert.equal(
      validatePrivatePluginDraft({ label: "CRM", mcpServerUrl: "http://crm.example.com", description: "" }).mcpServerUrl,
      "Use an https:// URL.",
    );
    assert.deepEqual(
      validatePrivatePluginDraft({ label: "CRM", mcpServerUrl: "https://crm.example.com/mcp", description: "" }),
      {},
    );
  });
});
