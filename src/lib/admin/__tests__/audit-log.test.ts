import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  AUDIT_SOURCE_LABELS,
  DEFAULT_AUDIT_FILTERS,
  activeAuditFilterCount,
  auditActionLabel,
  auditActionTone,
  auditChangeSummary,
  auditDiffRows,
  auditEntityHref,
  auditEntityTypeLabel,
  auditFiltersToParams,
  auditFiltersToQuery,
  auditMessageKey,
  auditWorkspaceHref,
  readAuditFilters,
} from "../audit-log.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const messages = (locale: string) =>
  JSON.parse(read(`../../../../messages/${locale}/adminMisc.json`)).audit as Record<string, unknown>;

// ── Vocabulary ────────────────────────────────────────────────────────────────────────────────

test("every recorded verb, subject type and source reads as words in every locale", () => {
  for (const locale of ["en", "vi", "ja"]) {
    const audit = messages(locale) as {
      actions: Record<string, string>;
      entities: Record<string, string>;
      sources: Record<string, string>;
    };
    for (const action of Object.keys(AUDIT_ACTION_LABELS)) {
      assert.ok(audit.actions[auditMessageKey(action)], `${locale}: no label for action "${action}"`);
    }
    for (const type of Object.keys(AUDIT_ENTITY_LABELS)) {
      assert.ok(audit.entities[auditMessageKey(type)], `${locale}: no label for subject type "${type}"`);
    }
    for (const source of Object.keys(AUDIT_SOURCE_LABELS)) {
      assert.ok(audit.sources[auditMessageKey(source)], `${locale}: no label for source "${source}"`);
    }
  }
});

test("the three locales carry the same audit keys", () => {
  const keys = (node: unknown, prefix = ""): string[] =>
    node && typeof node === "object"
      ? Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => keys(value, `${prefix}${key}.`))
      : [prefix.slice(0, -1)];
  const en = keys(messages("en")).sort();
  assert.deepEqual(keys(messages("vi")).sort(), en);
  assert.deepEqual(keys(messages("ja")).sort(), en);
});

test("a verb reads as a sentence, and an unknown one still reads as words — never a slug", () => {
  assert.equal(auditActionLabel("suspend"), "Workspace suspended");
  assert.equal(auditActionLabel("subscription.plan_changed"), "Plan changed");
  assert.equal(auditActionLabel("rate_card.provider_cost_set"), "Provider cost set");
  assert.equal(auditActionLabel("widget.frobnicated"), "Widget frobnicated");
  assert.equal(auditEntityTypeLabel("supported_language"), "Language");
  assert.equal(auditEntityTypeLabel("mystery_thing"), "Mystery thing");
  // The translator wins when it knows the key; the English table is only the fallback.
  assert.equal(auditActionLabel("plan.updated", (key) => (key === "actions.plan_updated" ? "Sửa gói" : undefined)), "Sửa gói");
});

test("destructive verbs are marked as such even when they succeeded", () => {
  for (const action of ["suspend", "delete", "user.deactivated", "plugin.deleted", "subscription.cancelled", "glossary.term_deleted"]) {
    assert.equal(auditActionTone(action), "danger", action);
  }
  assert.equal(auditActionTone("credit.adjusted"), "warning");
  assert.equal(auditActionTone("plan.updated"), "neutral");
});

// ── Where a subject lives ─────────────────────────────────────────────────────────────────────

const subject = (type: string, extra: Partial<{ id: string; key: string; workspaceId: string; workspaceSlug: string }> = {}) => ({
  type,
  id: extra.id ?? null,
  key: extra.key ?? null,
  workspaceId: extra.workspaceId ?? null,
  workspaceSlug: extra.workspaceSlug ?? null,
});

test("each subject links to the portal page that shows it", () => {
  const ws = "5b6d35d3-c47c-4f48-93f8-2b5476bd4b8a";
  assert.equal(auditEntityHref(subject("workspace", { id: ws, workspaceId: ws, workspaceSlug: "acme" })), "/admin/workspaces/acme");
  assert.equal(auditEntityHref(subject("workspace", { id: ws, workspaceId: ws })), `/admin/workspaces/${ws}`);
  assert.equal(auditEntityHref(subject("user", { id: "u-1" })), "/admin/users/u-1");
  assert.equal(auditEntityHref(subject("invoice", { id: "i-1", workspaceId: ws, workspaceSlug: "acme" })), "/admin/workspaces/acme");
  assert.equal(auditEntityHref(subject("subscription")), "/admin/subscriptions");
  assert.equal(
    auditEntityHref(subject("plugin", { id: "p-1" }), null, { plugin_key: "google-calendar", label: "Google Calendar" }),
    "/admin/plugins/google-calendar",
  );
  assert.equal(auditEntityHref(subject("plugin", { id: "p-1" })), "/admin/plugins");
  assert.equal(auditEntityHref(subject("supported_language", { key: "vi" })), "/admin/settings");
  for (const type of ["plan", "usage_rate", "pricing_config", "billing_policy"]) {
    assert.equal(auditEntityHref(subject(type)), "/admin/plans", type);
  }
  assert.equal(auditEntityHref(subject("glossary_term", { id: "g" })), "/admin/global-glossary");
  assert.equal(auditEntityHref(subject("notification", { id: "n-1" })), "/admin/announcements/n-1");
  assert.equal(auditEntityHref(subject("sales_lead", { id: "s" })), "/admin/sales-leads");
  assert.equal(auditEntityHref(subject("audit_log")), null);
});

test("an entry filed under a workspace links to it, except when the workspace is the subject", () => {
  assert.equal(auditWorkspaceHref(subject("invoice", { workspaceId: "w", workspaceSlug: "acme" })), "/admin/workspaces/acme");
  assert.equal(auditWorkspaceHref(subject("workspace", { id: "w", workspaceId: "w", workspaceSlug: "acme" })), null);
  assert.equal(auditWorkspaceHref(subject("plan")), null);
});

// ── Filters ───────────────────────────────────────────────────────────────────────────────────

const params = (init: Record<string, string>) => new URLSearchParams(init);

test("filters round-trip through the URL, keeping only what differs from the defaults", () => {
  const filters = {
    ...DEFAULT_AUDIT_FILTERS,
    preset: "custom" as const,
    fromDate: "2026-09-01",
    toDate: "2026-09-24",
    actorId: "a-1",
    action: "plan.updated",
    entityType: "plan",
    entityId: "vi",
    result: "failed" as const,
    q: "  spam ",
  };
  const url = auditFiltersToParams(filters);
  assert.equal(url.get("q"), "spam");
  assert.equal(url.get("range"), "custom");
  assert.deepEqual(readAuditFilters(url), { ...filters, q: "spam" });

  assert.equal(auditFiltersToParams(DEFAULT_AUDIT_FILTERS).toString(), "");
  assert.deepEqual(readAuditFilters(params({ range: "forever", result: "maybe" })), DEFAULT_AUDIT_FILTERS);
});

test("a relative range asks for everything since then with no upper bound, so live refresh keeps finding new entries", () => {
  const now = new Date("2026-09-24T10:30:45.123Z");
  const query = auditFiltersToQuery({ ...DEFAULT_AUDIT_FILTERS, preset: "24h" }, now);
  assert.equal(query.from, "2026-09-23T10:30:00.000Z");
  assert.equal(query.to, undefined);
  assert.deepEqual(auditFiltersToQuery({ ...DEFAULT_AUDIT_FILTERS, preset: "all" }, now), {});
});

test("every filter is sent to the server; none is applied to the loaded page afterwards", () => {
  const query = auditFiltersToQuery(
    {
      ...DEFAULT_AUDIT_FILTERS,
      preset: "custom",
      fromDate: "2026-09-16",
      toDate: "2026-09-16",
      actorId: "a-1",
      action: "suspend",
      entityType: "workspace",
      entityId: " 5b6d35d3-c47c-4f48-93f8-2b5476bd4b8a ",
      workspaceId: "w-1",
      result: "succeeded",
      q: " spam ",
    },
    new Date(),
  );
  assert.ok(query.from && query.to && query.from < query.to, "a one-day custom range is that whole day");
  assert.equal(query.actorId, "a-1");
  assert.equal(query.action, "suspend");
  assert.equal(query.entityType, "workspace");
  assert.equal(query.entityId, "5b6d35d3-c47c-4f48-93f8-2b5476bd4b8a");
  assert.equal(query.workspaceId, "w-1");
  assert.equal(query.result, "succeeded");
  assert.equal(query.q, "spam");
  assert.equal(activeAuditFilterCount({ ...DEFAULT_AUDIT_FILTERS, result: "failed", q: "x" }), 2);
});

// ── Diff ──────────────────────────────────────────────────────────────────────────────────────

test("a before/after pair becomes one row per field, marked by what happened to it", () => {
  const rows = auditDiffRows(
    { status: "active", price: "499000", note: "old" },
    { status: "suspended", price: "499000", created: "yes" },
  );
  assert.deepEqual(
    rows.map((row) => [row.key, row.change]),
    [
      ["status", "changed"],
      ["price", "unchanged"],
      ["note", "removed"],
      ["created", "added"],
    ],
  );
  assert.deepEqual(auditDiffRows(null, null), []);
  assert.equal(
    auditChangeSummary({ status: "active", a: "1", b: "1" }, { status: "suspended", a: "2", b: "3" }),
    "status: active → suspended · a: 1 → 2 · +1",
  );
  assert.equal(auditChangeSummary({ x: "1" }, { x: "1" }), "");
});

// ── The page ──────────────────────────────────────────────────────────────────────────────────

test("the page reads the real, cursor-paged store with the shared admin chrome", () => {
  const page = read("../../../app/(app)/admin/audit/page.tsx");
  const service = read("../../../services/admin-audit.service.ts");
  const hook = read("../../../hooks/use-admin-audit.ts");
  const drawer = read("../../../components/admin/audit/audit-detail-drawer.tsx");

  assert.ok(page.includes("<AdminPage>") && page.includes("<AdminPageHeader"), "uses the admin page chrome");
  assert.ok(page.includes("bg-panel"), "keeps the shared ground (check-admin-surface-contract)");
  assert.ok(page.includes('from "@/components/ui/tooltip"'), "uses the shared portalled tooltip");
  assert.ok(page.includes("auditFiltersToQuery(filters)"), "filters go to the server");
  assert.ok(!/pageSize|page=/.test(page), "no offset paging — the API is a cursor");
  assert.ok(hook.includes("useInfiniteQuery") && hook.includes("nextCursor"), "pages by cursor");
  assert.ok(hook.includes("refetchInterval"), "live refresh re-reads the log");
  assert.ok(service.includes("API.adminAuditLog.export") && service.includes('responseType: "blob"'), "CSV export");
  assert.ok(drawer.includes("auditDiffRows") && drawer.includes("CopyValue"), "the drawer diffs and copies");
  assert.ok(!page.includes("Spaming"), "nothing on the page is sample data");
});

test("the admin workspace page opens this log filtered to that workspace, in the URL shape the page reads", () => {
  const timeline = read("../../../components/admin/workspace-detail/workspace-timeline.tsx");
  assert.ok(timeline.includes("/admin/audit?range=all&workspace="), "the timeline links here");
  const filters = readAuditFilters(new URLSearchParams("range=all&workspace=w-1"));
  assert.equal(filters.workspaceId, "w-1");
  assert.equal(filters.preset, "all");
  assert.equal(auditFiltersToQuery(filters).workspaceId, "w-1");
});
