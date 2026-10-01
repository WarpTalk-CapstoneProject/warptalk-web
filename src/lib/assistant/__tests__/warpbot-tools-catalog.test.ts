import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { WarpBotBuiltInToolDto } from "../../../types/assistant.ts";
import {
  builtInToolsFromManifest,
  filterBuiltInTools,
  humaniseToolName,
  toolCategoriesOf,
  WARPBOT_TOOL_CATEGORIES,
  WARPBOT_TOOL_COPY,
} from "../warpbot-tools-catalog.ts";

/**
 * warptalk-ai `ai_assistant_worker/chat_tools.py` TOOLS (origin/development, 2026-10-01). Only used
 * to check the copy covers today's tools — the page's list comes from GET /assistant/tools.
 */
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

function row(name: string, overrides: Partial<WarpBotBuiltInToolDto> = {}): WarpBotBuiltInToolDto {
  return {
    name,
    category: "meetings",
    effect: "read",
    audience: "member",
    description: `${name} from the manifest`,
    ...overrides,
  };
}

describe("WarpBot built-in tool copy", () => {
  test("has copy for every tool the worker has today", () => {
    for (const name of WORKER_TOOL_NAMES) {
      assert.ok(WARPBOT_TOOL_COPY[name], `${name} has no copy`);
    }
  });

  test("every copy entry has a display name, a description and details", () => {
    for (const [name, copy] of Object.entries(WARPBOT_TOOL_COPY)) {
      assert.ok(copy.displayName.trim(), `${name} has no display name`);
      assert.ok(copy.description.length > 10, `${name} description too short`);
      assert.ok(copy.details.length > copy.description.length / 2, `${name} details too short`);
    }
  });

  test("every copy entry has at least one sample prompt", () => {
    for (const [name, copy] of Object.entries(WARPBOT_TOOL_COPY)) {
      assert.ok(copy.samplePrompts.length > 0, `${name} has no sample prompt`);
    }
  });
});

describe("built-in tools from the manifest", () => {
  test("lists exactly the server's rows, in its order, dressed with copy", () => {
    const tools = builtInToolsFromManifest([
      row("get_transcript"),
      row("create_meeting", { effect: "write" }),
    ]);
    assert.deepEqual(tools.map((tool) => tool.name), ["get_transcript", "create_meeting"]);
    assert.equal(tools[0].displayName, "Read meeting transcript");
    assert.equal(tools[0].description, WARPBOT_TOOL_COPY.get_transcript.description);
    assert.ok(tools[1].samplePrompts.length > 0);
    assert.equal(tools[1].effect, "write");
  });

  test("never hides a tool the copy does not know: humanised name + manifest description", () => {
    const [tool] = builtInToolsFromManifest([row("summarise_slide_deck", { category: "documents" })]);
    assert.equal(tool.displayName, "Summarise slide deck");
    assert.equal(tool.description, "summarise_slide_deck from the manifest");
    assert.equal(tool.details, "");
    assert.deepEqual(tool.samplePrompts, []);
    assert.equal(tool.category, "documents");
  });

  test("copy for a tool the server did not send is never listed", () => {
    const tools = builtInToolsFromManifest([row("ask_user", { category: "conversation" })]);
    assert.deepEqual(tools.map((tool) => tool.name), ["ask_user"]);
    assert.equal(builtInToolsFromManifest([]).length, 0);
  });

  test("category, effect and audience come from the server; unknown values fall back safely", () => {
    const [platform, odd, host] = builtInToolsFromManifest([
      row("get_platform_analytics", { category: "platform", audience: "platform_staff" }),
      row("mystery", { category: "minutes" as string, effect: "delete" as "read", audience: "x" as "member" }),
      row("share_meeting_minutes", { effect: "write", audience: "host" }),
    ]);
    assert.equal(platform.category, "platform");
    assert.equal(platform.audience, "platform_staff");
    assert.equal(odd.category, "other");
    assert.equal(odd.effect, "read");
    assert.equal(odd.audience, "member");
    assert.equal(host.audience, "host");
  });

  test("a duplicated name is listed once", () => {
    assert.equal(builtInToolsFromManifest([row("get_document"), row("get_document")]).length, 1);
  });

  test("chips: only categories that have a tool, in page order", () => {
    const member = builtInToolsFromManifest([
      row("search_terminology", { category: "glossary" }),
      row("create_meeting", { category: "meetings" }),
    ]);
    assert.deepEqual(toolCategoriesOf(member), ["meetings", "glossary"]);
    assert.ok(!toolCategoriesOf(member).includes("platform"));

    const staff = builtInToolsFromManifest([row("get_platform_analytics", { category: "platform" })]);
    assert.deepEqual(toolCategoriesOf(staff), ["platform"]);
    assert.ok(WARPBOT_TOOL_CATEGORIES.includes("other"));
  });

  test("filters by category and by a search over name, id, copy and prompts", () => {
    const tools = builtInToolsFromManifest([
      row("create_meeting", { category: "meetings", effect: "write" }),
      row("get_transcript", { category: "meetings" }),
      row("search_terminology", { category: "glossary" }),
      row("add_glossary_term", { category: "glossary", effect: "write" }),
    ]);
    assert.deepEqual(
      filterBuiltInTools(tools, { category: "glossary" }).map((tool) => tool.name).sort(),
      ["add_glossary_term", "search_terminology"],
    );
    assert.deepEqual(filterBuiltInTools(tools, { query: "create_meeting" }).map((tool) => tool.name), [
      "create_meeting",
    ]);
    assert.ok(filterBuiltInTools(tools, { query: "  TRANSCRIPT " }).some((tool) => tool.name === "get_transcript"));
    assert.equal(filterBuiltInTools(tools, { query: "zzzz-nothing" }).length, 0);
    assert.equal(filterBuiltInTools(tools).length, 4);
  });

  test("humanises snake_case names", () => {
    assert.equal(humaniseToolName("get_platform_analytics"), "Get platform analytics");
    assert.equal(humaniseToolName("x"), "X");
  });
});
