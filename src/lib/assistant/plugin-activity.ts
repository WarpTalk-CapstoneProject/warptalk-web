/**
 * Turning the workspace plugin audit log into rows an Owner can read. WT-646.
 *
 * The endpoint answers with ids and codes: a user id, a plugin key, a tool name, and a result
 * status that is either "success" or the error code the call failed with. Nothing in the assistant
 * service resolves a person, and the page already loads the member list and the plugin catalog, so
 * the join happens here — extracted from the page so the cases that are more than a Map lookup can
 * be tested without rendering:
 *
 *  - a caller who has since LEFT the workspace (the log is history, membership is current);
 *  - a plugin that is no longer in the catalog (retired rows drop out of the list);
 *  - a refusal, which is not a failure: `permission_denied` is what the workspace's own plugin list
 *    produces, and reading it as "the plugin is broken" sends an Owner chasing the wrong thing;
 *  - who can fix a call that did not run, because most of them only the member can;
 *  - the page boundary, because the server returns no total.
 */

import type { WorkspacePluginToolAuditDto } from "@/types/assistant";

/** Just the member fields the join needs. */
export interface ActivityMemberLike {
  userId: string;
  fullName?: string | null;
  email?: string | null;
}

/** Just the catalog fields the join needs. */
export interface ActivityPluginLike {
  key: string;
  label: string;
  tools?: ReadonlyArray<{ name: string; label: string }>;
}

export type PluginActivityTone = "success" | "blocked" | "attention" | "failed";

/**
 * Who can do something about a call that did not run. An Owner reading this log can act on very
 * little of it: the workspace's plugin list is theirs, but a member's connection, scopes, API key
 * and per-tool switches belong to that member alone. Saying so on the row keeps the Owner from
 * opening the workspace plugin page to fix something only the member can fix.
 *
 *  - `owner`    — the workspace refused the plugin; the Owner adds it on the workspace plugin page.
 *  - `member`   — only the person who made the call can fix it, in their own connections or chat.
 *  - `platform` — WarpTalk's own provider setup is wrong; a platform admin has to fix the catalog.
 *  - `nobody`   — nothing to fix here: the provider was down, or the tool refused the request.
 */
export type PluginActivityFixer = "owner" | "member" | "platform" | "nobody";

export interface PluginActivityOutcome {
  label: string;
  tone: PluginActivityTone;
  /** The raw code, for everything but a plain success — it is what an operator would search for. */
  code: string | null;
  /** Actionable hint or explanation for what this status means and how to unblock/fix it. */
  hint?: string | null;
  /** Who can act on it. Null for a success and for a decision that needs no follow-up. */
  fixer?: PluginActivityFixer | null;
}

export interface PluginActivityRow extends WorkspacePluginToolAuditDto {
  memberLabel: string;
  isFormerMember: boolean;
  pluginLabel: string;
  toolLabel: string;
  outcome: PluginActivityOutcome;
}

/**
 * Codes from `PluginConstants.ErrorCodes` in the assistant service, grouped by what happens next.
 * Anything not listed is a plain failure; an unknown code is not an error here.
 *
 * `permission_denied` is what `WorkspacePluginGuard` answers when the workspace does not allow the
 * plugin, so it is the Owner's. `tool_blocked` is the member's own per-tool switch (WT-687) and
 * `access_denied` is a member pressing Cancel on the provider's consent screen: both are decisions,
 * not faults, so they sit with the refusals rather than with the failures.
 */
const WORKSPACE_REFUSED = "permission_denied";
const MEMBER_TURNED_OFF = "tool_blocked";
const MEMBER_DECLINED = "access_denied";
const NEEDS_SETUP = new Set([
  "plugin_not_installed",
  "connection_required",
  "missing_scope",
  "provider_account_mismatch",
  "api_key_required",
  "invalid_api_key",
]);
const PROVIDER_DOWN = new Set(["provider_rate_limited", "provider_unavailable"]);
const PROVIDER_CONFIGURATION = "provider_configuration";
const TOOL_ERROR = "tool_error";

/** Optional translator, defaulted to English so the node:test contract for this file (and any
 * caller that has not been migrated to next-intl) keeps working unchanged. */
export type PluginActivityTranslator = (key: string) => string;

const DEFAULT_PLUGIN_ACTIVITY_COPY: Record<string, string> = {
  "outcome.succeeded": "Succeeded",
  "outcome.blocked": "Blocked",
  "outcome.blockedHint": "This workspace doesn't allow this plugin. Add it on the workspace plugin page.",
  "outcome.turnedOff": "Turned off by member",
  "outcome.turnedOffHint": "The member switched this tool off for WarpBot. Only they can turn it back on.",
  "outcome.declined": "Declined",
  "outcome.declinedHint": "The member cancelled the provider's consent screen.",
  "outcome.awaitingConfirmation": "Awaiting confirmation",
  "outcome.awaitingConfirmationHint": "WarpBot asked the member to confirm this action in chat.",
  "outcome.needsSetup": "Needs setup",
  "outcome.needsSetupHint": "The member's connection is missing or incomplete. They fix it in My connections.",
  "outcome.providerError": "Provider error",
  "outcome.providerErrorHint": "The provider didn't respond or limited requests. Nothing to fix here; try again later.",
  "outcome.providerConfigurationHint": "WarpTalk's setup for this provider is wrong. A platform admin has to fix it.",
  "outcome.toolError": "Tool error",
  "outcome.toolErrorHint": "The tool ran and refused the request. Asking WarpBot differently may work.",
  "outcome.failed": "Failed",
  formerMember: "Former member",
};

function defaultT(key: string): string {
  return DEFAULT_PLUGIN_ACTIVITY_COPY[key] ?? key;
}

export function describePluginActivityOutcome(
  resultStatus: string,
  t: PluginActivityTranslator = defaultT,
): PluginActivityOutcome {
  const code = (resultStatus ?? "").trim().toLowerCase();
  if (code === "success") return { label: t("outcome.succeeded"), tone: "success", code: null, fixer: null };
  if (code === WORKSPACE_REFUSED) {
    return { label: t("outcome.blocked"), tone: "blocked", code, hint: t("outcome.blockedHint"), fixer: "owner" };
  }
  if (code === MEMBER_TURNED_OFF) {
    return { label: t("outcome.turnedOff"), tone: "blocked", code, hint: t("outcome.turnedOffHint"), fixer: "member" };
  }
  if (code === MEMBER_DECLINED) {
    return { label: t("outcome.declined"), tone: "blocked", code, hint: t("outcome.declinedHint"), fixer: null };
  }
  if (code === "confirmation_required") {
    return {
      label: t("outcome.awaitingConfirmation"),
      tone: "attention",
      code,
      hint: t("outcome.awaitingConfirmationHint"),
      fixer: "member",
    };
  }
  if (NEEDS_SETUP.has(code)) {
    return { label: t("outcome.needsSetup"), tone: "attention", code, hint: t("outcome.needsSetupHint"), fixer: "member" };
  }
  if (PROVIDER_DOWN.has(code)) {
    return { label: t("outcome.providerError"), tone: "failed", code, hint: t("outcome.providerErrorHint"), fixer: "nobody" };
  }
  if (code === PROVIDER_CONFIGURATION) {
    return {
      label: t("outcome.providerError"),
      tone: "failed",
      code,
      hint: t("outcome.providerConfigurationHint"),
      fixer: "platform",
    };
  }
  if (code === TOOL_ERROR) {
    return { label: t("outcome.toolError"), tone: "failed", code, hint: t("outcome.toolErrorHint"), fixer: "nobody" };
  }
  return { label: t("outcome.failed"), tone: "failed", code: code || "failed", fixer: null };
}

export function toPluginActivityRows(
  audits: readonly WorkspacePluginToolAuditDto[],
  members: readonly ActivityMemberLike[],
  plugins: readonly ActivityPluginLike[],
  t: PluginActivityTranslator = defaultT,
): PluginActivityRow[] {
  const membersById = new Map(members.map((member) => [member.userId, member]));
  const pluginsByKey = new Map(plugins.map((plugin) => [plugin.key, plugin]));

  return audits.map((audit) => {
    const member = membersById.get(audit.userId);
    const plugin = pluginsByKey.get(audit.pluginKey);
    const tool = plugin?.tools?.find((candidate) => candidate.name === audit.toolName);
    return {
      ...audit,
      // The call really happened; hiding a departed member's row would make the log lie.
      isFormerMember: !member,
      memberLabel: member?.fullName || member?.email || t("formerMember"),
      pluginLabel: plugin?.label || audit.pluginKey,
      toolLabel: tool?.label || audit.toolName,
      outcome: describePluginActivityOutcome(audit.resultStatus, t),
    };
  });
}

/**
 * Whether a Next page can exist. The server sends no total, so a full page is the only evidence of
 * more — and a full last page will offer one empty Next, which the page renders as "no more".
 */
export function hasNextPluginActivityPage(rowCount: number, pageSize: number): boolean {
  return pageSize > 0 && rowCount >= pageSize;
}
