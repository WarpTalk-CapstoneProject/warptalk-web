# Admin Insights report export (WT-892)

Route: `/admin` (the platform Insights page). Component: `src/components/admin/insights/insights-dashboard.tsx`.

## What the Export menu does

- **Report (Word or PDF)...** opens `export-report-dialog.tsx`. The admin chooses the format
  (Word `.docx` or PDF), the classification (Confidential, the default, or Internal), and whether to
  include the day-by-day table. Everything else is decided by the report.
- **Raw data (.csv)** is unchanged: one row per metric, unit column says `USD`.

## How the report is built (all in the browser)

1. `buildInsightsReport` (`src/lib/admin/insights-report.ts`) turns the dashboard's own source states
   (billing, snapshot, users, workspaces, meetings, P&L) into a plain model. Nothing is invented: a
   figure the server could not compute is `—` with its note, never 0.
2. `buildInsightsReportDocx` (`insights-report-docx.ts`) lays the model out as A4 Word.
3. For PDF the browser POSTs that `.docx` to `POST /admin/reports/pdf`
   (`adminInsightsService.convertReportToPdf`); translation-room converts it with Gotenberg. The PDF
   is therefore the Word file, converted: one layout. 503 means the deployment has no converter; the
   toast says so and the Word export still works.

The report has **no charts**: tables and sentences only. `insights-report-charts.ts` was removed.

## Title format

Every export opens with the same title block:

| Line | Content | Example |
| --- | --- | --- |
| Title | `REPORT_TITLE`, fixed, title case | `WarpTalk Insights Report` |
| Period | `periodTitle(from, to)`, day before month | `1–30 September 2026` |
| Reporting period | ISO dates and the day count | `2026-09-01 to 2026-09-30 (30 days)` |
| Compared with | ISO dates and the basis | `2026-08-01 to 2026-08-30 (the same days of the previous month)` |

`periodTitle` forms: one day `3 October 2026`; within a month `1–30 September 2026`; across months
`28 September – 3 October 2026`; across years `15 December 2026 – 14 January 2027`.

`documentTitle` (`WarpTalk Insights Report — 1–30 September 2026`) is the file's title property and
the page footer, after the classification and before `Page x of y`. The file name stays
`warptalk-insights-report-<from>-to-<to>.docx|pdf`.

## What the document contains

- Classification line above the title, in the page header and in the footer.
- The title block above, the **time zone with its UTC offset** (the `tz` the queries carried), and the
  generation time in that zone.
- A **warning box** when the period is not closed (`ResolvedInsightsPeriod.closed === false`): how many
  days have passed, the planned end, and that every number can still change.
- Metric tables with **This period, Previous period, Difference (absolute, signed), Change (%)**.
  The change carries "better" or "worse" from the metric's `higherIsBetter`, and is coloured, so a
  falling AI cost and a falling revenue no longer look alike.
- A note when the average meeting length is above 6 h (rooms left open inflate "Hours translated").
- **Definitions** (last section): how each figure is calculated, including why new minus cancelled
  subscriptions does not equal the change in active subscriptions.

## USD only

USD is the only currency the document names. Amounts are formatted in USD by `formatInsightValue`.
Server notes are written for the dashboard and can quote VND ("includes 4,734,000 VND converted at
26,300 VND/USD"); every note passes through `usdOnlyNote`, which drops the amount, the rate and the
config key and keeps the fact that a conversion happened. A clause it does not recognise but that
still names VND is replaced whole. Tests assert that neither the model nor any text in the `.docx`
(body, header, footer, properties) contains "VND".

## Tests

`npm run test:admin-insights` covers the model (`insights-report.test.ts`) and the `.docx` output
(`insights-report-docx.test.ts`). Backend: `AdminReportsControllerTests` in translation-room.
