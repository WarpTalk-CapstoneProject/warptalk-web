import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  canManageWorkspacePlugins,
  collectMemberNames,
  createPrivatePluginRequest,
  describeMembersUsed,
  isOfferedInWorkspaceChat,
  memberPluginAction,
  pendingRequestBadge,
  plainTextErrorBody,
  pluginAddedByName,
  privatePluginUpdateRequest,
  validatePrivatePluginDraft,
  workspacePluginFacts,
  workspacePluginSubtitle,
  workspacePluginsTransitionNote,
} from "../plugin-availability.ts";
import type { WorkspacePluginItemDto } from "../../../types/assistant.ts";

function item(overrides: Partial<WorkspacePluginItemDto> = {}): WorkspacePluginItemDto {
  return {
    key: "linear",
    provider: "linear",
    label: "Linear",
    description: "Issues",
    kind: "mcp",
    availability: "added",
    membersUsedCount: 0,
    ...overrides,
  };
}

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

  test("the Owner adds instead of asking themselves, even over an old pending request", () => {
    assert.deepEqual(
      memberPluginAction(
        {
          workspaceAvailability: "not_added",
          requestStatus: "pending",
          installationStatus: "not_installed",
          canAddToWorkspace: true,
        },
        "WarpTalk Demo",
      ),
      { kind: "add", caption: "Not added to WarpTalk Demo yet", subtitle: null },
    );
  });

  test("no flag, or a false one, is a member's Request", () => {
    for (const canAddToWorkspace of [undefined, false]) {
      assert.equal(
        memberPluginAction(
          { workspaceAvailability: "not_added", installationStatus: "not_installed", canAddToWorkspace },
          "X",
        ).kind,
        "request",
      );
    }
  });

  test("the flag does not turn a plugin the workspace has, or an installed one, into Add", () => {
    assert.equal(
      memberPluginAction(
        { workspaceAvailability: "added", installationStatus: "not_installed", canAddToWorkspace: true },
        "X",
      ).kind,
      "connect",
    );
    assert.equal(
      memberPluginAction(
        { workspaceAvailability: "not_added", installationStatus: "installed", canAddToWorkspace: true },
        "X",
      ).kind,
      "connect",
    );
  });
});

describe("isOfferedInWorkspaceChat", () => {
  test("chat hides only what the workspace has not added", () => {
    assert.equal(isOfferedInWorkspaceChat({ workspaceAvailability: "not_added" }), false);
    assert.equal(isOfferedInWorkspaceChat({ workspaceAvailability: "added" }), true);
    assert.equal(isOfferedInWorkspaceChat({ workspaceAvailability: "private" }), true);
    assert.equal(isOfferedInWorkspaceChat({ workspaceAvailability: undefined }), true);
    assert.equal(isOfferedInWorkspaceChat({ workspaceAvailability: null }), true);
  });
});

describe("canManageWorkspacePlugins", () => {
  test("the server's answer wins when it gives one", () => {
    assert.equal(canManageWorkspacePlugins({ canManage: false }, "owner"), false);
    assert.equal(canManageWorkspacePlugins({ canManage: true }, "admin"), true);
  });

  test("without it, only the Owner role manages; an Admin views", () => {
    assert.equal(canManageWorkspacePlugins({}, "Owner"), true);
    assert.equal(canManageWorkspacePlugins(undefined, "owner"), true);
    assert.equal(canManageWorkspacePlugins({}, "admin"), false);
    assert.equal(canManageWorkspacePlugins({}, null), false);
  });
});

describe("pendingRequestBadge", () => {
  test("no badge for none", () => {
    assert.equal(pendingRequestBadge(undefined, true), null);
    assert.equal(pendingRequestBadge({ pendingRequests: [] }, true), null);
  });

  test("counts, and caps", () => {
    const one = { pendingRequests: [{}] } as never;
    assert.equal(pendingRequestBadge(one, true), "1");
    const many = { pendingRequests: Array.from({ length: 120 }, () => ({})) } as never;
    assert.equal(pendingRequestBadge(many, true), "99+");
  });

  test("no count for a caller who cannot answer the requests", () => {
    const three = { pendingRequests: [{}, {}, {}] } as never;
    assert.equal(pendingRequestBadge(three, false), null);
  });
});

describe("workspacePluginsTransitionNote", () => {
  test("nothing to say once the Owner has chosen", () => {
    assert.equal(
      workspacePluginsTransitionNote({ isCurated: true, inWorkspace: [], marketplace: [item()] }),
      null,
    );
  });

  test("the old switch on: every marketplace plugin reads as added", () => {
    assert.equal(
      workspacePluginsTransitionNote({ isCurated: false, inWorkspace: [item()], marketplace: [] }),
      "Every marketplace plugin is available here until this list is changed.",
    );
  });

  test("the old switch off: it must not claim every plugin is available", () => {
    const note = workspacePluginsTransitionNote({
      isCurated: false,
      inWorkspace: [item({ key: "crm", availability: "private" })],
      marketplace: [item()],
    });
    assert.ok(note);
    assert.doesNotMatch(note, /Every marketplace plugin/);
    assert.match(note, /No marketplace plugin is available here yet/);
  });

  test("an empty marketplace has no transition to explain", () => {
    assert.equal(workspacePluginsTransitionNote({ isCurated: false, inWorkspace: [], marketplace: [] }), null);
  });
});

describe("owner page copy", () => {
  test("usage line never claims a zero as usage", () => {
    assert.equal(describeMembersUsed(0), "Not used by any member yet");
    assert.equal(describeMembersUsed(null), "Not used by any member yet");
    assert.equal(describeMembersUsed(1), "Used by 1 member");
    assert.equal(describeMembersUsed(5), "Used by 5 members");
  });

  test("added by: the server's name first, then the member lookup, else nothing", () => {
    assert.equal(pluginAddedByName({ addedBy: "u1", addedByName: " Linh " }, { u1: "Other" }), "Linh");
    assert.equal(pluginAddedByName({ addedBy: "u1", addedByName: null }, { u1: "Minh" }), "Minh");
    assert.equal(pluginAddedByName({ addedBy: "u2" }, { u1: "Minh" }), null);
    assert.equal(pluginAddedByName({ addedBy: null }, {}), null);
  });

  test("the Manage line counts usage, never connections", () => {
    assert.equal(
      workspacePluginFacts(item({ membersUsedCount: 5 }), "Linh"),
      "Used by 5 members · added by Linh",
    );
    assert.equal(
      workspacePluginFacts(item({ availability: "private", authMode: "api_key" }), null),
      "Not used by any member yet · only this workspace · each member pastes an API key",
    );
    assert.doesNotMatch(workspacePluginFacts(item({ membersUsedCount: 3 }), null), /connected/);
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
    assert.deepEqual(
      Object.keys(validatePrivatePluginDraft({ label: "", mcpServerUrl: "", description: "", authMode: "oauth" })).sort(),
      ["label", "mcpServerUrl"],
    );
    assert.equal(
      validatePrivatePluginDraft({
        label: "CRM",
        mcpServerUrl: "http://crm.example.com",
        description: "",
        authMode: "oauth",
      }).mcpServerUrl,
      "Use an https:// URL.",
    );
    assert.deepEqual(
      validatePrivatePluginDraft({
        label: "CRM",
        mcpServerUrl: "https://crm.example.com/mcp",
        description: "",
        authMode: "api_key",
      }),
      {},
    );
  });
});

describe("private plugin bodies", () => {
  const draft = {
    label: " CRM ",
    mcpServerUrl: " https://crm.example.com/mcp ",
    description: "  ",
    authMode: "api_key" as const,
  };

  test("create sends how members connect, trimmed fields, and no empty description", () => {
    assert.deepEqual(createPrivatePluginRequest(draft), {
      label: "CRM",
      mcpServerUrl: "https://crm.example.com/mcp",
      description: undefined,
      authMode: "api_key",
    });
    assert.equal(createPrivatePluginRequest({ ...draft, authMode: "oauth" }).authMode, "oauth");
  });

  test("edit sends authMode only when the Owner changed it", () => {
    assert.equal(privatePluginUpdateRequest({ authMode: "api_key" }, draft).authMode, undefined);
    assert.equal(privatePluginUpdateRequest({ authMode: "oauth" }, draft).authMode, "api_key");
    // No authMode on the row means OAuth — an unchanged OAuth form sends nothing.
    assert.equal(privatePluginUpdateRequest({}, { ...draft, authMode: "oauth" }).authMode, undefined);
    assert.equal(privatePluginUpdateRequest({}, draft).authMode, "api_key");
  });
});

describe("plainTextErrorBody", () => {
  test("reads a text/plain refusal", () => {
    assert.equal(
      plainTextErrorBody({ response: { status: 409, data: " Already requested. " } }),
      "Already requested.",
    );
  });

  test("leaves JSON bodies, markup and non-errors to getErrorMessage", () => {
    assert.equal(plainTextErrorBody({ response: { data: { error: "x" } } }), null);
    assert.equal(plainTextErrorBody({ response: { data: "<html><body>502</body></html>" } }), null);
    assert.equal(plainTextErrorBody({ response: { data: "   " } }), null);
    assert.equal(plainTextErrorBody({ response: { data: "x".repeat(301) } }), null);
    assert.equal(plainTextErrorBody(new Error("boom")), null);
    assert.equal(plainTextErrorBody(null), null);
  });
});

describe("collectMemberNames", () => {
  const members = Array.from({ length: 250 }, (_, index) => ({
    userId: `u${index}`,
    fullName: index === 7 ? "" : `Member ${index}`,
    email: `m${index}@example.com`,
  }));

  function pager(total: number | null = members.length) {
    const calls: number[] = [];
    const fetchPage = async (page: number, pageSize: number) => {
      calls.push(page);
      const items = members.slice((page - 1) * pageSize, page * pageSize);
      return total === null ? { items } : { items, total };
    };
    return { calls, fetchPage };
  }

  test("finds a member past the first page", async () => {
    const { calls, fetchPage } = pager();
    const names = await collectMemberNames(["u3", "u230"], fetchPage);
    assert.deepEqual(names, { u3: "Member 3", u230: "Member 230" });
    assert.deepEqual(calls, [1, 2, 3]);
  });

  test("stops as soon as every id is found", async () => {
    const { calls, fetchPage } = pager();
    await collectMemberNames(["u1", "u2"], fetchPage);
    assert.deepEqual(calls, [1]);
  });

  test("falls back to the email, and leaves out who is not a member", async () => {
    const { calls, fetchPage } = pager();
    const names = await collectMemberNames(["u7", "gone", null, undefined], fetchPage);
    assert.deepEqual(names, { u7: "m7@example.com" });
    assert.deepEqual(calls, [1, 2, 3]);
  });

  test("stops at the end of the list without a total, and when there is nothing to find", async () => {
    const withoutTotal = pager(null);
    await collectMemberNames(["gone"], withoutTotal.fetchPage);
    assert.deepEqual(withoutTotal.calls, [1, 2, 3]);

    const nothing = pager();
    assert.deepEqual(await collectMemberNames([], nothing.fetchPage), {});
    assert.deepEqual(nothing.calls, []);
  });

  test("respects the page cap", async () => {
    const { calls, fetchPage } = pager();
    await collectMemberNames(["gone"], fetchPage, { pageSize: 10, maxPages: 4 });
    assert.deepEqual(calls, [1, 2, 3, 4]);
  });
});
