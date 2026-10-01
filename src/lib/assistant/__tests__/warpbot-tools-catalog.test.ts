import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { AssistantPluginCatalogItemDto, McpToolDescriptorDto } from "../../../types/assistant.ts";
import {
  filterBuiltInTools,
  visibleBuiltInTools,
  visibleToolCategories,
  WARPBOT_BUILT_IN_TOOLS,
  WARPBOT_TOOL_CATEGORIES,
} from "../warpbot-tools-catalog.ts";
import { pluginToolsOfferedToWarpBot } from "../warpbot-plugin-tools.ts";

/** warptalk-ai `ai_assistant_worker/chat_tools.py` TOOLS, origin/development (2026-10-01). */
const WORKER_TOOL_NAMES = [
  "ask_user",
  "create_meeting",
  "create_action_item",
  "create_glossary",
  "add_glossary_term",
  "share_meeting_minutes",
  "search_workspace_members",
  "search_terminology",
  "list_recent_meetings",
  "translate_text",
  "search_facts",
  "semantic_search",
  "get_meeting_summary",
  "get_room_detail",
  "get_transcript",
  "search_documents",
  "get_document",
  "get_platform_analytics",
];

const WRITE_TOOL_NAMES = [
  "create_meeting",
  "create_action_item",
  "create_glossary",
  "add_glossary_term",
  "share_meeting_minutes",
];

describe("WarpBot built-in tools catalog", () => {
  test("lists exactly the worker's 18 tools, once each", () => {
    const names = WARPBOT_BUILT_IN_TOOLS.map((tool) => tool.name);
    assert.equal(new Set(names).size, names.length, "duplicate tool name");
    assert.deepEqual([...names].sort(), [...WORKER_TOOL_NAMES].sort());
  });

  test("marks exactly the five write tools as changing data", () => {
    const writes = WARPBOT_BUILT_IN_TOOLS.filter((tool) => tool.effect === "write").map((tool) => tool.name);
    assert.deepEqual(writes.sort(), [...WRITE_TOOL_NAMES].sort());
  });

  test("every row has copy, a known category and at least one sample prompt", () => {
    for (const tool of WARPBOT_BUILT_IN_TOOLS) {
      assert.ok(tool.displayName.trim(), `${tool.name} has no display name`);
      assert.ok(tool.description.length > 10, `${tool.name} description too short`);
      assert.ok(tool.details.length > tool.description.length / 2, `${tool.name} details too short`);
      assert.ok(WARPBOT_TOOL_CATEGORIES.includes(tool.category), `${tool.name} has unknown category`);
      assert.ok(tool.samplePrompts.length > 0, `${tool.name} has no sample prompt`);
    }
  });

  test("audiences: minutes sharing is host-only, analytics is platform-admin-only", () => {
    const byName = Object.fromEntries(WARPBOT_BUILT_IN_TOOLS.map((tool) => [tool.name, tool]));
    assert.equal(byName.share_meeting_minutes.audience, "host");
    assert.equal(byName.get_platform_analytics.audience, "platform_admin");
    assert.equal(byName.get_platform_analytics.category, "platform");
    const others = WARPBOT_BUILT_IN_TOOLS.filter(
      (tool) => !["share_meeting_minutes", "get_platform_analytics"].includes(tool.name),
    );
    assert.ok(others.every((tool) => tool.audience === "all"));
  });

  test("platform analytics and the Platform chip are hidden from everyone but platform staff", () => {
    const member = visibleBuiltInTools(WARPBOT_BUILT_IN_TOOLS, { isPlatformStaff: false });
    assert.equal(member.length, 17);
    assert.ok(!member.some((tool) => tool.name === "get_platform_analytics"));
    assert.ok(!visibleToolCategories({ isPlatformStaff: false }).includes("platform"));

    const staff = visibleBuiltInTools(WARPBOT_BUILT_IN_TOOLS, { isPlatformStaff: true });
    assert.equal(staff.length, 18);
    assert.ok(visibleToolCategories({ isPlatformStaff: true }).includes("platform"));
  });

  test("filters by category and by a search over name, id, copy and prompts", () => {
    const glossary = filterBuiltInTools(WARPBOT_BUILT_IN_TOOLS, { category: "glossary" });
    assert.deepEqual(
      glossary.map((tool) => tool.name).sort(),
      ["add_glossary_term", "create_glossary", "search_terminology"],
    );

    assert.deepEqual(
      filterBuiltInTools(WARPBOT_BUILT_IN_TOOLS, { query: "create_meeting" }).map((tool) => tool.name),
      ["create_meeting"],
    );
    assert.ok(
      filterBuiltInTools(WARPBOT_BUILT_IN_TOOLS, { query: "  TRANSCRIPT " }).some(
        (tool) => tool.name === "get_transcript",
      ),
    );
    assert.equal(filterBuiltInTools(WARPBOT_BUILT_IN_TOOLS, { query: "zzzz-nothing" }).length, 0);
    assert.equal(filterBuiltInTools(WARPBOT_BUILT_IN_TOOLS).length, 18);
  });
});

function tool(name: string, overrides: Partial<McpToolDescriptorDto> = {}): McpToolDescriptorDto {
  return {
    name,
    pluginKey: "p",
    label: name,
    description: `${name} description`,
    effect: "read",
    requiredScopes: [],
    parameters: {},
    ...overrides,
  };
}

function plugin(overrides: Partial<AssistantPluginCatalogItemDto> = {}): AssistantPluginCatalogItemDto {
  return {
    key: "google_drive",
    label: "Google Drive",
    description: "Drive",
    requiredScopes: ["drive"],
    grantedScopes: ["drive"],
    installationStatus: "installed",
    connectionStatus: "connected",
    tools: [tool("search_files"), tool("create_file", { effect: "write" })],
    workspaceAvailability: "added",
    ...overrides,
  };
}

describe("plugin tools WarpBot is offered", () => {
  test("a connected plugin the workspace has lists its tools", () => {
    const groups = pluginToolsOfferedToWarpBot([plugin()]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].tools.map((t) => t.name), ["search_files", "create_file"]);
  });

  test("a blocked tool is never listed, and a plugin with nothing left is dropped", () => {
    const partly = pluginToolsOfferedToWarpBot([
      plugin({ tools: [tool("search_files"), tool("create_file", { effect: "write", policy: "blocked" })] }),
    ]);
    assert.deepEqual(partly[0].tools.map((t) => t.name), ["search_files"]);

    const all = pluginToolsOfferedToWarpBot([plugin({ tools: [tool("search_files", { policy: "blocked" })] })]);
    assert.equal(all.length, 0);
  });

  test("not connected, missing scopes, not installed or not in this workspace means nothing is offered", () => {
    const refused = [
      plugin({ connectionStatus: "not_connected" }),
      plugin({ connectionStatus: "expired" }),
      plugin({ grantedScopes: [] }),
      plugin({ installationStatus: "disabled" }),
      plugin({ workspaceAvailability: "not_added" }),
      plugin({ workspaceAvailability: "platform_disabled" }),
      plugin({ workspacePolicyBlockReason: "Plugins are off in this workspace" }),
    ];
    for (const row of refused) {
      assert.equal(pluginToolsOfferedToWarpBot([row]).length, 0, JSON.stringify(row));
    }
  });

  test("a private workspace plugin and a row with no workspace verdict are offered", () => {
    assert.equal(pluginToolsOfferedToWarpBot([plugin({ workspaceAvailability: "private" })]).length, 1);
    assert.equal(pluginToolsOfferedToWarpBot([plugin({ workspaceAvailability: undefined })]).length, 1);
  });
});
