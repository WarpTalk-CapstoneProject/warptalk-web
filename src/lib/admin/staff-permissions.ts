/**
 * Platform staff permissions (G10), as the web renders them.
 *
 * THE SERVER IS THE AUTHORITY. Every admin endpoint in every backend service requires exactly one
 * of these codes (WarpTalk.Shared.Authorization.AdminPermissions) and asks the auth service for
 * the caller's live access on each request. What this module decides is only what the portal
 * SHOWS: which sidebar rows, pages, buttons and palette commands a staff member is offered. Hiding
 * something here protects nothing; forgetting to hide it only produces a 403 the page reports.
 *
 * The codes mirror the backend list and are a persisted contract there — add, never rename.
 * `scripts/check-admin-staff-rbac-contract.mjs` compares the two lists when the backend checkout
 * is available, and holds every admin page and palette entry to a mapping below.
 *
 * Pure and dependency-free on purpose (relative imports only): the node-run contract tests import
 * it without a bundler.
 */

export type PermissionArea =
  | "workspaces"
  | "accounts"
  | "meetings"
  | "billing"
  | "finance"
  | "plugins"
  | "content"
  | "glossary"
  | "settings"
  | "operations"
  | "inbox"
  | "audit"
  | "staff"
  | "assistant";

export const PERMISSION_AREAS: readonly PermissionArea[] = [
  "workspaces",
  "accounts",
  "meetings",
  "billing",
  "finance",
  "plugins",
  "content",
  "glossary",
  "settings",
  "operations",
  "inbox",
  "audit",
  "staff",
  "assistant",
];

export const ADMIN_PERMISSIONS = {
  workspacesRead: "workspaces.read",
  workspacesWrite: "workspaces.write",
  workspacesLifecycle: "workspaces.lifecycle",
  accountsRead: "accounts.read",
  accountsManage: "accounts.manage",
  meetingsRead: "meetings.read",
  billingRead: "billing.read",
  billingAdjustCredit: "billing.adjust_credit",
  billingPaymentsManage: "billing.payments_manage",
  billingSubscriptionsManage: "billing.subscriptions_manage",
  billingPlansManage: "billing.plans_manage",
  billingPricingManage: "billing.pricing_manage",
  billingLeadsManage: "billing.leads_manage",
  billingPackagesManage: "billing.packages_manage",
  pluginsRead: "plugins.read",
  pluginsManage: "plugins.manage",
  contentAnnouncements: "content.announcements",
  contentEmailTemplates: "content.email_templates",
  contentEmailSend: "content.email_send",
  glossaryRead: "glossary.read",
  glossaryManage: "glossary.manage",
  settingsRead: "settings.read",
  settingsManage: "settings.manage",
  healthRead: "health.read",
  healthOperate: "health.operate",
  providersRead: "providers.read",
  auditRead: "audit.read",
  auditExport: "audit.export",
  staffRead: "staff.read",
  staffManage: "staff.manage",
  warpbotUse: "warpbot.use",
  financeRead: "finance.read",
  financeManage: "finance.manage",
  inboxRead: "inbox.read",
  inboxManage: "inbox.manage",
} as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

/** Every code, in the catalog's order (area by area). */
export const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = Object.values(ADMIN_PERMISSIONS);

export const BUILT_IN_STAFF_ROLES = [
  "super_admin",
  "billing_finance",
  "support",
  "content_marketing",
  "operations_sre",
  "read_only_auditor",
] as const;

export const SUPER_ADMIN_ROLE = "super_admin";

/** The caller's access as `GET /api/v1/auth/staff-access` answers it. */
export interface StaffAccessSnapshot {
  isStaff: boolean;
  roleSlug: string | null;
  roleName: string | null;
  isSuperAdmin: boolean;
  /** Effective codes: the whole catalog for a Super Admin. */
  permissions: readonly string[];
}

export const NO_STAFF_ACCESS: StaffAccessSnapshot = {
  isStaff: false,
  roleSlug: null,
  roleName: null,
  isSuperAdmin: false,
  permissions: [],
};

export function isAdminPermission(code: string): code is AdminPermission {
  return (ALL_ADMIN_PERMISSIONS as readonly string[]).includes(code);
}

export function hasPermission(access: StaffAccessSnapshot | null | undefined, code: AdminPermission): boolean {
  if (!access?.isStaff) return false;
  return access.isSuperAdmin || access.permissions.includes(code);
}

/**
 * What each admin page needs before the portal offers it. `null` means any active staff member:
 * Insights is a view over many sources, and each panel whose endpoint answers 403 degrades to
 * "not available" on its own.
 *
 * Longest prefix wins, so `/admin/workspaces/acme` is matched by `/admin/workspaces`.
 */
export const ADMIN_ROUTE_PERMISSIONS: readonly { href: string; permission: AdminPermission | null; exact?: boolean }[] = [
  // Exact: the landing page is open to all staff, the pages beneath it are not by inheritance.
  { href: "/admin", permission: null, exact: true },
  { href: "/admin/workspaces", permission: ADMIN_PERMISSIONS.workspacesRead },
  { href: "/admin/users", permission: ADMIN_PERMISSIONS.accountsRead },
  { href: "/admin/subscriptions", permission: ADMIN_PERMISSIONS.billingRead },
  { href: "/admin/plans", permission: ADMIN_PERMISSIONS.billingRead },
  { href: "/admin/packages", permission: ADMIN_PERMISSIONS.billingRead },
  { href: "/admin/billing", permission: ADMIN_PERMISSIONS.billingRead },
  { href: "/admin/sales-leads", permission: ADMIN_PERMISSIONS.billingRead },
  { href: "/admin/health", permission: ADMIN_PERMISSIONS.healthRead },
  { href: "/admin/providers", permission: ADMIN_PERMISSIONS.providersRead },
  { href: "/admin/feedback", permission: ADMIN_PERMISSIONS.meetingsRead },
  { href: "/admin/audit", permission: ADMIN_PERMISSIONS.auditRead },
  { href: "/admin/announcements", permission: ADMIN_PERMISSIONS.contentAnnouncements },
  { href: "/admin/email-templates", permission: ADMIN_PERMISSIONS.contentEmailTemplates },
  { href: "/admin/settings", permission: ADMIN_PERMISSIONS.settingsRead },
  { href: "/admin/plugins", permission: ADMIN_PERMISSIONS.pluginsRead },
  { href: "/admin/global-glossary", permission: ADMIN_PERMISSIONS.glossaryRead },
  { href: "/admin/staff", permission: ADMIN_PERMISSIONS.staffRead },
  { href: "/admin/roles", permission: ADMIN_PERMISSIONS.staffRead },
  // G12 internal management. The inbox shows each person only the sources their role can read.
  { href: "/admin/inbox", permission: ADMIN_PERMISSIONS.inboxRead },
  { href: "/admin/finance", permission: ADMIN_PERMISSIONS.financeRead },
  { href: "/admin/finance/expenses", permission: ADMIN_PERMISSIONS.financeRead },
];

function routeEntryFor(pathname: string) {
  let best: (typeof ADMIN_ROUTE_PERMISSIONS)[number] | undefined;
  for (const entry of ADMIN_ROUTE_PERMISSIONS) {
    const matches = pathname === entry.href || (!entry.exact && pathname.startsWith(`${entry.href}/`));
    if (matches && (!best || entry.href.length > best.href.length)) best = entry;
  }
  return best;
}

/** The permission a portal path needs; `undefined` for a path this module does not know. */
export function permissionForAdminPath(pathname: string): AdminPermission | null | undefined {
  return routeEntryFor(pathname)?.permission;
}

/**
 * Whether the portal should render this path for this person. An unknown /admin path is refused
 * rather than waved through: a page added without a mapping is a page nobody has decided who may see.
 */
export function canViewAdminPath(access: StaffAccessSnapshot | null | undefined, pathname: string): boolean {
  if (!access?.isStaff) return false;
  const entry = routeEntryFor(pathname);
  if (!entry) return access.isSuperAdmin;
  return entry.permission === null || hasPermission(access, entry.permission);
}

/**
 * What each palette ACTION needs (pages are covered by the route map). An action whose id is not
 * listed is shown to Super Admins only, so a new action cannot quietly bypass the matrix.
 */
export const ADMIN_PALETTE_ACTION_PERMISSIONS: Readonly<Record<string, AdminPermission>> = {
  adjustCredit: ADMIN_PERMISSIONS.billingAdjustCredit,
  createPlan: ADMIN_PERMISSIONS.billingPlansManage,
  createCreditPack: ADMIN_PERMISSIONS.billingPackagesManage,
  createCoupon: ADMIN_PERMISSIONS.billingPackagesManage,
  composeAnnouncement: ADMIN_PERMISSIONS.contentAnnouncements,
  addPlugin: ADMIN_PERMISSIONS.pluginsManage,
  addGlossaryTerm: ADMIN_PERMISSIONS.glossaryManage,
  importGlossary: ADMIN_PERMISSIONS.glossaryManage,
  exportLedger: ADMIN_PERMISSIONS.billingRead,
  suspendedWorkspaces: ADMIN_PERMISSIONS.workspacesRead,
  lockedAccounts: ADMIN_PERMISSIONS.accountsRead,
  newSalesLeads: ADMIN_PERMISSIONS.billingRead,
  inviteStaff: ADMIN_PERMISSIONS.staffManage,
  createRole: ADMIN_PERMISSIONS.staffManage,
  recordExpense: ADMIN_PERMISSIONS.financeManage,
  importExpenses: ADMIN_PERMISSIONS.financeManage,
  myInbox: ADMIN_PERMISSIONS.inboxRead,
};

export function canUsePaletteEntry(
  access: StaffAccessSnapshot | null | undefined,
  entry: { id: string; kind: "page" | "action"; href: string },
): boolean {
  if (!access?.isStaff) return false;
  if (entry.kind === "page") return canViewAdminPath(access, entry.href.split("?")[0] ?? entry.href);
  const permission = ADMIN_PALETTE_ACTION_PERMISSIONS[entry.id];
  return permission ? hasPermission(access, permission) && canViewAdminPath(access, entry.href.split("?")[0] ?? entry.href) : access.isSuperAdmin;
}

/** Where to send a staff member who opened a page they may not see: the first nav page they can. */
export function firstViewableAdminHref(access: StaffAccessSnapshot | null | undefined): string | null {
  if (!access?.isStaff) return null;
  return ADMIN_ROUTE_PERMISSIONS.find((entry) => canViewAdminPath(access, entry.href))?.href ?? null;
}

/** The permissions of the catalog grouped by area, in display order. */
export function permissionsByArea(
  codes: readonly string[] = ALL_ADMIN_PERMISSIONS,
): { area: PermissionArea; permissions: AdminPermission[] }[] {
  const areaOf = (code: string): PermissionArea => {
    const prefix = code.split(".")[0];
    if (prefix === "health" || prefix === "providers") return "operations";
    if (prefix === "warpbot") return "assistant";
    return prefix as PermissionArea;
  };
  return PERMISSION_AREAS.map((area) => ({
    area,
    permissions: codes.filter((code): code is AdminPermission => isAdminPermission(code) && areaOf(code) === area),
  })).filter((group) => group.permissions.length > 0);
}

/** Whether a permission code only ever reveals data (the matrix's "view" column). */
export function isReadPermission(code: string): boolean {
  return code.endsWith(".read");
}

/**
 * Mirrors the server's guard rails so the portal can explain a refusal before it happens. The
 * server applies the same rules and is the one that matters.
 *
 * - Super Admin can be granted only by a Super Admin.
 * - Anyone else can grant only a role whose permissions they hold themselves.
 */
export function canGrantRole(
  access: StaffAccessSnapshot | null | undefined,
  role: { isSuperAdmin: boolean; permissions: readonly string[] },
): boolean {
  if (!access?.isStaff || !hasPermission(access, ADMIN_PERMISSIONS.staffManage)) return false;
  if (access.isSuperAdmin) return true;
  if (role.isSuperAdmin) return false;
  return role.permissions.every((code) => access.permissions.includes(code));
}

/**
 * Whether the actor may act on this staff member at all: never themselves, never someone who
 * holds more than they do (and only a Super Admin acts on a Super Admin).
 */
export function canManageStaffMember(
  access: StaffAccessSnapshot | null | undefined,
  actorUserId: string | null | undefined,
  target: { userId: string; isSuperAdmin: boolean; rolePermissions: readonly string[] },
): boolean {
  if (!access?.isStaff || !hasPermission(access, ADMIN_PERMISSIONS.staffManage)) return false;
  if (actorUserId && actorUserId === target.userId) return false;
  if (access.isSuperAdmin) return true;
  if (target.isSuperAdmin) return false;
  return target.rolePermissions.every((code) => access.permissions.includes(code));
}
