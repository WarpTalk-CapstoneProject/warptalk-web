import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { describeSessionDevice } from "../describe-session-device.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("device labels name the specific browser before the generic one it imitates", () => {
  assert.equal(
    describeSessionDevice(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    ).label,
    "Chrome on macOS",
  );
  assert.equal(
    describeSessionDevice(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
    ).label,
    "Edge on Windows",
  );
  const iphone = describeSessionDevice(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  );
  assert.equal(iphone.label, "Safari on iPhone");
  assert.equal(iphone.mobile, true);
  assert.equal(describeSessionDevice(null).label, "Unknown device");
  assert.equal(describeSessionDevice("curl/8.4.0").label, "curl/8.4.0");
});

/**
 * The current session ends through the auth store's logout(), never the revoke endpoint.
 *
 * Revoking the family this tab is using leaves the tab holding cookies for a dead session and
 * discovering it on the next refresh — the dead-session path the WT-405 logout storm lived on.
 * logout() is the guarded, deduplicated way out, and the server answers 409 to the other one.
 */
test("the sessions page signs the current device out through logout(), not revokeSession", () => {
  const page = read("../../../app/(app)/[workspaceSlug]/settings/account/sessions/page.tsx");

  assert.match(page, /useAuthStore\(\(s\) => s\.logout\)/);
  assert.match(page, /pending\.kind === "sign-out-current"\) \{\s*setPending\(null\);\s*logout\(\);/);
  // Revoke is only offered on rows that are not the current session.
  assert.match(page, /session\.isCurrent \? \([\s\S]*?Sign out[\s\S]*?\) : \([\s\S]*?kind: "revoke", session/);
  assert.match(page, /This device|SessionRow/);
  assert.match(page, /Sign out of all other sessions/);
  // Sign-out-others is offered only when the server identified this device.
  assert.match(page, /hasCurrent && others\.length > 0/);

  const hooks = read("../../../hooks/use-sessions.ts");
  assert.doesNotMatch(hooks, /authService\.logout|import .*auth-store/);
});

test("the Personal settings group links to Sessions & devices in both sidebar layouts", () => {
  const sidebar = read("../../../components/layout/linear-sidebar.tsx");
  const links = sidebar.match(/settings\/account\/sessions/g) ?? [];
  assert.ok(links.length >= 3, "expanded link, its active check, and the collapsed item");
});
