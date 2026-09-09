// Where a successful sign-in goes. WT-347.
//
// Signing in with no `callbackUrl` always landed on the Workspace Hub, and the hub then had to
// guess a workspace from a list that no longer carried any memory of which one this account was
// in — `login()` wipes the session-scoped stores, on purpose. Somebody who already had a
// workspace stopped one screen short of it on every sign-in.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getSafeCallbackUrl,
  resolvePostLoginDestination,
} from "../post-login-destination.ts";

test("an explicit destination is honoured before any memory", () => {
  // The route guard put it there: the person was on their way somewhere specific.
  assert.equal(
    resolvePostLoginDestination({
      callbackUrl: "/acme/rooms/123",
      lastWorkspaceSlug: "globex",
    }),
    "/acme/rooms/123",
  );
});

test("with no callback, a remembered workspace is entered directly", () => {
  assert.equal(
    resolvePostLoginDestination({ callbackUrl: null, lastWorkspaceSlug: "acme" }),
    "/acme/home",
  );
});

test("the landing page's default callback is not a choice to see the hub", () => {
  // Every guest is sent to `/login?callbackUrl=%2Fworkspace` by the landing CTA. That is the
  // landing page's fallback, not the visitor asking for the chooser, so it must not pin somebody
  // with a workspace to the hub.
  for (const bare of ["/workspace", "/workspace/"]) {
    assert.equal(
      resolvePostLoginDestination({ callbackUrl: bare, lastWorkspaceSlug: "acme" }),
      "/acme/home",
      `${bare} must yield to the remembered workspace`,
    );
  }
});

test("a checkout intent on the hub IS a choice, and survives", () => {
  // WT-491: `/workspace?planSlug=pro` is a buyer mid-purchase whom the hub forwards to the grid.
  assert.equal(
    resolvePostLoginDestination({
      callbackUrl: "/workspace?planSlug=pro",
      lastWorkspaceSlug: "acme",
    }),
    "/workspace?planSlug=pro",
  );
});

test("with nothing remembered, the hub is still the right place", () => {
  // A first sign-in, an account with only invitations, or a workspace since revoked: the hub
  // shows the chooser or auto-opens exactly as before.
  assert.equal(
    resolvePostLoginDestination({ callbackUrl: null, lastWorkspaceSlug: null }),
    "/workspace",
  );
  assert.equal(
    resolvePostLoginDestination({ callbackUrl: "/workspace", lastWorkspaceSlug: undefined }),
    "/workspace",
  );
});

test("a memory that does not parse as a slug is ignored, never navigated to", () => {
  for (const bad of ["Not A Slug", "workspace", "admin", "//evil.example", ""]) {
    assert.equal(
      resolvePostLoginDestination({ callbackUrl: null, lastWorkspaceSlug: bad }),
      "/workspace",
      `${JSON.stringify(bad)} must fall back to the hub`,
    );
  }
});

test("unsafe callbacks fall back exactly as before, then defer to the memory", () => {
  for (const unsafe of [null, undefined, "", "https://evil.example", "//evil.example", "/rooms"]) {
    assert.equal(getSafeCallbackUrl(unsafe), "/workspace");
    assert.equal(
      resolvePostLoginDestination({ callbackUrl: unsafe, lastWorkspaceSlug: "acme" }),
      "/acme/home",
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Wiring. A resolver nobody calls is the pre-WT-347 behaviour with a nicer file next to it.
// ─────────────────────────────────────────────────────────────────────────────

const root = path.resolve(import.meta.dirname, "../../../..");
const loginPage = readFileSync(
  path.join(root, "src/app/(auth)/login/page.tsx"),
  "utf8",
);
const registerPage = readFileSync(
  path.join(root, "src/app/(auth)/register/page.tsx"),
  "utf8",
);
const slugLayout = readFileSync(
  path.join(root, "src/app/(app)/[workspaceSlug]/layout.tsx"),
  "utf8",
);

test("the login page routes every sign-in through the resolver", () => {
  assert.match(loginPage, /resolvePostLoginDestination\(/);
  assert.doesNotMatch(
    loginPage,
    /router\.replace\(callbackUrl\)/,
    "a sign-in must not navigate to the raw callback: that is the hub-fallback bug",
  );
  // Both doors: the password form and the Google button each sign in and each navigate.
  assert.equal(
    (loginPage.match(/postLoginDestination\(user, rawCallbackUrl\)/g) ?? []).length,
    2,
    "both the password and the Google sign-in must ask the resolver",
  );
});

test("the register page no longer keeps its own copy of the callback rule", () => {
  assert.doesNotMatch(registerPage, /function getSafeCallbackUrl/);
  assert.match(registerPage, /from "@\/lib\/auth\/post-login-destination"/);
});

test("something actually writes the memory the login page reads", () => {
  // The whole design hinges on one writer: the slug layout, at the moment the server confirms
  // the selection for this account.
  assert.match(slugLayout, /rememberLastWorkspaceSlug\(currentUserId, workspaceSlug\)/);
});
