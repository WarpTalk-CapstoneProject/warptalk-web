import test from "node:test";
import assert from "node:assert/strict";

import { shouldReportDesktopSignedIn } from "../signed-in-report.ts";

test("the main window reports from every page, signed in or not", () => {
  for (const path of ["/", "/login", "/acme/rooms/123", "/workspace", null, undefined]) {
    assert.equal(shouldReportDesktopSignedIn(path), true, String(path));
  }
});

test("the popup over Meet does not report: the desktop asks the main window", () => {
  assert.equal(shouldReportDesktopSignedIn("/desktop-transcript/room-1"), false);
  assert.equal(shouldReportDesktopSignedIn("/desktop-transcript"), false);
  assert.equal(shouldReportDesktopSignedIn("/desktop-transcripts"), true);
});
