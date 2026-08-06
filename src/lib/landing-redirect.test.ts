import assert from "node:assert/strict";
import test from "node:test";
import {
  getRememberedWorkspaceSlug,
  getLandingGetStartedHref,
  hasRememberedAccessToken,
} from "./landing-redirect.ts";
import { getWorkspaceEntryPath, isUsableWorkspaceSlug } from "./workspace-slug.ts";

test("landing get started sends guests to login with workspace callback", () => {
  assert.equal(
    getLandingGetStartedHref({
      isAuthenticated: false,
      user: null,
      activeWorkspaceSlug: "acme",
    }),
    "/login?callbackUrl=%2Fworkspace",
  );
});

test("landing get started sends remembered workspace users to workspace home", () => {
  assert.equal(
    getLandingGetStartedHref({
      isAuthenticated: true,
      user: { id: "user-1" },
      activeWorkspaceSlug: "Acme-Team",
    }),
    "/acme-team/home",
  );
});

test("landing get started honors remembered auth and workspace cookies", () => {
  const cookies = "access_token=token-1; active_workspace_slug=acme";

  assert.equal(
    getLandingGetStartedHref({
      isAuthenticated: false,
      user: null,
      hasRememberedSession: hasRememberedAccessToken(cookies),
      activeWorkspaceSlug: getRememberedWorkspaceSlug(null, cookies),
    }),
    "/acme/home",
  );
});

test("landing get started falls back to workspace gate for missing or reserved slugs", () => {
  assert.equal(getWorkspaceEntryPath(null), "/workspace");
  assert.equal(getWorkspaceEntryPath("workspace"), "/workspace");
  assert.equal(getWorkspaceEntryPath("localhost"), "/workspace");
  assert.equal(getWorkspaceEntryPath("localhost:3000"), "/workspace");
});

test("remembered workspace slug ignores invalid state and invalid cookies", () => {
  assert.equal(getRememberedWorkspaceSlug("workspace", "active_workspace_slug=acme"), "acme");
  assert.equal(getRememberedWorkspaceSlug(null, "active_workspace_slug=localhost"), null);
});

test("workspace slug validation rejects route-like and URL-like values", () => {
  assert.equal(isUsableWorkspaceSlug("acme"), true);
  assert.equal(isUsableWorkspaceSlug("acme-team"), true);
  assert.equal(isUsableWorkspaceSlug("/acme"), false);
  assert.equal(isUsableWorkspaceSlug("acme/team"), false);
  assert.equal(isUsableWorkspaceSlug("localhost"), false);
  assert.equal(isUsableWorkspaceSlug("localhost:3000"), false);
});
