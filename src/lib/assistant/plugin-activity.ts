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
 *  - a refusal, which is not a failure: `permission_denied` is what the workspace's own "members
 *    may use plugins" switch produces, and reading it as "the plugin is broken" sends an Owner
 *    chasing the wrong thing;
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

export interface PluginActivityOutcome {
  label: string;
  tone: PluginActivityTone;
  /** The raw code, for everything but a plain success — it is what an operator would search for. */
  code: string | null;
}

export interface PluginActivityRow extends WorkspacePluginToolAuditDto {
  memberLabel: string;
  isFormerMember: boolean;
  pluginLabel: string;
  toolLabel: string;
  outcome: PluginActivityOutcome;
}

/**
 * Codes from `PluginConstants.ErrorCodes` in the assistant service, grouped by what an Owner does
 * about them. Anything not listed is a plain failure; an unknown code is not an error here.
 */
const BLOCKED = new Set(["permission_denied", "access_denied"]);
const NEEDS_SETUP = new Set([
  "plugin_not_installed",
  "connection_required",
  "missing_scope",
  "provider_account_mismatch",
]);
const PROVIDER = new Set(["provider_rate_limited", "provider_unavailable", "provider_configuration"]);

/** Optional translator, defaulted to English so the node:test contract for this file (and any
 * caller that has not been migrated to next-intl) keeps working unchanged. */
export type PluginActivityTranslator = (key: string) => string;

const DEFAULT_PLUGIN_ACTIVITY_COPY: Record<string, string> = {
  "outcome.succeeded": "Succeeded",
  "outcome.blocked": "Blocked",
  "outcome.awaitingConfirmation": "Awaiting confirmation",
  "outcome.needsSetup": "Needs setup",
  "outcome.providerError": "Provider error",
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
  if (code === "success") return { label: t("outcome.succeeded"), tone: "success", code: null };
  if (BLOCKED.has(code)) return { label: t("outcome.blocked"), tone: "blocked", code };
  if (code === "confirmation_required") {
    return { label: t("outcome.awaitingConfirmation"), tone: "attention", code };
  }
  if (NEEDS_SETUP.has(code)) return { label: t("outcome.needsSetup"), tone: "attention", code };
  if (PROVIDER.has(code)) return { label: t("outcome.providerError"), tone: "failed", code };
  return { label: t("outcome.failed"), tone: "failed", code: code || "failed" };
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
