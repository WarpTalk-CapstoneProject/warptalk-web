import type { McpToolDescriptorDto, PluginToolPolicy } from "../../types/assistant.ts";

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

/** Whether a user trusts a write tool to run without asking — the choice the dialog warns about. */
export function trustsAWriteTool(tools: readonly McpToolDescriptorDto[]): boolean {
  return tools.some((tool) => tool.effect === "write" && toolPolicyOf(tool) === "allow");
}

/**
 * The WarpBot chat's one per-plugin permission: whether this plugin's write tools run without the
 * Allow / Always allow card. Null when the plugin has no write tools, so there is nothing to ask.
 */
export function pluginWritesAlwaysAllowed(tools: readonly McpToolDescriptorDto[]): boolean | null {
  const writes = tools.filter((tool) => tool.effect === "write");
  if (writes.length === 0) return null;
  return writes.every((tool) => toolPolicyOf(tool) === "allow");
}

/** The tool-policy update that sets every write tool to allow, or back to asking. */
export function writeToolPolicyUpdate(
  tools: readonly McpToolDescriptorDto[],
  alwaysAllow: boolean,
): Record<string, PluginToolPolicy> {
  const policy: PluginToolPolicy = alwaysAllow ? "allow" : "approval";
  return Object.fromEntries(tools.filter((tool) => tool.effect === "write").map((tool) => [tool.name, policy]));
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
