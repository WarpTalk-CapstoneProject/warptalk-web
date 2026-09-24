"use client";

/**
 * The platform audit log (`/admin/audit`), rendered against fixtures.
 *
 * The real page reads the workspace service's audit store, which a laptop without the backend
 * cannot reach. This renders the page's parts — the filter bar, the table and the detail drawer —
 * over entries shaped like the ones each service records, including the honest gaps: an entry
 * written before request details were captured, an actor the directory could not name, a failed
 * change with the error the admin saw, and a subject keyed by code rather than id.
 *
 * Fixtures only; /dev is 404 in production (`src/app/dev/layout.tsx` and the proxy).
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { AuditDetailDrawer } from "@/components/admin/audit/audit-detail-drawer";
import { AuditFilterBar } from "@/components/admin/audit/audit-filter-bar";
import { AuditTable } from "@/components/admin/audit/audit-table";
import { DEFAULT_AUDIT_FILTERS, type AuditFilters } from "@/lib/admin/audit-log";
import type { AdminAuditLogEntryDto, AdminAuditLogFacets } from "@/types/admin-audit";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

// i18n-allow: an administrator's own name is account data, not UI copy — and a Vietnamese one is
// the shape the actor column has to fit.
const ROOT = { id: "0197a1f2-1111-7000-8000-000000000001", name: "Huỳnh Thái Tú", email: "root@warptalk.io.vn" };
const OPS = { id: "0197a1f2-2222-7000-8000-000000000002", name: "Ops Admin", email: "ops@warptalk.io.vn" };
const WORKSPACE = {
  workspaceId: "5b6d35d3-c47c-4f48-93f8-2b5476bd4b8a",
  workspaceName: "Acme Localization",
  workspaceSlug: "acme-localization",
};
const REQUEST = { correlationId: "0HN6T2Q1V8K3M:00000004", ipAddress: "203.0.113.7", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Safari/605.1.15" };

const ENTRIES: AdminAuditLogEntryDto[] = [
  {
    id: "0197a200-0001-7000-8000-00000000a001",
    performedAt: minutesAgo(2),
    sourceService: "billing-service",
    action: "plan.updated",
    actor: ROOT,
    entity: { type: "plan", id: "0197a200-aaaa-7000-8000-000000000101", key: null, label: "Business", workspaceId: null, workspaceName: null, workspaceSlug: null },
    reason: "Q4 repricing approved by finance",
    result: "succeeded",
    errorMessage: null,
    request: REQUEST,
    beforeSummary: { price: "1490000", max_participants: "25", overage_price_per_credit: "0.012" },
    afterSummary: { price: "1690000", max_participants: "50", overage_price_per_credit: "0.012" },
  },
  {
    id: "0197a200-0002-7000-8000-00000000a002",
    performedAt: minutesAgo(9),
    sourceService: "billing-service",
    action: "rate_card.upserted",
    actor: OPS,
    entity: { type: "usage_rate", id: "0197a200-bbbb-7000-8000-000000000102", key: null, label: null, workspaceId: null, workspaceName: null, workspaceSlug: null },
    reason: null,
    result: "failed",
    errorMessage: "A rate card for cartesia/sonic-3 is already active for this period.",
    request: REQUEST,
    beforeSummary: null,
    afterSummary: { provider: "cartesia", model: "sonic-3", unit: "CRD", credit_price: "0.02" },
  },
  {
    id: "0197a200-0003-7000-8000-00000000a003",
    performedAt: minutesAgo(26),
    sourceService: "translation-room-service",
    action: "language.disabled",
    actor: ROOT,
    entity: { type: "supported_language", id: null, key: "th", label: "Thai", workspaceId: null, workspaceName: null, workspaceSlug: null },
    reason: "Disabled th for new rooms",
    result: "succeeded",
    errorMessage: null,
    request: REQUEST,
    beforeSummary: { code: "th", name: "Thai", is_active: "true" },
    afterSummary: { code: "th", name: "Thai", is_active: "false" },
  },
  {
    id: "0197a200-0004-7000-8000-00000000a004",
    performedAt: minutesAgo(70),
    sourceService: "billing-service",
    action: "credit.adjusted",
    actor: OPS,
    entity: { type: "credit_adjustment", id: "0197a200-cccc-7000-8000-000000000103", key: null, label: null, ...WORKSPACE },
    reason: "Compensation for the 22 Sep outage (ticket WT-812)",
    result: "succeeded",
    errorMessage: null,
    request: REQUEST,
    beforeSummary: { balance: "12000" },
    afterSummary: { balance: "17000", delta: "5000" },
  },
  {
    id: "0197a200-0005-7000-8000-00000000a005",
    performedAt: minutesAgo(180),
    sourceService: "assistant-service",
    action: "plugin.retired",
    actor: ROOT,
    entity: { type: "plugin", id: "0197a200-dddd-7000-8000-000000000104", key: null, label: "Google Calendar", workspaceId: null, workspaceName: null, workspaceSlug: null },
    reason: null,
    result: "succeeded",
    errorMessage: null,
    request: REQUEST,
    beforeSummary: { plugin_key: "google-calendar", label: "Google Calendar", is_active: "true" },
    afterSummary: { plugin_key: "google-calendar", label: "Google Calendar", is_active: "false" },
  },
  {
    id: "0197a200-0006-7000-8000-00000000a006",
    performedAt: minutesAgo(60 * 26),
    sourceService: "auth-service",
    action: "user.deactivated",
    actor: OPS,
    entity: { type: "user", id: "0197a200-eeee-7000-8000-000000000105", key: null, label: "Spam Account", workspaceId: null, workspaceName: null, workspaceSlug: null },
    reason: "Automated sign-ups from a disposable domain",
    result: "succeeded",
    errorMessage: null,
    request: REQUEST,
    beforeSummary: { is_active: "true" },
    afterSummary: { is_active: "false" },
  },
  {
    // Written before request details were captured, by an admin the directory no longer knows.
    id: "0197a200-0007-7000-8000-00000000a007",
    performedAt: minutesAgo(60 * 24 * 12),
    sourceService: "workspace-service",
    action: "suspend",
    actor: { id: "0197a1f2-9999-7000-8000-000000000009", name: null, email: null },
    entity: { type: "workspace", id: WORKSPACE.workspaceId, key: null, label: WORKSPACE.workspaceName, ...WORKSPACE },
    reason: "Spam campaign reported by three recipients",
    result: "succeeded",
    errorMessage: null,
    request: { correlationId: "0HN5A9Q2R1:00000002", ipAddress: null, userAgent: null },
    beforeSummary: { status: "active" },
    afterSummary: { status: "suspended" },
  },
];

const FACETS: AdminAuditLogFacets = {
  actions: Array.from(new Set(ENTRIES.map((entry) => entry.action))).map((value) => ({ value, count: 1 })),
  entityTypes: Array.from(new Set(ENTRIES.map((entry) => entry.entity.type))).map((value) => ({ value, count: 1 })),
  sourceServices: Array.from(new Set(ENTRIES.map((entry) => entry.sourceService))).map((value) => ({ value, count: 1 })),
  actors: [
    { ...ROOT, count: 3 },
    { ...OPS, count: 3 },
    { id: "0197a1f2-9999-7000-8000-000000000009", name: null, email: null, count: 1 },
  ],
};

export default function AdminAuditPreview() {
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_AUDIT_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);

  // A stand-in for the server's filters, enough to see the bar drive the table.
  const entries = useMemo(
    () =>
      ENTRIES.filter(
        (entry) =>
          (!filters.actorId || entry.actor.id === filters.actorId)
          && (!filters.action || entry.action === filters.action)
          && (!filters.entityType || entry.entity.type === filters.entityType)
          && (filters.result === "all" || entry.result === filters.result)
          && (!filters.q || JSON.stringify(entry).toLowerCase().includes(filters.q.toLowerCase())),
      ),
    [filters],
  );
  const open = ENTRIES.find((entry) => entry.id === openId) ?? null;

  // The fixtures are "n minutes ago" from the moment the module loads, which differs between the
  // server render and the browser; the real page's data only ever arrives in the browser.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return <div className="min-h-full bg-panel" />;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Operations"
        eyebrowIcon={<ClockCounterClockwise size={14} weight="fill" />}
        title="Audit log"
        description="Fixture preview of /admin/audit."
      />
      <AuditFilterBar
        filters={filters}
        facets={FACETS}
        workspaceName={null}
        trailing={`${entries.length} entries loaded`}
        onChange={(next) => setFilters((current) => ({ ...current, ...next }))}
        onClear={() => setFilters(DEFAULT_AUDIT_FILTERS)}
      />
      <AdminPanel className="mt-4">
        <AuditTable entries={entries} selectedId={openId} onOpen={(entry) => setOpenId(entry.id)} />
      </AdminPanel>
      {openId ? (
        <AuditDetailDrawer
          entry={open}
          isLoading={false}
          isError={false}
          onClose={() => setOpenId(null)}
          onFilterActor={(entry) => {
            setFilters((current) => ({ ...current, actorId: entry.actor.id }));
            setOpenId(null);
          }}
          onFilterSubject={(entry) => {
            setFilters((current) => ({ ...current, entityType: entry.entity.type }));
            setOpenId(null);
          }}
        />
      ) : null}
    </AdminPage>
  );
}
