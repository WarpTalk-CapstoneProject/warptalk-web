import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  effectiveToolPolicyOf,
  groupToolsByEffect,
  memberCanChooseToolPolicy,
  pluginWritesAlwaysAllowed,
  readDisabledPluginKeys,
  summarizeToolPolicies,
  togglePluginKey,
  toolPolicyOf,
  trustsAWriteTool,
  writeDisabledPluginKeys,
  strictestToolPolicy,
  withWorkspaceToolRule,
  WORKSPACE_TOOL_RULE_OPTIONS,
  workspaceRuleOf,
  workspaceWriteLock,
  writeToolPolicyUpdate,
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

describe("Always allow in the WarpBot chat", () => {
  test("is null without write tools, and true only when every write tool is allowed", () => {
    assert.equal(pluginWritesAlwaysAllowed([tool()]), null);
    assert.equal(
      pluginWritesAlwaysAllowed([tool({ name: "a", effect: "write" }), tool({ name: "b", effect: "write", policy: "allow" })]),
      false,
    );
    assert.equal(
      pluginWritesAlwaysAllowed([tool(), tool({ name: "a", effect: "write", policy: "allow" })]),
      true,
    );
  });

  test("updates only the write tools, to allow or back to asking", () => {
    const tools = [tool(), tool({ name: "save_issue", effect: "write" })];
    assert.deepEqual(writeToolPolicyUpdate(tools, true), { save_issue: "allow" });
    assert.deepEqual(writeToolPolicyUpdate(tools, false), { save_issue: "approval" });
  });
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

describe("workspace rules (wave 2)", () => {
  test("the stricter of the member's choice and the workspace rule wins", () => {
    assert.equal(strictestToolPolicy("allow", null), "allow");
    assert.equal(strictestToolPolicy("allow", "approval"), "approval");
    assert.equal(strictestToolPolicy("blocked", "approval"), "blocked");
    assert.equal(strictestToolPolicy("approval", "blocked"), "blocked");
  });

  test("effectiveToolPolicyOf reads the rule beside the member's own policy", () => {
    assert.equal(effectiveToolPolicyOf(tool({ effect: "write", policy: "allow", workspacePolicy: "approval" })), "approval");
    assert.equal(effectiveToolPolicyOf(tool({ effect: "read", workspacePolicy: "blocked" })), "blocked");
    assert.equal(effectiveToolPolicyOf(tool({ effect: "read", workspacePolicy: null })), "allow");
  });

  test("an unknown rule value is ignored, as the server ignores it", () => {
    assert.equal(workspaceRuleOf(tool({ workspacePolicy: "allow" as never })), null);
    assert.equal(workspaceRuleOf(tool({})), null);
  });

  test("a member may only choose something at least as strict as the rule", () => {
    assert.equal(memberCanChooseToolPolicy("allow", null), true);
    assert.equal(memberCanChooseToolPolicy("allow", "approval"), false);
    assert.equal(memberCanChooseToolPolicy("approval", "approval"), true);
    assert.equal(memberCanChooseToolPolicy("blocked", "approval"), true);
    assert.equal(memberCanChooseToolPolicy("approval", "blocked"), false);
    assert.equal(memberCanChooseToolPolicy("blocked", "blocked"), true);
  });

  test("the Owner's control offers member's choice, ask and blocked — never allow", () => {
    assert.deepEqual([...WORKSPACE_TOOL_RULE_OPTIONS], [null, "approval", "blocked"]);
  });

  test("withWorkspaceToolRule replaces one tool's rule and leaves the rest", () => {
    const dto = {
      pluginKey: "linear",
      pluginLabel: "Linear",
      canManage: true,
      tools: [
        { name: "a", label: "A", description: "", effect: "read" as const, workspacePolicy: null },
        { name: "b", label: "B", description: "", effect: "write" as const, workspacePolicy: "blocked" as const },
      ],
    };
    const next = withWorkspaceToolRule(dto, "a", "approval");
    assert.equal(next.tools[0]!.workspacePolicy, "approval");
    assert.equal(next.tools[1]!.workspacePolicy, "blocked");
    assert.equal(dto.tools[0]!.workspacePolicy, null, "the cached list is not mutated");
    assert.equal(withWorkspaceToolRule(dto, "b", null).tools[1]!.workspacePolicy, null);
  });

  test("write tools under a rule are left out of Always allow, and lock it when they are all ruled", () => {
    const ruled = tool({ name: "create", effect: "write", policy: "approval", workspacePolicy: "approval" });
    const free = tool({ name: "update", effect: "write", policy: "allow" });
    assert.equal(workspaceWriteLock([ruled, free]), "some");
    assert.equal(pluginWritesAlwaysAllowed([ruled, free]), true);
    assert.deepEqual(writeToolPolicyUpdate([ruled, free], true), { update: "allow" });

    assert.equal(workspaceWriteLock([ruled]), "all");
    assert.equal(pluginWritesAlwaysAllowed([ruled]), false);
    assert.deepEqual(writeToolPolicyUpdate([ruled], true), {});

    assert.equal(workspaceWriteLock([free]), null);
  });
});
