import test from "node:test";
import assert from "node:assert/strict";

import { meetingDirectoryParams } from "../meeting-directory-params.ts";

test("WT-693: the default 'all' tab sends no status filter", () => {
  // Exactly what the page built on first paint, which the API answered with a 400.
  const params = meetingDirectoryParams({ page: 1, pageSize: 20, status: "all", sort: "recent_desc" });

  assert.deepEqual(params, { page: 1, pageSize: 20, sort: "recent_desc" });
  assert.equal("status" in params, false);
});

test("a real status or 'live' is passed through unchanged", () => {
  for (const status of ["live", "SCHEDULED", "ENDED", "CANCELLED", "FAILED", "EXPIRED"] as const) {
    assert.equal(meetingDirectoryParams({ page: 1, status }).status, status);
  }
});

test("no status stays no status", () => {
  assert.deepEqual(meetingDirectoryParams({ page: 2 }), { page: 2 });
});
