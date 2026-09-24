import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  availabilityRequest,
  buildOverrideRequest,
  EMPTY_PLUGIN_WORKSPACE_FILTER,
  filterPluginWorkspaceRows,
  isOverridden,
  overrideReasonError,
  planOptions,
  rowOverrideActions,
  sortPluginWorkspaceRows,
  sourceKey,
  summarizePluginWorkspaceRows,
} from "../plugin-workspace-access.ts";
import type { AdminPluginWorkspaceRowDto } from "../../../types/admin-plugin-workspaces.ts";

function row(overrides: Partial<AdminPluginWorkspaceRowDto> = {}): AdminPluginWorkspaceRowDto {
  return {
    workspaceId: "ws-1",
    workspaceName: "Acme",
    workspaceSlug: "acme",
    workspaceStatus: "active",
    planSlug: "business",
    memberCount: 5,
    pluginKey: "linear",
    pluginLabel: "Linear",
    pluginAvatarUrl: null,
    pluginKind: "mcp",
    pluginDefault: "available",
    allowedPlans: null,
    enabled: true,
    source: "default",
    overrideState: null,
    overrideReason: null,
    overrideSetBy: null,
    overrideSetAt: null,
    onWorkspaceList: false,
    inUse: false,
    connectedUserIds: [],
    usageCount: 0,
    lastUsedAt: null,
    ...overrides,
  };
}

const acme = row();
const free = row({ workspaceId: "ws-2", workspaceName: "Free Co", workspaceSlug: "free-co", planSlug: "free", enabled: false, source: "plan" });
const pinned = row({
  workspaceId: "ws-3",
  workspaceName: "Beta",
  workspaceSlug: "beta",
  planSlug: null,
  enabled: false,
  source: "override",
  overrideState: "disabled",
  overrideReason: "security review",
  connectedUserIds: ["u1", "u2"],
  usageCount: 40,
  lastUsedAt: "2026-09-20T00:00:00Z",
});
const rows = [acme, free, pinned];

describe("filterPluginWorkspaceRows", () => {
  it("passes everything with the empty filter", () => {
    assert.equal(filterPluginWorkspaceRows(rows, EMPTY_PLUGIN_WORKSPACE_FILTER).length, 3);
  });

  it("filters by effective state", () => {
    assert.deepEqual(
      filterPluginWorkspaceRows(rows, { ...EMPTY_PLUGIN_WORKSPACE_FILTER, state: "disabled" }).map((r) => r.workspaceId),
      ["ws-2", "ws-3"],
    );
  });

  it("separates inherited from overridden", () => {
    assert.deepEqual(
      filterPluginWorkspaceRows(rows, { ...EMPTY_PLUGIN_WORKSPACE_FILTER, source: "overridden" }).map((r) => r.workspaceId),
      ["ws-3"],
    );
    assert.deepEqual(
      filterPluginWorkspaceRows(rows, { ...EMPTY_PLUGIN_WORKSPACE_FILTER, source: "inherited" }).map((r) => r.workspaceId),
      ["ws-1", "ws-2"],
    );
  });

  it("filters by plan, including workspaces with no plan", () => {
    assert.deepEqual(
      filterPluginWorkspaceRows(rows, { ...EMPTY_PLUGIN_WORKSPACE_FILTER, plan: "none" }).map((r) => r.workspaceId),
      ["ws-3"],
    );
    assert.deepEqual(
      filterPluginWorkspaceRows(rows, { ...EMPTY_PLUGIN_WORKSPACE_FILTER, plan: "Business" }).map((r) => r.workspaceId),
      ["ws-1"],
    );
  });

  it("searches name, slug, plugin and the override reason", () => {
    const search = (text: string) =>
      filterPluginWorkspaceRows(rows, { ...EMPTY_PLUGIN_WORKSPACE_FILTER, search: text }).map((r) => r.workspaceId);
    assert.deepEqual(search("free-co"), ["ws-2"]);
    assert.deepEqual(search("SECURITY"), ["ws-3"]);
    assert.equal(search("linear").length, 3);
  });
});

describe("sortPluginWorkspaceRows", () => {
  it("sorts by name and reverses", () => {
    assert.deepEqual(sortPluginWorkspaceRows(rows, "workspace", "asc").map((r) => r.workspaceName), ["Acme", "Beta", "Free Co"]);
    assert.deepEqual(sortPluginWorkspaceRows(rows, "workspace", "desc").map((r) => r.workspaceName), ["Free Co", "Beta", "Acme"]);
  });

  it("puts workspaces with no plan last when sorting by plan", () => {
    assert.deepEqual(sortPluginWorkspaceRows(rows, "plan", "asc").map((r) => r.planSlug), ["business", "free", null]);
  });

  it("sorts by connected members and usage", () => {
    assert.equal(sortPluginWorkspaceRows(rows, "connected", "desc")[0].workspaceId, "ws-3");
    assert.equal(sortPluginWorkspaceRows(rows, "usage", "desc")[0].workspaceId, "ws-3");
  });

  it("does not mutate its input", () => {
    const before = rows.map((r) => r.workspaceId);
    sortPluginWorkspaceRows(rows, "workspace", "desc");
    assert.deepEqual(rows.map((r) => r.workspaceId), before);
  });
});

describe("rowOverrideActions", () => {
  it("offers enable (to pin) and disable on an inherited row, and no reset", () => {
    assert.deepEqual(rowOverrideActions(acme), ["enable", "disable"]);
  });

  it("offers enable and reset on a row turned off by an override", () => {
    assert.deepEqual(rowOverrideActions(pinned), ["enable", "reset"]);
  });

  it("offers nothing on a retired plugin, which nothing overrides", () => {
    assert.deepEqual(rowOverrideActions(row({ source: "retired", enabled: false, overrideState: "enabled" })), []);
  });
});

describe("overrideReasonError", () => {
  it("requires a reason to disable, and only to disable", () => {
    assert.equal(overrideReasonError("disable", "  "), "reasonRequired");
    assert.equal(overrideReasonError("disable", "vendor outage"), null);
    assert.equal(overrideReasonError("enable", ""), null);
    assert.equal(overrideReasonError("reset", ""), null);
  });

  it("caps the reason at the column's 500 characters", () => {
    assert.equal(overrideReasonError("enable", "x".repeat(501)), "reasonTooLong");
  });
});

describe("buildOverrideRequest", () => {
  it("trims, de-duplicates and leaves empties out", () => {
    assert.deepEqual(
      buildOverrideRequest({ action: "enable", reason: "  ", workspaceIds: ["a", "a", "b"], planSlugs: [] }),
      { action: "enable", workspaceIds: ["a", "b"] },
    );
    assert.deepEqual(
      buildOverrideRequest({ action: "disable", reason: " pilot over ", planSlugs: [" Business", "enterprise", "business"] }),
      { action: "disable", reason: "pilot over", planSlugs: ["business", "enterprise"] },
    );
  });
});

describe("availabilityRequest", () => {
  it("sends every plan as an empty rule", () => {
    assert.deepEqual(availabilityRequest("opt_in", []), { default: "opt_in", allowedPlans: [] });
    assert.deepEqual(availabilityRequest("available", ["Business", "business"]), {
      default: "available",
      allowedPlans: ["business"],
    });
  });
});

describe("summaries and labels", () => {
  it("counts enabled, off, overridden and in-use workspaces", () => {
    assert.deepEqual(summarizePluginWorkspaceRows([...rows, row({ workspaceId: "ws-4", inUse: true })]), {
      total: 4,
      enabled: 2,
      disabled: 2,
      overridden: 1,
      inUse: 1,
    });
  });

  it("lists each plan once, sorted, without the no-plan rows", () => {
    assert.deepEqual(planOptions(rows), ["business", "free"]);
  });

  it("names why a row is in its state", () => {
    assert.equal(sourceKey(acme), "inherited");
    assert.equal(sourceKey(free), "plan");
    assert.equal(sourceKey(pinned), "override");
    assert.equal(sourceKey(row({ enabled: false, source: "default", pluginDefault: "opt_in" })), "optIn");
    assert.equal(sourceKey(row({ enabled: false, source: "retired" })), "retired");
    assert.equal(isOverridden(pinned), true);
    assert.equal(isOverridden(acme), false);
  });
});
