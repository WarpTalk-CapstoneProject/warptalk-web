// Every Insights drill-down points at a real admin page, with a filter that page really reads.
//
// A link whose route was renamed 404s; a link whose query param the target ignores is worse — it
// opens the unfiltered list under a card that promised a count. Both are invisible to types, so
// the targets are checked against the page sources.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INSIGHTS_LINK_TARGETS,
  insightsHref,
  metricHref,
  workspaceHref,
} from "../insights-links.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const ADMIN_ROOT = "src/app/(app)/admin";

function pageSource(routePath: string): string | null {
  const segment = routePath.replace(/^\/admin\/?/, "");
  const file = path.join(root, ADMIN_ROOT, segment, "page.tsx");
  if (!existsSync(file)) return null;
  let source = readFileSync(file, "utf8");
  // A route that re-exports another page (the billing ledger) is checked against that page.
  const reexport = /export \{ default \} from "([^"]+)"/.exec(source);
  if (reexport) {
    source = readFileSync(path.resolve(path.dirname(file), `${reexport[1]}.tsx`), "utf8");
  }
  return source;
}

for (const [key, target] of Object.entries(INSIGHTS_LINK_TARGETS)) {
  test(`${key} → ${insightsHref(key as keyof typeof INSIGHTS_LINK_TARGETS)} exists and honours its filter`, () => {
    const source = pageSource(target.path);
    assert.ok(source, `${target.path} has a page under ${ADMIN_ROOT}`);
    for (const [param, value] of Object.entries(("params" in target ? target.params : {}) as Record<string, string>)) {
      // Read by hand, or by the admin list toolkit: `useAdminListState` owns q/sort/dir/page and
      // one param per filter the page's config declares (src/lib/admin/list-state.ts).
      const readsByHand = new RegExp(`searchParams\\.get\\("${param}"\\)`).test(source);
      const readsByToolkit =
        /useAdminListState\(/.test(source) &&
        (["q", "sort", "dir", "page"].includes(param) || new RegExp(`key: "${param}"`).test(source));
      assert.ok(readsByHand || readsByToolkit, `${target.path} reads ?${param}=`);
      assert.ok(
        source.includes(`"${value}"`) || (param === "status" && target.path === "/admin/sales-leads"),
        `${target.path} knows the value ${param}=${value}`,
      );
    }
  });
}

test("sales leads statuses come from the shared list, which includes new", () => {
  const types = readFileSync(path.join(root, "src/types/admin-sales-lead.ts"), "utf8");
  assert.match(types, /SALES_LEAD_STATUSES = \[\s*"new"/);
});

test("the workspace detail route accepts an id", () => {
  assert.ok(existsSync(path.join(root, ADMIN_ROOT, "workspaces/[workspaceRef]/page.tsx")));
  assert.equal(workspaceHref("5b6d35d3-c47c-4f48-93f8-2b5476bd4b8a"), "/admin/workspaces/5b6d35d3-c47c-4f48-93f8-2b5476bd4b8a");
  assert.equal(workspaceHref(""), null);
  assert.equal(workspaceHref(null), null);
});

test("period metrics are not linked, because no admin list filters by date", () => {
  for (const id of ["revenue", "payments", "newSubscriptions", "cancelledSubscriptions", "newUsers", "meetingsHeld"]) {
    assert.equal(metricHref(id), null, id);
  }
  // …and the claim holds: the list pages read no date range from the URL.
  for (const route of ["/admin/subscriptions", "/admin/users"]) {
    const source = pageSource(route) ?? "";
    assert.doesNotMatch(source, /searchParams\.get\("(from|to)"\)/, `${route} takes a date range now — link the period cards`);
  }
});

test("snapshot figures link to their exact sets", () => {
  assert.equal(metricHref("activeSubscriptions"), "/admin/subscriptions?status=active");
  assert.equal(metricHref("openSalesLeads"), "/admin/sales-leads?status=new");
});

test("nothing links into the retired meeting directory or event outbox", () => {
  // Both pages were taken out of the portal on 2026-09-24 and their routes forward to /admin.
  for (const target of Object.values(INSIGHTS_LINK_TARGETS)) {
    assert.ok(!/^\/admin\/(meetings|outbox)(\/|$)/.test(target.path), target.path);
  }
  assert.equal(metricHref("liveMeetings"), null, "the live count stays, unlinked");
  assert.equal(metricHref("deadLetters"), null, "the dead-letter count stays, unlinked");
  assert.ok(!existsSync(path.join(root, ADMIN_ROOT, "meetings/page.tsx")));
  assert.ok(!existsSync(path.join(root, ADMIN_ROOT, "outbox/page.tsx")));
});
