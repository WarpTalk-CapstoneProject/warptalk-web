import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  filterWarpBotTools,
  getWarpBotToolsStats,
  TOOL_CATEGORIES,
  WARPBOT_TOOLS_CATALOG,
} from "../warpbot-tools-catalog.ts";

describe("WarpBot Tools Catalog Data & Functions", () => {
  test("contains exactly 14 tools as specified in data dictionary", () => {
    assert.equal(WARPBOT_TOOLS_CATALOG.length, 14);
  });

  test("all tools have valid fields, non-empty names, descriptions and prompts", () => {
    const seenIds = new Set<string>();

    for (const tool of WARPBOT_TOOLS_CATALOG) {
      assert.ok(tool.id && tool.id.trim().length > 0, "Tool id must not be empty");
      assert.ok(!seenIds.has(tool.id), `Duplicate tool id detected: ${tool.id}`);
      seenIds.add(tool.id);

      assert.ok(tool.name && tool.name.trim().length > 0, `Tool ${tool.id} has no name`);
      assert.ok(tool.shortDescription && tool.shortDescription.length > 10, `Tool ${tool.id} description too short`);
      assert.ok(tool.detailedDescription && tool.detailedDescription.length > 20, `Tool ${tool.id} detail too short`);
      assert.ok(tool.samplePrompts.length > 0, `Tool ${tool.id} must have at least one sample prompt`);
      assert.ok(tool.iconName, `Tool ${tool.id} must have an iconName`);
    }
  });

  test("get_platform_analytics is the only tool marked as isAdminOnly", () => {
    const adminTools = WARPBOT_TOOLS_CATALOG.filter((t) => t.isAdminOnly);
    assert.equal(adminTools.length, 1);
    assert.equal(adminTools[0].id, "get_platform_analytics");
    assert.equal(adminTools[0].scope, "platform_admin");
    assert.equal(adminTools[0].scopeBadge, "Platform Admin Only");
  });

  test("filtering by category works correctly", () => {
    const meetingsTools = filterWarpBotTools(WARPBOT_TOOLS_CATALOG, { category: "meetings" });
    assert.equal(meetingsTools.length, 4);
    assert.ok(meetingsTools.every((t) => t.category === "meetings"));

    const documentTools = filterWarpBotTools(WARPBOT_TOOLS_CATALOG, { category: "documents" });
    assert.equal(documentTools.length, 2);
    assert.ok(documentTools.every((t) => t.category === "documents"));
  });

  test("filtering by search query matches title, id, description or prompt", () => {
    const queryMeeting = filterWarpBotTools(WARPBOT_TOOLS_CATALOG, { searchQuery: "create_meeting" });
    assert.equal(queryMeeting.length, 1);
    assert.equal(queryMeeting[0].id, "create_meeting");

    const queryGlossary = filterWarpBotTools(WARPBOT_TOOLS_CATALOG, { searchQuery: "glossary" });
    assert.ok(queryGlossary.some((t) => t.id === "search_terminology"));

    const queryRevenue = filterWarpBotTools(WARPBOT_TOOLS_CATALOG, { searchQuery: "doanh thu" });
    assert.ok(queryRevenue.some((t) => t.id === "get_platform_analytics"));
  });

  test("scopeFilter accurately isolates admin only or workspace tools", () => {
    const adminOnly = filterWarpBotTools(WARPBOT_TOOLS_CATALOG, { scopeFilter: "admin_only" });
    assert.equal(adminOnly.length, 1);
    assert.equal(adminOnly[0].id, "get_platform_analytics");

    const workspaceOnly = filterWarpBotTools(WARPBOT_TOOLS_CATALOG, { scopeFilter: "workspace_only" });
    assert.equal(workspaceOnly.length, 13);
    assert.ok(workspaceOnly.every((t) => !t.isAdminOnly));
  });

  test("getWarpBotToolsStats calculates accurate totals", () => {
    const stats = getWarpBotToolsStats(WARPBOT_TOOLS_CATALOG);
    assert.equal(stats.total, 14);
    assert.equal(stats.adminOnlyCount, 1);
    assert.equal(stats.workspaceCount, 13);
    assert.ok(stats.categoriesCount >= 7);
  });

  test("TOOL_CATEGORIES contains all required categories", () => {
    assert.ok(TOOL_CATEGORIES.length >= 8);
    const categoryIds = TOOL_CATEGORIES.map((c) => c.id);
    assert.ok(categoryIds.includes("all"));
    assert.ok(categoryIds.includes("meetings"));
    assert.ok(categoryIds.includes("transcripts"));
    assert.ok(categoryIds.includes("knowledge"));
    assert.ok(categoryIds.includes("documents"));
    assert.ok(categoryIds.includes("translation"));
    assert.ok(categoryIds.includes("members"));
    assert.ok(categoryIds.includes("analytics"));
  });
});
