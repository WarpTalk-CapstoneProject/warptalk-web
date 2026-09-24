/**
 * The admin workspace page's action set, and the rules each action is held to before it reaches
 * the server.
 *
 * The owner asked for the page to act "ERP-style" (the OpenBoox customer 360 is the reference):
 * every action sits on the record it changes, names its target, takes a reason, and is confirmed
 * in a second step that restates exactly what will happen. The server enforces the same reason
 * and bounds and records every action in the platform audit log — this module keeps the page from
 * offering what the server will refuse, and gives the contract test one registry to hold the page to.
 *
 * Deliberately free of React so `node:test` can exercise it without a renderer.
 */

/** The audit log's reason column is text, but every admin endpoint caps a reason at 500. */
export const ADMIN_REASON_MAX = 500;
export const MAX_CREDIT_ADJUSTMENT = 1_000_000;
export const MAX_TRIAL_EXTENSION_DAYS = 90;
export const MAX_COMP_PERIODS = 12;
export const MAX_ENTITLEMENT_LIMIT = 100_000;
export const MAX_NOTICE_TITLE = 120;
export const MAX_NOTICE_MESSAGE = 2000;
export const MAX_NOTE_LENGTH = 4000;

export type WorkspaceActionGroup = "billing" | "account" | "data" | "lifecycle";

export type WorkspaceActionId =
  | "adjustCredits"
  | "changePlan"
  | "extendTrial"
  | "compPeriod"
  | "entitlements"
  | "markInvoicePaid"
  | "transferOwnership"
  | "signOutMember"
  | "signOutAll"
  | "sendNotice"
  | "exportSummary"
  | "suspend"
  | "reactivate"
  | "delete";

export interface WorkspaceActionSpec {
  id: WorkspaceActionId;
  group: WorkspaceActionGroup;
  /** Red confirm button, and the confirm step spells out that it cannot be taken back. */
  destructive: boolean;
  /** Which service answers, as the route the page calls — for the contract test and for humans. */
  route: string;
}

/**
 * Every action the page offers, in the order the Actions menu lists them. Suspend, reactivate and
 * delete predate the page and keep their own dialog (WorkspaceLifecycleDialog); they are listed so
 * the menu and the contract see one complete set.
 */
export const WORKSPACE_ACTIONS: readonly WorkspaceActionSpec[] = [
  { id: "adjustCredits", group: "billing", destructive: false, route: "POST /admin/billing/workspaces/{id}/credits/adjust" },
  { id: "changePlan", group: "billing", destructive: false, route: "POST /admin/billing/workspaces/{id}/subscription/change-plan" },
  { id: "extendTrial", group: "billing", destructive: false, route: "POST /admin/billing/workspaces/{id}/subscription/extend-trial" },
  { id: "compPeriod", group: "billing", destructive: false, route: "POST /admin/billing/workspaces/{id}/subscription/comp" },
  { id: "entitlements", group: "billing", destructive: false, route: "PUT /admin/billing/workspaces/{id}/subscription/entitlements" },
  { id: "markInvoicePaid", group: "billing", destructive: false, route: "POST /admin/billing/workspaces/{id}/invoices/{invoiceId}/mark-paid" },
  { id: "transferOwnership", group: "account", destructive: true, route: "POST /admin/workspaces/{id}/transfer-ownership" },
  { id: "signOutMember", group: "account", destructive: false, route: "POST /admin/users/workspaces/{id}/revoke-sessions" },
  { id: "signOutAll", group: "account", destructive: true, route: "POST /admin/users/workspaces/{id}/revoke-sessions" },
  { id: "sendNotice", group: "account", destructive: false, route: "POST /admin/workspaces/{id}/notices" },
  { id: "exportSummary", group: "data", destructive: false, route: "POST /admin/workspaces/{id}/export" },
  { id: "suspend", group: "lifecycle", destructive: true, route: "POST /admin/workspaces/{id}/suspend" },
  { id: "reactivate", group: "lifecycle", destructive: false, route: "POST /admin/workspaces/{id}/reactivate" },
  { id: "delete", group: "lifecycle", destructive: true, route: "POST /admin/workspaces/{id}/delete" },
];

export function actionSpec(id: WorkspaceActionId): WorkspaceActionSpec {
  const spec = WORKSPACE_ACTIONS.find((action) => action.id === id);
  if (!spec) throw new Error(`Unknown workspace action: ${id}`);
  return spec;
}

/** An i18n key under `adminWorkspaces.actions.errors`, or null when the input is acceptable. */
export type ActionError =
  | "reasonRequired"
  | "reasonTooLong"
  | "amountInvalid"
  | "amountTooLarge"
  | "daysInvalid"
  | "periodsInvalid"
  | "limitInvalid"
  | "noChanges"
  | "titleInvalid"
  | "messageInvalid"
  | "chooseMember"
  | "choosePlan"
  | "noteInvalid"
  | "belowZero";

export function validateReason(reason: string): ActionError | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return "reasonRequired";
  if (trimmed.length > ADMIN_REASON_MAX) return "reasonTooLong";
  return null;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: ActionError };

/** A whole, non-zero number of credits, at most ±1,000,000. Negative deducts. */
export function parseCreditAmount(raw: string): Parsed<number> {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(value) || !Number.isInteger(value) || value === 0) {
    return { ok: false, error: "amountInvalid" };
  }
  if (Math.abs(value) > MAX_CREDIT_ADJUSTMENT) return { ok: false, error: "amountTooLarge" };
  return { ok: true, value };
}

function parseWhole(raw: string, min: number, max: number, error: ActionError): Parsed<number> {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (trimmed === "" || !Number.isInteger(value) || value < min || value > max) return { ok: false, error };
  return { ok: true, value };
}

export const parseTrialDays = (raw: string) => parseWhole(raw, 1, MAX_TRIAL_EXTENSION_DAYS, "daysInvalid");
export const parseCompPeriods = (raw: string) => parseWhole(raw, 1, MAX_COMP_PERIODS, "periodsInvalid");

/** The trial end an extension produces: from the later of the current end and now. */
export function extendedTrialEnd(trialEndsAt: string | null, days: number, now: Date = new Date()): Date {
  const current = trialEndsAt ? new Date(trialEndsAt) : now;
  const base = current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + days * 86_400_000);
}

/** The paid-through date a comp produces: N calendar months after the later of the period end and now. */
export function compedPeriodEnd(currentPeriodEnd: string, periods: number, now: Date = new Date()): Date {
  const current = new Date(currentPeriodEnd);
  const base = current.getTime() > now.getTime() ? current : now;
  const next = new Date(base.getTime());
  next.setUTCMonth(next.getUTCMonth() + periods);
  return next;
}

// ── Entitlement overrides ────────────────────────────────────────────────────────────────

/** Mirrors EntitlementConstants.Keys.NumericLimits: a smaller number is the tighter setting. */
export const NUMERIC_ENTITLEMENT_KEYS = ["max_languages", "max_active_rooms", "max_participants"] as const;

export function isNumericEntitlement(key: string): boolean {
  return (NUMERIC_ENTITLEMENT_KEYS as readonly string[]).includes(key);
}

/** What the form holds per key: "" = no contract override; otherwise the typed text or "true"/"false". */
export type EntitlementDraft = Record<string, string>;

export interface EntitlementLike {
  key: string;
  contractOverride: string | null;
}

export function draftFromEntitlements(entitlements: EntitlementLike[]): EntitlementDraft {
  return Object.fromEntries(entitlements.map((e) => [e.key, e.contractOverride ?? ""]));
}

/**
 * The PUT body: only the keys the admin changed, each as a number, a boolean, or null (clear).
 * The server keeps keys the body does not name, so an unchanged key is left out rather than resent.
 */
export function buildEntitlementPatch(
  entitlements: EntitlementLike[],
  draft: EntitlementDraft,
): Parsed<Record<string, number | boolean | null>> {
  const patch: Record<string, number | boolean | null> = {};
  for (const entitlement of entitlements) {
    const before = entitlement.contractOverride ?? "";
    const after = (draft[entitlement.key] ?? "").trim();
    if (after === before) continue;

    if (after === "") {
      patch[entitlement.key] = null;
    } else if (isNumericEntitlement(entitlement.key)) {
      const value = Number(after);
      if (!Number.isInteger(value) || value < 0 || value > MAX_ENTITLEMENT_LIMIT) {
        return { ok: false, error: "limitInvalid" };
      }
      patch[entitlement.key] = value;
    } else {
      if (after !== "true" && after !== "false") return { ok: false, error: "limitInvalid" };
      patch[entitlement.key] = after === "true";
    }
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: "noChanges" };
  return { ok: true, value: patch };
}

// ── Credit burn chart ────────────────────────────────────────────────────────────────────

export interface BurnPointLike {
  date: string;
  consumed: number;
  granted: number;
  balanceAfter: number | null;
}

export interface BurnGeometry {
  bars: { date: string; x: number; width: number; height: number; consumed: number }[];
  /** The balance line, carried over days with no ledger rows; empty before the first known balance. */
  line: { x: number; y: number; balance: number }[];
  maxConsumed: number;
  maxBalance: number;
}

/**
 * Daily consumption as bars, and the ledger's own end-of-day balance as a line on the same x axis.
 * A day with no rows carries the previous balance forward — the balance did not change, so drawing
 * a gap (or a drop to zero) would be a claim the ledger does not make.
 */
export function burnGeometry(points: BurnPointLike[], width: number, height: number): BurnGeometry {
  const count = Math.max(points.length, 1);
  const slot = width / count;
  const barWidth = Math.max(1, slot * 0.7);
  const maxConsumed = Math.max(1, ...points.map((p) => p.consumed));

  let carried: number | null = null;
  const balances = points.map((p) => {
    if (p.balanceAfter !== null) carried = p.balanceAfter;
    return carried;
  });
  const known = balances.filter((b): b is number => b !== null);
  const maxBalance = Math.max(1, ...known.map((b) => Math.max(b, 0)));

  return {
    bars: points.map((p, i) => ({
      date: p.date,
      x: i * slot + (slot - barWidth) / 2,
      width: barWidth,
      height: (p.consumed / maxConsumed) * height,
      consumed: p.consumed,
    })),
    line: balances.flatMap((balance, i) =>
      balance === null
        ? []
        : [{ x: i * slot + slot / 2, y: height - (Math.max(balance, 0) / maxBalance) * height, balance }],
    ),
    maxConsumed,
    maxBalance,
  };
}

// ── P&L ──────────────────────────────────────────────────────────────────────────────────

export interface MoneyLike {
  amount: number | null;
}

/** "profit" | "loss" | "unknown" — the tone of the P&L tile, from the server's margin figure. */
export function marginTone(margin: MoneyLike): "profit" | "loss" | "unknown" {
  if (margin.amount === null) return "unknown";
  return margin.amount >= 0 ? "profit" : "loss";
}

// ── Force sign-out ───────────────────────────────────────────────────────────────────────

export interface MemberLike {
  userId: string;
  role: string;
}

/**
 * Everyone the page lists. The owner is included on purpose: "sign everyone out" after a leaked
 * credential means everyone, and the owner can sign straight back in.
 */
export function signOutAllTargets(members: MemberLike[]): string[] {
  return [...new Set(members.map((m) => m.userId))];
}

/** Members who can be handed the workspace: everyone but the current owner. */
export function transferCandidates<T extends MemberLike & { membershipType: string }>(members: T[]): T[] {
  return members.filter((m) => m.role.toLowerCase() !== "owner" && m.membershipType.toLowerCase() !== "external");
}

// ── Export ───────────────────────────────────────────────────────────────────────────────

/** `acme-workspace-summary-2026-09-24.json` — slug and UTC date, nothing a filesystem dislikes. */
export function exportFileName(slug: string, at: Date = new Date()): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  return `${safe}-workspace-summary-${at.toISOString().slice(0, 10)}.json`;
}

/**
 * The file an export hands over: the workspace service's record (roster and timeline, already
 * audited server-side) plus the billing overview and meeting totals the page is showing. Tenant
 * content is not in it — the portal never reads any.
 */
export function buildWorkspaceExport<W, B, M>(parts: {
  workspace: W;
  billing: B | null;
  meetings: M | null;
}): { format: "warptalk.admin.workspace-summary"; version: 1 } & typeof parts {
  return { format: "warptalk.admin.workspace-summary", version: 1, ...parts };
}

// ── Timeline ─────────────────────────────────────────────────────────────────────────────

/**
 * The i18n key (under `adminWorkspaces.timeline.actions`) for an audit verb. An unknown verb —
 * another service's, or one added later — falls back to "other" and the raw verb is shown beside it.
 */
export function timelineActionKey(action: string | null): string {
  switch (action) {
    case "suspend":
      return "suspended";
    case "reactivate":
      return "reactivated";
    case "delete":
      return "deleted";
    case "credit.adjusted":
      return "creditAdjusted";
    case "subscription.plan_changed":
      return "planChanged";
    case "subscription.trial_extended":
      return "trialExtended";
    case "subscription.period_comped":
      return "periodComped";
    case "entitlements.overridden":
      return "entitlementsOverridden";
    case "invoice.marked_paid":
      return "invoiceMarkedPaid";
    case "ownership.transferred":
      return "ownershipTransferred";
    case "notice.sent":
      return "noticeSent";
    case "note.added":
      return "noteAdded";
    case "data.exported":
      return "dataExported";
    case "user.sessions_revoked":
      return "sessionsRevoked";
    default:
      return "other";
  }
}
