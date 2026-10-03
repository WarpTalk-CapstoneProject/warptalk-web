# Workspace Insights (`/{slug}/insights`) — WT-878

## Purpose

One page for a workspace owner or admin to answer "where do the credits go, and is anything
wrong": credits, meetings and WarpBot tool calls over a chosen period, with the previous period
beside every figure. It is the workspace-scoped twin of the platform Insights page (`/admin`) and
uses the same grammar: a period bar in the URL, period cards with a delta, "right now" snapshot
cards, charts that lead with their total, and lists that link to where a thing is fixed.

Since 2026-10-01 Insights is in the **main** sidebar, first in the Workspace group, where
Dashboard was (owner's call): two owner overviews of the same credits, meetings and spend read as
two places. `/{slug}/dashboard` still exists — sign-in lands there — and sends an Owner/Admin on to
`/insights` with `router.replace`; a member keeps its refusal. Deleting the Dashboard page is a
later decision. Insights is no longer in the Settings sidebar and no longer keeps the Settings
chrome.

Settings → Plugin activity is the per-call record again: the telemetry dashboard #608 put on top of
it (`workspace-telemetry-dashboard.tsx`) was built from placeholder figures and was removed. Its
counts and charts are answered here, on the Tools tab.

## WarpBot answers from the page (2026-10-03)

**What changed.** An Owner/Admin who opens WarpBot with an empty conversation on Insights sees three
starters for the tab on screen, the workspace twins of the platform ones on `/admin`. Each tab sends
the figures it is showing to WarpBot as its page context:

| Tab | pageType | Starters |
| --- | --- | --- |
| Overview | `workspace_insights` | Credits used this period vs last / Will our credits last this cycle? / Any tools failing or needing setup? |
| Usage | `workspace_insights_usage` | Which AI service costs us the most this cycle? / Is our spending concentrated in a few members? / At this pace, when do our credits run out? |
| Tools | `workspace_insights_tools` | Which tools fail the most? / How many tool calls vs the previous period? / Which plugin tools are blocked or need setup? |

Scope is this page only (owner's call, 2026-10-03): Billing, Invoices, Plugins, Plugin activity and
the other Settings tabs register nothing and offer no starters.

**Why no tool.** The platform starters are answered by read-only admin tools. The workspace WarpBot
has no tool that reads a workspace's credits, plan or tool-call counts, and the owner's call was to
keep this simple: each tab has already read its figures with the owner's own token, so it hands
them to WarpBot as its ambient page context and the worker prints them as
"Visible snapshot: key=value, …". Nothing changed in the backend or the AI worker.

**How it works.**

- One pure builder per tab turns what the tab holds into flat `key=value` text, all under
  `lib/workspace/insights/`: Overview `assistant-snapshot.ts`, Usage `usage-assistant-snapshot.ts`
  (built from the helpers the tab draws with), Tools `tools-assistant-snapshot.ts`. Shared text
  rules (no comma, dates, the cycle projection sentence) are in `snapshot-text.ts`.
- Each tab registers its snapshot with `useRegisterAssistantContext` under its pageType: Overview in
  `insights-dashboard.tsx`, Usage in `usage-tab.tsx`, Tools in `tools-tab.tsx`. The context
  unregisters when the tab unmounts, so switching tab swaps the starters.
- `global-chatbot.tsx` asks `suggestedPromptsFor` (`lib/assistant/assistant-scope.ts`) which starters
  to show: the platform three in platform scope, the tab's three while its pageType is the effective
  page context, none otherwise. The composer shows the usual context pill, labelled by
  `common.assistant.pageContextLabels.*` (`insights`, `insightsUsage`, `insightsTools`).
- The Usage hook now also reports `ledgerComplete` (false when paging stopped at its cap), which the
  Usage snapshot prints as "at least N".

**Rules every snapshot keeps.** A source that is loading, failed or was not read has no key (never a
0, "off" or "none"); a re-read still showing the previous period's figures (`refreshing`) sends
nothing for them; a capped read is "at least N"; no value holds a comma (the worker joins pairs with
", "), and user-typed labels go through `plain`; no snapshot uses the keys the context pill reads
(`title`, `name`, `query`, `status`). Nobody is named: Usage sends how many members spent credits
and the top spender's share, never who.

**Known limitations.**

- WarpBot knows only what the tab shows right now. Overview and Tools follow the period on screen; a
  question about another month, a per-member name or one meeting's cost is not in the snapshot.
  Usage is the whole workspace for the billing cycle: the tab's own member filter is not sent.
- Switching the context pill off removes the starters with it.
- The snapshot is what the browser sent. It is the owner's own figures shown back to the owner, so
  it is not a permission boundary and must not be read as one by anything server-side. A member
  never reaches this page's data, and the tabs register nothing for a member.

**Testing checklist.** Owner/admin, WarpBot open with no messages, on each tab: three starters for
that tab and a context pill named for it; click one and the answer quotes the tab's numbers.
Overview/Tools: change the period and the next answer follows it. Switch Overview → Usage → Tools:
the starters change with the tab. Any other page (Billing and Plugins included): no starters.
Platform admin on `/admin`: the platform three, unchanged. Tests: `npm run test:workspace-insights`
(the three snapshot builders) and `npm run test:platform-warpbot` (`assistant-scope.test.ts` plus
the wiring contract, which pins tab -> scope -> widget label for every surface).

## The stand-alone Usage page is retired (2026-10-03)

**What changed.** `/{slug}/settings/billing/usage` was deleted on the owner's call: Insights → Usage
already rendered the same `UsageOverview` (member filter, refresh, CSV export) from the same
queries, so the workspace had two doors to one surface.

- `src/proxy.ts` forwards `/{slug}/settings/billing/usage` → `/{slug}/insights?tab=usage` with a
  real 3xx (same pattern as the retired Payments and Audit log addresses), so bookmarks land on the
  tab. Only a segment that can be a workspace slug is rewritten.
- The settings sidebar loses its "Usage" row in both the collapsed and the expanded list;
  `sidebar.settingsNav.usage` is removed from `messages/{en,vi,ja}/common.json`. Billing keeps
  `exact: true` because Invoices still sits below it.
- The page's design notes moved to the top of `usage-overview.tsx`;
  `use-workspace-usage-overview.ts` is now the only copy of the data loading.
- `settingsBillingUsage.accessDenied` stays: the Usage tab's member notice uses it.

**Testing checklist.** Owner/admin: the sidebar shows no Usage row; opening the old address lands
on Insights with the Usage tab selected; the tab shows the cycle, chart, rails and CSV export.
Member: the old address forwards and then shows the Insights access notice.

## Who can see it

Owner and Admin. The route shows a spinner until the workspace role is loaded, then either the page
or an access-denied notice (same pattern as Plugin activity). The sources it reads (credit history,
usage by member, the tool-call insights endpoint, the plugin audit log) refuse a member anyway.

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
| `settings/billing/components/usage-overview.tsx` (`embedded`) | The Usage tab renders `UsageOverview` with `embedded`: no "Usage" h1 and no cycle pill (the tab's caption states the cycle); member filter, refresh and CSV export stay. Its header comment holds the surface's design notes (moved from the retired page). `embedded={false}` is only used by the `/dev/usage-preview` fixtures now. |
| `src/hooks/use-workspace-usage-overview.ts` | The Usage tab's data: balance, the cycle's full ledger, the service breakdown, members, the cycle's meetings; billing hub + 30s visible-tab poll. The only copy since the stand-alone page was retired. |
| `src/hooks/use-workspace-insights.ts` | Overview sources as `InsightsSourceState`s; `INSIGHTS_QUERY_ROOT`; `useInsightsUpdatedAt`. |
| `src/lib/workspace/insights/overview-metrics.ts` | Pure arithmetic (ledger, meetings, six months, attention, CSV). Tested. |
| `src/hooks/use-workspace-tool-insights.ts` | The one tool-call read (`GET /assistant/workspaces/{id}/insights/tools`), shared by Overview and Tools through one query key under `INSIGHTS_QUERY_ROOT`. |
| `src/lib/workspace/insights/tool-insights.ts` | Tool-call helpers shared by both tabs: 180-day window clamp, response normalising, success rate, "Recording since" notice, comparable previous period, line status, needs-setup plugins, calls by origin. Tested. |
| `src/lib/workspace/insights/tools-metrics.ts` | Tools tab shaping: day series (+ days still to come), outcomes split, source chips, the tool table and its "who to fix", durations. Tested. |
| `src/components/workspace/insights/tools/*` | Tools tab pieces: summary line, the two chart panels, the all-tools table, panel chrome, formatters. |
| `src/types/assistant-tool-insights.ts` | The endpoint's response, field for field. |
| `messages/{en,vi,ja}/workspaceInsights.json` | Every string. Nav label: `common.sidebar.nav.insights`. |

## Where every Overview figure comes from

| Figure | Source | Notes |
|---|---|---|
| Credits used (+ previous) | `billingService.getAllCreditHistory` from the previous period's start | Spend = negative amount (Usage page rule), filtered client-side to each window. Paging capped at 10,000 rows: a capped read prints "at least N" and no delta. |
| Meetings held, Hours translated | `translationRoomService.history` status ENDED, ±7 days slack | A meeting is held in the window when it ENDED and `startedAt` is inside it. Hours from `durationSeconds`, else `endedAt − startedAt`; rooms with neither are counted as meetings and left out of hours (card note says how many). 10 × 100 rows cap → "at least". |
| Tool calls, Tool success rate | `assistantService.getWorkspaceToolInsights(from, to)` → `totals` | Every WarpBot call: built-in, web search, plugin. Rate = `ok / calls`; no calls = no rate (never 96%). The calls delta uses `previousPeriodCalls` (same length, immediately before), and is left out when that period starts before `recordingSince`. The rate has no delta (the server sends no previous rate). |
| Credits remaining | `getWorkspaceCredits` | 404 = no plan. Amber ≤ 10% left, red ≤ 1% (`decideUsageWarning`). |
| Runs out in | `projectCycle` (`lib/billing/cycle-projection.ts`) | Says the projection's own reason when it declines. |
| Plan | `getActiveSubscription` | Renews / ends on the period end. |
| Active members | `getUsageByMember(from, to)` + member directory | "Active" = spent credits in the period. |
| Avg credits per meeting, Credits per active member | Derived | Unavailable when a side is unknown, a floor, or zero. |
| Connected plugins, Pending approvals | `assistantService.getWorkspacePlugins` | `inWorkspace.length`; pending plugin requests. |
| Credits, 6 months | `getWorkspaceUsageChart(year)` (one or two years) | A month the chart does not describe is a gap. |
| Credits per day (combo) | Ledger (columns, left) + held meetings (line, right, integer) | Future days blank; days a capped ledger read does not cover are blank, not 0. |
| Credits by AI service | Ledger, by `serviceOfTransaction` | Not the breakdown endpoint: it only answers "last N days from now" and cannot describe a past month. |
| Tool calls by source | Tool insights `byTool`, folded by `callsByOrigin` | Built-in tools as one row, web search as one row, each plugin its own row (catalog label). |
| Recent tool activity | `listWorkspacePluginToolAudits` skip 0 take 4 | A list of the newest plugin calls, never counted; plugin-only by nature (the audit log). |
| Needs attention | balance, subscription, `getRecurringBilling`, tool insights, workspace plugins | Needs-setup plugins and policy blocks come from the tool insights. Each row links to where it is fixed; a source that did not answer is listed as "Not checked". |
| Up next | `translationRoomService.list` with `UNFINISHED_ROOM_STATUSES_FILTER` | Dashboard's rule. |

The topbar breadcrumb (`src/app/(app)/layout.tsx`) labels the `insights` segment with
`sidebar.nav.insights`, the same key the sidebar entry uses.

## Tools tab and tool outcomes (wave 4, 2026-10-01)

Every tool figure on both tabs comes from one endpoint,
`GET /api/v1/assistant/workspaces/{workspaceId}/insights/tools?from=ISO&to=ISO` (Owner/Admin, the
plugin audit log's check). The assistant service records every WarpBot call in
`assistant.assistant_tool_calls` — built-in tools, web search and plugin tools — with metadata only
(no argument or result text), and counts them: `totals`, `bySource`, `byDay` (every UTC day of the
window, zero days included), `byTool`, `previousPeriodCalls` and `recordingSince` (the earliest row
anywhere). The page no longer pages the plugin audit log to count anything; Settings → Plugin
activity is still the per-call record and still reads that log.

- **Outcomes** are bucketed by the worker with the web's rules from `plugin-activity.ts`: ok, error,
  blocked (`permission_denied`, `tool_blocked`, `workspace_tool_blocked`), declined
  (`access_denied`), needs setup (`missing_scope`, `api_key_required`, …) and awaiting confirmation.
  The Overview line and the Tools summary line share one rule: amber for needs setup **or** error;
  policy blocks and declines do not colour it.
- **Calls per day**: columns stacked by source (built-in `--viz-1`, web search `--viz-2`, plugin
  `--viz-3`) with the day's success rate (`ok / calls`) as a line on a % axis. Days are the server's
  UTC dates, plotted as sent; a month or custom range still in progress adds the days still to come,
  blank. The figure's caption gives the previous period's calls when it is comparable.
- **Outcomes**: one bar per outcome with its share; the caption is the median call time (web search
  has none).
- **All tools**: one row per tool that ran, most called first, with a source chip (built-in, web
  search, plugin) and filter chips above when more than one source ran. A plugin tool with
  needs-setup calls says the member fixes it in My connections; one with policy blocks says the
  Owner can allow it; both link to Plugin activity to see who.
- **Recording since {date}** shows when the window starts before `recordingSince`, so days before
  recording do not read as quiet days. The previous-period delta is dropped for the same reason
  when the previous window starts before it.
- **180 days at most**: the server refuses longer windows, so a longer period (6 months, a long
  custom range) is asked for as its last 180 days and the tab says which days it shows.

## Known limitations

- Days are cut in browser local time (the period bar's calendar); the sources carry instants. The
  tool-call days are the server's UTC dates (the chart says so).
- The tool calls delta compares with the window of the same length immediately before, even when
  the period bar's caption says "vs the same days last month".
- Every to-now period refreshes all paged reads once a minute.
- Period labels and captions come from `lib/admin/insights-period.ts` in English, as on `/admin`.

## Testing checklist

- `npm run test:workspace-insights` (overview + shared tool-insights helpers) and
  `npm run test:workspace-insights-tools` (Tools tab derivations), both in `test:contracts`.
- `npm run test:i18n-catalog`, `test:english-ui`, `test:page-ground`, `typecheck`, `lint`.
- Manual: owner and admin see the page; a member sees the access notice. Switch tabs and periods;
  the URL follows and back/forward restore it. Kill one endpoint (e.g. block the audit log) and
  confirm only its cards read "Not available yet". Export CSV on Overview. On Tools: chips filter
  the table; a period before recording began shows the "Recording since" notice; 6 months shows
  the 180-day notice.
