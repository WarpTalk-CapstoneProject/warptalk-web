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
