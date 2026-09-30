# Workspace Insights (`/{slug}/insights`) — WT-878

## Purpose

One page for a workspace owner or admin to answer "where do the credits go, and is anything
wrong": credits, meetings and WarpBot tool calls over a chosen period, with the previous period
beside every figure. It is the workspace-scoped twin of the platform Insights page (`/admin`) and
uses the same grammar: a period bar in the URL, period cards with a delta, "right now" snapshot
cards, charts that lead with their total, and lists that link to where a thing is fixed.

The older pages that answered parts of this — `/{slug}/dashboard`, Settings → Usage
(`settings/billing/usage`) and Settings → Plugin activity (`settings/plugin-activity`, with
`workspace-telemetry-dashboard.tsx`) — are **unchanged and still in the nav**. Retiring them is a
later decision (see the approved mockup's notes).

## Who can see it

Owner and Admin. The route shows a spinner until the workspace role is loaded, then either the page
or an access-denied notice (same pattern as Plugin activity). The sources it reads (credit history,
usage by member, the plugin audit log) refuse a member anyway.

## URL

`?tab=overview|usage|tools` (Overview is the default and is left out of the URL) plus the platform
page's period params, resolved by `lib/admin/insights-period.ts`:
`period=today|7d|month|6m|custom`, `month=YYYY-MM`, `from=YYYY-MM-DD`, `to=YYYY-MM-DD`.
Switching tab keeps the period; choosing a period keeps the tab. Both use
`router.replace(…, { scroll: false })`. "Now" advances once a minute while the tab is visible.

## Files

| File | Role |
|---|---|
| `src/app/(app)/[workspaceSlug]/insights/page.tsx` | Route: role gate, URL state, the minute clock, Suspense. |
| `src/components/workspace/insights/insights-dashboard.tsx` | Shell: title + Updated pulse, tab switch, period bar (hidden on Usage), active tab, Overview CSV export. |
| `src/components/workspace/insights/period-bar.tsx` | `PeriodBar` (admin bar, class for class; Export optional). |
| `src/components/workspace/insights/insights-primitives.tsx` | Shared view blocks (`CardShell`, `CardLabel`, `Panel`, `SourceBody`, `Rows`/`Row`/`Tag`, `UpdatedPulse`…) — the admin page's file-private ones, same classes. For all three tabs. |
| `src/components/workspace/insights/overview-model.ts` | Threads source states through the lib derivations; one model feeds the cards and the export. |
| `src/components/workspace/insights/overview-tab.tsx` | The Overview view. |
| `src/components/workspace/insights/usage-tab.tsx`, `tools-tab.tsx` | Usage / Tools tabs (separate tasks), same `InsightsTabProps` contract. |
| `settings/billing/components/usage-overview.tsx` (`embedded`) | The Usage tab renders the Usage page's `UsageOverview` with `embedded`: no "Usage" h1 and no cycle pill (the tab's caption states the cycle); member filter, refresh and CSV export stay. Default `false` leaves `/settings/billing/usage` unchanged. |
| `src/hooks/use-workspace-insights.ts` | Overview sources as `InsightsSourceState`s; `INSIGHTS_QUERY_ROOT`; `useInsightsUpdatedAt`. |
| `src/lib/workspace/insights/overview-metrics.ts` | Pure arithmetic (ledger, meetings, six months, attention, CSV). Tested. |
| `src/lib/workspace/insights/tool-audits.ts` | Reading and counting the plugin audit log over a window. Tested; shared with the Tools tab. |
| `messages/{en,vi,ja}/workspaceInsights.json` | Every string. Nav label: `common.sidebar.settingsNav.insights`. |

## Where every Overview figure comes from

| Figure | Source | Notes |
|---|---|---|
| Credits used (+ previous) | `billingService.getAllCreditHistory` from the previous period's start | Spend = negative amount (Usage page rule), filtered client-side to each window. Paging capped at 10,000 rows: a capped read prints "at least N" and no delta. |
| Meetings held, Hours translated | `translationRoomService.history` status ENDED, ±7 days slack | A meeting is held in the window when it ENDED and `startedAt` is inside it. Hours from `durationSeconds`, else `endedAt − startedAt`; rooms with neither are counted as meetings and left out of hours (card note says how many). 10 × 100 rows cap → "at least". |
| Tool calls, Tool success rate | `assistantService.listWorkspacePluginToolAudits`, paged newest-first until a row predates the previous period | No date filter or total on the endpoint. 40 × 50 rows cap; a capped read prints "at least N" and the rate says it is of the newest calls read. No calls = no rate (never 96%). |
| Credits remaining | `getWorkspaceCredits` | 404 = no plan. Amber ≤ 10% left, red ≤ 1% (`decideUsageWarning`). |
| Runs out in | `projectCycle` (`lib/billing/cycle-projection.ts`) | Says the projection's own reason when it declines. |
| Plan | `getActiveSubscription` | Renews / ends on the period end. |
| Active members | `getUsageByMember(from, to)` + member directory | "Active" = spent credits in the period. |
| Avg credits per meeting, Credits per active member | Derived | Unavailable when a side is unknown, a floor, or zero. |
| Connected plugins, Pending approvals | `assistantService.getWorkspacePlugins` | `inWorkspace.length`; pending plugin requests. |
| Credits, 6 months | `getWorkspaceUsageChart(year)` (one or two years) | A month the chart does not describe is a gap. |
| Credits per day (combo) | Ledger (columns, left) + held meetings (line, right, integer) | Future days blank; days a capped ledger read does not cover are blank, not 0. |
| Credits by AI service | Ledger, by `serviceOfTransaction` | Not the breakdown endpoint: it only answers "last N days from now" and cannot describe a past month. |
| Tool calls by plugin, Recent tool activity | Audit read | Labels from the plugin catalog. |
| Needs attention | balance, subscription, `getRecurringBilling`, audit read, workspace plugins | Each row links to where it is fixed; a source that did not answer is listed as "Not checked". |
| Up next | `translationRoomService.list` with `UNFINISHED_ROOM_STATUSES_FILTER` | Dashboard's rule. |

The topbar breadcrumb (`src/app/(app)/layout.tsx`) labels the `insights` segment with
`sidebar.settingsNav.insights`, the same key the sidebar entry uses.

## Known limitations

- Days are cut in browser local time (the period bar's calendar); the sources carry instants.
- Every to-now period refreshes all paged reads once a minute.
- Period labels and captions come from `lib/admin/insights-period.ts` in English, as on `/admin`.

## Testing checklist

- `npm run test:workspace-insights` (overview + tool-audit derivations) and
  `npm run test:workspace-insights-tools` (Tools tab derivations), both in `test:contracts`.
- `npm run test:i18n-catalog`, `test:english-ui`, `test:page-ground`, `typecheck`, `lint`.
- Manual: owner and admin see the page; a member sees the access notice. Switch tabs and periods;
  the URL follows and back/forward restore it. Kill one endpoint (e.g. block the audit log) and
  confirm only its cards read "Not available yet". Export CSV on Overview.
