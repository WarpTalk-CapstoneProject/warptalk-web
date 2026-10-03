/**
 * Which WarpBot the global widget is: the workspace one, or the platform one.
 *
 * THE OWNER REPORT
 *     On /admin the widget said "WarpBot answers about one workspace. Open a workspace to start a
 *     conversation." and was dead for a platform admin — correct at the time (WT-541), because
 *     every conversation was created against a workspace id and /admin has none.
 *
 * WHAT CHANGED
 *     AssistantService now has a second, separate conversation store for scope "platform", behind
 *     the system-admin policy, whose turns the worker answers with read-only platform admin tools
 *     (insights, directories, billing, health, audit, plugins) — never workspace retrieval.
 *
 * WHAT THIS DECIDES, AND WHAT IT DOES NOT
 *     It picks the MODE: platform on an /admin page for a system admin, workspace everywhere else
 *     — so a workspace page keeps exactly today's behaviour. It is presentation only. The server
 *     refuses a platform conversation to anyone without the platform "admin" role whatever this
 *     returns, and a non-admin who somehow reaches /admin gets workspace mode, whose readiness
 *     rule (no workspace, no send) still holds there.
 */

export type AssistantScope = "workspace" | "platform";

/** The chip beside the WarpBot title in platform mode. */
export const PLATFORM_SCOPE_LABEL = "Platform";

/**
 * The starters shown in an empty platform conversation. Each maps to one read-only platform
 * tool: get_platform_insights (compare previous_month), lookup_billing (subscriptions sorted
 * credits_asc), get_system_health.
 */
export const PLATFORM_SUGGESTED_PROMPTS: readonly string[] = [
  "Revenue this month vs last",
  "Workspaces running low on credits",
  "Any failing pipeline stages today?",
];

/**
 * The ambient pageTypes the workspace Owner/Admin pages register, one per surface WarpBot can
 * answer from. Each page sends the figures it is showing as its snapshot (the *-assistant-snapshot
 * modules under lib/workspace), so they are page contexts, not tools.
 */
export const WORKSPACE_INSIGHTS_PAGE_TYPE = "workspace_insights";
export const WORKSPACE_INSIGHTS_USAGE_PAGE_TYPE = "workspace_insights_usage";
export const WORKSPACE_INSIGHTS_TOOLS_PAGE_TYPE = "workspace_insights_tools";
export const WORKSPACE_BILLING_PAGE_TYPE = "workspace_billing";
export const WORKSPACE_PLUGINS_PAGE_TYPE = "workspace_plugins";
export const WORKSPACE_SETTINGS_PAGE_TYPE = "workspace_settings";
export const WORKSPACE_SECURITY_PAGE_TYPE = "workspace_security";
export const WORKSPACE_MEMBER_ROLES_PAGE_TYPE = "workspace_member_roles";
export const WORKSPACE_FEATURES_PAGE_TYPE = "workspace_features";
export const WORKSPACE_INVOICES_PAGE_TYPE = "workspace_invoices";
export const WORKSPACE_PLUGIN_ACTIVITY_PAGE_TYPE = "workspace_plugin_activity";

/**
 * The starters a workspace Owner/Admin sees in an empty conversation opened on Insights — the
 * workspace twins of the platform ones. No tool answers them: each is answered from the figures
 * the Overview sends as its page snapshot (lib/workspace/insights/assistant-snapshot.ts), so they
 * are offered only while that snapshot is the widget's page context.
 */
export const WORKSPACE_INSIGHTS_SUGGESTED_PROMPTS: readonly string[] = [
  "Credits used this period vs last",
  "Will our credits last this cycle?",
  "Any tools failing or needing setup?",
];

/** Insights → Usage: the billing cycle's spend, by service and by who. */
export const WORKSPACE_USAGE_SUGGESTED_PROMPTS: readonly string[] = [
  "Which AI service costs us the most this cycle?",
  "Is our spending concentrated in a few members?",
  "At this pace, when do our credits run out?",
];

/** Insights → Tools: WarpBot's tool calls in the period on screen. */
export const WORKSPACE_TOOLS_SUGGESTED_PROMPTS: readonly string[] = [
  "Which tools fail the most?",
  "How many tool calls vs the previous period?",
  "Which plugin tools are blocked or need setup?",
];

/** Settings → Billing: the plan, the renewal and the overage setting. */
export const WORKSPACE_BILLING_SUGGESTED_PROMPTS: readonly string[] = [
  "What plan are we on and when does it renew?",
  "Are overages on and what is the cap?",
  "Is anything wrong with our payment or renewal?",
];

/** Settings → Plugins: what the workspace has and what is waiting on the Owner. */
export const WORKSPACE_PLUGINS_SUGGESTED_PROMPTS: readonly string[] = [
  "Which plugins does our workspace have?",
  "Are any plugin requests waiting for me?",
  "Which plugins are members actually using?",
];

/** Settings → Workspace settings: the saved meeting defaults. */
export const WORKSPACE_SETTINGS_SUGGESTED_PROMPTS: readonly string[] = [
  "Which languages can our meetings use?",
  "How many meetings can run at once?",
  "How long do we keep meeting records?",
];

/** Settings → Security: who gets in and what is filtered. */
export const WORKSPACE_SECURITY_SUGGESTED_PROMPTS: readonly string[] = [
  "Can people outside our company join this workspace?",
  "Which domains count as internal?",
  "Which data protection settings are on?",
];

/** Settings → Member roles: counts only, nobody is named to WarpBot. */
export const WORKSPACE_MEMBER_ROLES_SUGGESTED_PROMPTS: readonly string[] = [
  "How many admins do we have?",
  "How many members are internal vs external?",
  "How many members could be made admin?",
];

/** Settings → Features: what the plan entitles the workspace to. */
export const WORKSPACE_FEATURES_SUGGESTED_PROMPTS: readonly string[] = [
  "What does our plan include?",
  "Which features are not included?",
  "What limits apply to our meetings?",
];

/** Settings → Invoices: the page of invoices on screen. */
export const WORKSPACE_INVOICES_SUGGESTED_PROMPTS: readonly string[] = [
  "Do we have any unpaid invoices?",
  "How much have we paid on these invoices?",
  "What was our latest invoice?",
];

/** Settings → Plugin activity: the newest plugin tool calls. */
export const WORKSPACE_PLUGIN_ACTIVITY_SUGGESTED_PROMPTS: readonly string[] = [
  "Are any plugin calls failing recently?",
  "Which plugins were used the most recently?",
  "Which of these problems can I fix myself?",
];

const WORKSPACE_STARTERS_BY_PAGE_TYPE: Readonly<Record<string, readonly string[]>> = {
  [WORKSPACE_INSIGHTS_PAGE_TYPE]: WORKSPACE_INSIGHTS_SUGGESTED_PROMPTS,
  [WORKSPACE_INSIGHTS_USAGE_PAGE_TYPE]: WORKSPACE_USAGE_SUGGESTED_PROMPTS,
  [WORKSPACE_INSIGHTS_TOOLS_PAGE_TYPE]: WORKSPACE_TOOLS_SUGGESTED_PROMPTS,
  [WORKSPACE_BILLING_PAGE_TYPE]: WORKSPACE_BILLING_SUGGESTED_PROMPTS,
  [WORKSPACE_PLUGINS_PAGE_TYPE]: WORKSPACE_PLUGINS_SUGGESTED_PROMPTS,
  [WORKSPACE_SETTINGS_PAGE_TYPE]: WORKSPACE_SETTINGS_SUGGESTED_PROMPTS,
  [WORKSPACE_SECURITY_PAGE_TYPE]: WORKSPACE_SECURITY_SUGGESTED_PROMPTS,
  [WORKSPACE_MEMBER_ROLES_PAGE_TYPE]: WORKSPACE_MEMBER_ROLES_SUGGESTED_PROMPTS,
  [WORKSPACE_FEATURES_PAGE_TYPE]: WORKSPACE_FEATURES_SUGGESTED_PROMPTS,
  [WORKSPACE_INVOICES_PAGE_TYPE]: WORKSPACE_INVOICES_SUGGESTED_PROMPTS,
  [WORKSPACE_PLUGIN_ACTIVITY_PAGE_TYPE]: WORKSPACE_PLUGIN_ACTIVITY_SUGGESTED_PROMPTS,
};

/** Which starters an empty conversation shows, if any. */
export function suggestedPromptsFor(input: {
  scope: AssistantScope;
  pageType: string | null | undefined;
}): readonly string[] {
  if (input.scope === "platform") return PLATFORM_SUGGESTED_PROMPTS;
  if (!input.pageType || !Object.prototype.hasOwnProperty.call(WORKSPACE_STARTERS_BY_PAGE_TYPE, input.pageType)) return [];
  return WORKSPACE_STARTERS_BY_PAGE_TYPE[input.pageType];
}

/** True for /admin and every page under it — not for /administrator or /workspace/admin. */
export function isAdminPortalPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function assistantScopeFor(input: {
  pathname: string | null | undefined;
  isSystemAdmin: boolean;
}): AssistantScope {
  return input.isSystemAdmin && isAdminPortalPath(input.pathname) ? "platform" : "workspace";
}
