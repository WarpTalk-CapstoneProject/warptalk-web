import type {
  McpToolDescriptorDto,
  PluginToolPolicy,
  WorkspaceToolPoliciesDto,
  WorkspaceToolRule,
} from "../../types/assistant.ts";

/* ---------------------------------------------------------------------------------------------
 * PER-TOOL CHOICES (WT-687)
 *
 *   Modelled on Claude's connectors: each tool is Always allow, Needs approval or Blocked, and a
 *   tool nobody has touched follows what it does — read tools run, write tools ask. That default
 *   is exactly the rule every tool followed before users could choose, so a user who never opens
 *   the settings sees no change.
 *
 *   The server resolves the choice and sends it as `policy`. The fallback here only covers a
 *   server older than the setting, and it has to agree with the server's own default or the dialog
 *   would show one thing while WarpBot did another.
 * ------------------------------------------------------------------------------------------- */

export const TOOL_POLICIES: readonly PluginToolPolicy[] = ["allow", "approval", "blocked"];

export const TOOL_POLICY_LABEL: Record<PluginToolPolicy, string> = {
  allow: "Allow",
  approval: "Ask",
  blocked: "Block",
};

export function defaultToolPolicy(effect: McpToolDescriptorDto["effect"]): PluginToolPolicy {
  return effect === "read" ? "allow" : "approval";
}

export function toolPolicyOf(tool: McpToolDescriptorDto): PluginToolPolicy {
  return tool.policy ?? defaultToolPolicy(tool.effect);
}

export interface ToolPolicyGroup {
  effect: McpToolDescriptorDto["effect"];
  title: string;
  tools: McpToolDescriptorDto[];
  /** The group's shared choice, or null when its tools disagree. */
  policy: PluginToolPolicy | null;
}

/** Optional translator, defaulted to English so the node:test contract for this file (and any
 * caller that has not been migrated to next-intl) keeps working unchanged. */
export type ToolPolicyTranslator = (key: string) => string;

/**
 * Read-only tools first and write tools last, which puts the heavier permission closest to the
 * warning about it. A group with no tools is left out rather than rendered empty.
 */
export function groupToolsByEffect(
  tools: readonly McpToolDescriptorDto[],
  t?: ToolPolicyTranslator,
): ToolPolicyGroup[] {
  const seen = new Set<string>();
  const unique = tools.filter((tool) => {
    if (seen.has(tool.name)) return false;
    seen.add(tool.name);
    return true;
  });

  return (["read", "write"] as const)
    .map((effect) => {
      const groupTools = unique.filter((tool) => tool.effect === effect);
      const policies = new Set(groupTools.map(toolPolicyOf));
      const defaultTitle = effect === "read" ? "Read-only tools" : "Write tools";
      return {
        effect,
        title: t ? t(effect === "read" ? "readOnlyTools" : "writeTools") : defaultTitle,
        tools: groupTools,
        policy: policies.size === 1 ? [...policies][0]! : null,
      };
    })
    .filter((group) => group.tools.length > 0);
}

/** "4 allowed · 2 ask · 1 blocked", counting each tool once. */
export function summarizeToolPolicies(
  tools: readonly McpToolDescriptorDto[],
  t?: ToolPolicyTranslator,
): string {
  const counts: Record<PluginToolPolicy, number> = { allow: 0, approval: 0, blocked: 0 };
  for (const group of groupToolsByEffect(tools)) {
    for (const tool of group.tools) counts[toolPolicyOf(tool)] += 1;
  }
  const allowed = t ? t("allowedCount") : "allowed";
  const ask = t ? t("askCount") : "ask";
  const blocked = t ? t("blockedCount") : "blocked";
  return `${counts.allow} ${allowed} · ${counts.approval} ${ask} · ${counts.blocked} ${blocked}`;
}

/* ---------------------------------------------------------------------------------------------
 * WORKSPACE RULES (wave 2: workspace tool policy)
 *
 *   A workspace Owner can set one tool to "Ask every time" (`approval`) or "Blocked" for everyone
 *   in the workspace. No rule is "member's choice". WarpBot gets the stricter of the member's own
 *   choice and the rule — the same order the server uses (allow < approval < blocked) — so a rule
 *   can only tighten, and there is no workspace "allow".
 * ------------------------------------------------------------------------------------------- */

const POLICY_RANK: Record<PluginToolPolicy, number> = { allow: 0, approval: 1, blocked: 2 };

/** The Owner's choices, in the order the control shows them; null is "member's choice". */
export const WORKSPACE_TOOL_RULE_OPTIONS: readonly (WorkspaceToolRule | null)[] = [null, "approval", "blocked"];

/** The workspace rule on a catalog tool, or null. An unknown value is ignored, as the server does. */
export function workspaceRuleOf(tool: Pick<McpToolDescriptorDto, "workspacePolicy">): WorkspaceToolRule | null {
  return tool.workspacePolicy === "approval" || tool.workspacePolicy === "blocked" ? tool.workspacePolicy : null;
}

/** The stricter of a member's choice and a workspace rule. */
export function strictestToolPolicy(member: PluginToolPolicy, rule: WorkspaceToolRule | null): PluginToolPolicy {
  return rule && POLICY_RANK[rule] > POLICY_RANK[member] ? rule : member;
}

/** What WarpBot will actually do with the tool for this member in this workspace. */
export function effectiveToolPolicyOf(tool: McpToolDescriptorDto): PluginToolPolicy {
  return strictestToolPolicy(toolPolicyOf(tool), workspaceRuleOf(tool));
}

/**
 * Whether a member's choice is open to them under the workspace rule: anything at least as strict
 * as the rule. Under `blocked` only Blocked is; under `approval` Allow is not.
 */
export function memberCanChooseToolPolicy(policy: PluginToolPolicy, rule: WorkspaceToolRule | null): boolean {
  return !rule || POLICY_RANK[policy] >= POLICY_RANK[rule];
}

/** The Owner's list with one tool's rule replaced — the optimistic write before the server answers. */
export function withWorkspaceToolRule(
  dto: WorkspaceToolPoliciesDto,
  toolName: string,
  rule: WorkspaceToolRule | null,
): WorkspaceToolPoliciesDto {
  return {
    ...dto,
    tools: dto.tools.map((tool) => (tool.name === toolName ? { ...tool, workspacePolicy: rule } : tool)),
  };
}

/** Write tools the member can still loosen: no workspace rule sits on them. */
function adjustableWriteTools(tools: readonly McpToolDescriptorDto[]): McpToolDescriptorDto[] {
  return tools.filter((tool) => tool.effect === "write" && workspaceRuleOf(tool) === null);
}

/**
 * How the workspace's rules bear on a plugin's write tools: `all` when every write tool carries a
 * rule (the member has nothing left to allow), `some` when only part do, null when none do.
 */
export function workspaceWriteLock(tools: readonly McpToolDescriptorDto[]): "all" | "some" | null {
  const writes = tools.filter((tool) => tool.effect === "write");
  const ruled = writes.filter((tool) => workspaceRuleOf(tool) !== null);
  if (ruled.length === 0) return null;
  return ruled.length === writes.length ? "all" : "some";
}

/** Whether a user trusts a write tool to run without asking — the choice the dialog warns about. */
export function trustsAWriteTool(tools: readonly McpToolDescriptorDto[]): boolean {
  return tools.some((tool) => tool.effect === "write" && toolPolicyOf(tool) === "allow");
}

/**
 * The WarpBot chat's one per-plugin permission: whether this plugin's write tools run without the
 * Allow / Always allow card. Null when the plugin has no write tools, so there is nothing to ask.
 *
 * Write tools under a workspace rule are left out: the member cannot allow them, so they neither
 * hold the box unticked nor get ticked by it. When every write tool has a rule the answer is false
 * — nothing runs without asking — and the chat shows the box locked (`workspaceWriteLock`).
 */
export function pluginWritesAlwaysAllowed(tools: readonly McpToolDescriptorDto[]): boolean | null {
  const writes = tools.filter((tool) => tool.effect === "write");
  if (writes.length === 0) return null;
  const adjustable = adjustableWriteTools(tools);
  if (adjustable.length === 0) return false;
  return adjustable.every((tool) => toolPolicyOf(tool) === "allow");
}

/**
 * The tool-policy update that sets every write tool to allow, or back to asking. A write tool under
 * a workspace rule is not touched: allowing it would change nothing WarpBot does and would read as
 * a choice the member made.
 */
export function writeToolPolicyUpdate(
  tools: readonly McpToolDescriptorDto[],
  alwaysAllow: boolean,
): Record<string, PluginToolPolicy> {
  const policy: PluginToolPolicy = alwaysAllow ? "allow" : "approval";
  return Object.fromEntries(adjustableWriteTools(tools).map((tool) => [tool.name, policy]));
}

/* ---------------------------------------------------------------------------------------------
 * PLUGINS SWITCHED OFF FOR ONE CONVERSATION (WT-687)
 *
 *   Every connected plugin is on in a new conversation, as in Claude. Switching one off is a
 *   preference about this conversation, not a permission, so it is kept on this device next to the
 *   conversation id and sent with each message; the server only uses it to leave those tools out
 *   of what WarpBot is offered.
 * ------------------------------------------------------------------------------------------- */

const DISABLED_PLUGINS_KEY_PREFIX = "warpbot:disabled-plugins:";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readDisabledPluginKeys(store: KeyValueStore | null, conversationId: string): string[] {
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(DISABLED_PLUGINS_KEY_PREFIX + conversationId) ?? "[]");
    return Array.isArray(raw) ? raw.filter((key): key is string => typeof key === "string" && key !== "") : [];
  } catch {
    return [];
  }
}

export function writeDisabledPluginKeys(
  store: KeyValueStore | null,
  conversationId: string,
  pluginKeys: readonly string[],
): void {
  if (!store) return;
  try {
    const key = DISABLED_PLUGINS_KEY_PREFIX + conversationId;
    if (pluginKeys.length === 0) store.removeItem(key);
    else store.setItem(key, JSON.stringify([...new Set(pluginKeys)]));
  } catch {
    // Private mode or a full quota. The switch still holds for the rest of this session.
  }
}

export function togglePluginKey(pluginKeys: readonly string[], pluginKey: string): string[] {
  return pluginKeys.includes(pluginKey)
    ? pluginKeys.filter((key) => key !== pluginKey)
    : [...pluginKeys, pluginKey];
}
