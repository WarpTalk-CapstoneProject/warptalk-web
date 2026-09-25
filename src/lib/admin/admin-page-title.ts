/**
 * Which sidebar label names the admin page at a path — the top bar's breadcrumb.
 *
 * WHY THIS IS ITS OWN MODULE
 *   The map used to live inline in the app layout with "Insights" as the fallback, so every admin
 *   page added after it (Providers, Packages, Operating costs, Inbox, Staff, Roles) was titled
 *   "Insights" in the top bar. The fallback is now reserved for /admin itself; a path this map does
 *   not know gets no admin title at all, and scripts/check-admin-page-titles-contract.mjs fails
 *   when an admin route directory is added without an entry here.
 *
 * Values are keys of `common.sidebar.adminNav.items` (the same label the sidebar shows).
 */

export const ADMIN_PAGE_LABEL_KEYS: Readonly<Record<string, string>> = {
  inbox: "inbox",
  workspaces: "workspaces",
  users: "accounts",
  subscriptions: "subscriptions",
  plans: "plansAndPricing",
  packages: "packages",
  billing: "billingLedger",
  "sales-leads": "salesLeads",
  finance: "operatingCosts",
  health: "systemHealth",
  providers: "providers",
  feedback: "feedback",
  audit: "auditLog",
  announcements: "announcements",
  "email-templates": "emailTemplates",
  settings: "platformSettings",
  plugins: "plugins",
  "global-glossary": "globalGlossary",
  staff: "staff",
  roles: "roles",
};

/** The label key for an admin path; "insights" only for /admin itself; null when unknown. */
export function adminPageLabelKey(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "admin") return null;
  if (segments.length === 1) return "insights";
  return ADMIN_PAGE_LABEL_KEYS[segments[1]] ?? null;
}
