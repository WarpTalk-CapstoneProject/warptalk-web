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

function b64url(value: object) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Obviously fake, locally generated; only the exp claim is ever read. */
function jwt(expEpochSeconds: number) {
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: "u", exp: expEpochSeconds })}.sig`;
}

const liveJwt = jwt(Math.floor(Date.now() / 1000) + 1800);
const deadJwt = jwt(Math.floor(Date.now() / 1000) - 1800);

test("landing get started honors remembered auth and workspace cookies", () => {
  const cookies = `access_token=${liveJwt}; active_workspace_slug=acme`;

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

test("an expired access token cookie is not a remembered session", () => {
  // It used to be, for the full seven days the cookie was written to live — so the landing
  // page's main call to action sent signed-out visitors into an app that could only 401.
  assert.equal(hasRememberedAccessToken(`access_token=${deadJwt}`), false);
  assert.equal(hasRememberedAccessToken("access_token=token-1"), false);
  assert.equal(hasRememberedAccessToken(""), false);

  assert.equal(
    getLandingGetStartedHref({
      isAuthenticated: false,
      user: null,
      hasRememberedSession: hasRememberedAccessToken(`access_token=${deadJwt}`),
      activeWorkspaceSlug: "acme",
    }),
    "/login?callbackUrl=%2Fworkspace",
  );
});

test("the session marker still counts as a remembered session", () => {
  // The access token expires in 30 minutes but the refresh token lives for days; the
  // marker is what keeps that session remembered without pretending the token is alive.
  assert.equal(hasRememberedAccessToken("warptalk_session=1"), true);
  assert.equal(hasRememberedAccessToken(`access_token=${deadJwt}; warptalk_session=1`), true);
});
