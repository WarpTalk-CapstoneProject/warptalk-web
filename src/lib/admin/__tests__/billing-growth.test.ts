import test from "node:test";
import assert from "node:assert/strict";

import { completedMonthGrowth, growthWindow, mergeGrowthMonths } from "../billing-growth.ts";

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];

test("the window starts on the first of the month five months back", () => {
  const { from, to } = growthWindow(new Date(2026, 8, 23, 10));
  assert.equal(from.getFullYear(), 2026);
  assert.equal(from.getMonth(), 3);
  assert.equal(from.getDate(), 1);
  assert.equal(to.getDate(), 23);
});

test("sources are joined on the server's month keys", () => {
  const rows = mergeGrowthMonths({
    billing: {
      revenueByMonth: MONTHS.map((month, i) => ({ month, revenue: i === 2 ? null : i * 1000 })),
      activeWorkspacesByMonth: MONTHS.map((month, i) => ({ month, activeWorkspaces: i })),
    },
    users: {
      usersByMonth: MONTHS.map((month, i) => ({ month, newUsers: 1, totalUsers: i + 1, activeUsers: i * 2 })),
    },
    workspaces: { workspacesByMonth: MONTHS.map((month, i) => ({ month, newWorkspaces: 1, totalWorkspaces: i + 1 })) },
  });

  assert.deepEqual(rows.map((r) => r.month), MONTHS);
  assert.equal(rows[5].revenue, 5000);
  // A month whose revenue the server could not convert stays null, not 0.
  assert.equal(rows[2].revenue, null);
  assert.equal(rows[5].activeUsers, 10);
  assert.equal(rows[5].totalWorkspaces, 6);
});

test("a missing source leaves its columns null rather than zero", () => {
  const rows = mergeGrowthMonths({
    billing: { revenueByMonth: MONTHS.map((month) => ({ month, revenue: 1 })), activeWorkspacesByMonth: null },
    users: null,
    workspaces: {},
  });

  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.activeUsers === null && r.activeWorkspaces === null && r.totalWorkspaces === null));
});

test("growth compares the last complete month, never the month to date", () => {
  const rows = mergeGrowthMonths({
    users: {
      usersByMonth: [
        { month: "2026-07", newUsers: 0, totalUsers: 0, activeUsers: 40 },
        { month: "2026-08", newUsers: 0, totalUsers: 0, activeUsers: 50 },
        { month: "2026-09", newUsers: 0, totalUsers: 0, activeUsers: 3 },
      ],
    },
  });

  const growth = completedMonthGrowth(rows, (r) => r.activeUsers);
  assert.deepEqual(growth, { month: "2026-08", value: 50, previous: 40, percent: 25 });
  assert.equal(completedMonthGrowth(rows.slice(1), (r) => r.activeUsers), null);
  assert.equal(
    completedMonthGrowth(
      rows.map((r, i) => ({ ...r, activeUsers: i === 0 ? 0 : r.activeUsers })),
      (r) => r.activeUsers,
    )?.percent,
    null,
  );
});
