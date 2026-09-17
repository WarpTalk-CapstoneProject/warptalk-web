import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  groupToolsByEffect,
  readDisabledPluginKeys,
  summarizeToolPolicies,
  togglePluginKey,
  toolPolicyOf,
  trustsAWriteTool,
  writeDisabledPluginKeys,
  type KeyValueStore,
} from "../tool-policy.ts";
import type { McpToolDescriptorDto } from "../../../types/assistant.ts";

function tool(overrides: Partial<McpToolDescriptorDto> = {}): McpToolDescriptorDto {
  return {
    name: "list_issues",
    pluginKey: "linear",
    label: "List issues",
    description: "",
    effect: "read",
    requiredScopes: [],
    parameters: {},
    ...overrides,
  };
}

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("toolPolicyOf", () => {
  test("uses the server's resolved choice when it sends one", () => {
    assert.equal(toolPolicyOf(tool({ effect: "write", policy: "allow" })), "allow");
  });

  test("falls back to the same default the server uses: reads run, writes ask", () => {
    assert.equal(toolPolicyOf(tool({ effect: "read" })), "allow");
    assert.equal(toolPolicyOf(tool({ effect: "write" })), "approval");
  });
});

describe("groupToolsByEffect", () => {
  test("puts read tools first, drops an empty group, and reports a mixed group as null", () => {
    const groups = groupToolsByEffect([
      tool({ name: "save_issue", effect: "write", policy: "approval" }),
      tool({ name: "delete_comment", effect: "write", policy: "blocked" }),
      tool({ name: "save_issue", effect: "write", policy: "approval" }),
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.title, "Write tools");
    assert.equal(groups[0]!.tools.length, 2, "a duplicated tool name is listed once");
    assert.equal(groups[0]!.policy, null);
  });

  test("reports the shared choice when every tool in a group agrees", () => {
    const [read] = groupToolsByEffect([tool({ name: "a" }), tool({ name: "b" })]);
    assert.equal(read!.policy, "allow");
  });
});

test("summarizeToolPolicies counts each tool once", () => {
  assert.equal(
    summarizeToolPolicies([
      tool({ name: "a" }),
      tool({ name: "b", effect: "write" }),
      tool({ name: "c", effect: "write", policy: "blocked" }),
    ]),
    "1 allowed · 1 ask · 1 blocked",
  );
});

test("trustsAWriteTool is true only for a write tool set to allow", () => {
  assert.equal(trustsAWriteTool([tool({ policy: "allow" })]), false);
  assert.equal(trustsAWriteTool([tool({ effect: "write", policy: "allow" })]), true);
});

describe("disabled plugins per conversation", () => {
  test("round-trips per conversation and forgets an empty list", () => {
    const store = memoryStore();

    writeDisabledPluginKeys(store, "c1", ["linear", "linear", "notion"]);
    assert.deepEqual(readDisabledPluginKeys(store, "c1"), ["linear", "notion"]);
    assert.deepEqual(readDisabledPluginKeys(store, "c2"), [], "another conversation is unaffected");

    writeDisabledPluginKeys(store, "c1", []);
    assert.equal(store.data.size, 0);
  });

  test("reads a corrupt or missing entry as every plugin on", () => {
    const store = memoryStore();
    store.setItem("warpbot:disabled-plugins:c1", "{not json");
    assert.deepEqual(readDisabledPluginKeys(store, "c1"), []);
    assert.deepEqual(readDisabledPluginKeys(null, "c1"), []);
  });

  test("togglePluginKey switches one key", () => {
    assert.deepEqual(togglePluginKey([], "linear"), ["linear"]);
    assert.deepEqual(togglePluginKey(["linear", "notion"], "linear"), ["notion"]);
  });
});
