import assert from "node:assert/strict";
import test from "node:test";

import { resolveAvatarUrl } from "../avatar-url.ts";

/**
 * `user.avatarUrl` holds two different kinds of value and only one of them works untouched.
 *
 * A Google-hosted picture is an absolute URL. One uploaded here is a path —
 * `/api/v1/auth/profile/avatar/{id}.jpg` — stored relative on purpose, because the origin the API
 * is reached on differs between environments and an absolute URL baked at upload time would be
 * wrong in all but one of them.
 *
 * Handed straight to an <img> that path resolves against the PAGE origin, which is the web app,
 * not the API. It 404s, the fallback initials take over, and the product looks like it ignored
 * the upload. That is the bug these cover.
 */

const API_ORIGIN = "https://api.example.test";

test("an uploaded avatar's relative path is moved onto the API origin", () => {
  process.env.NEXT_PUBLIC_API_URL = `${API_ORIGIN}/api/v1`;

  assert.equal(
    resolveAvatarUrl("/api/v1/auth/profile/avatar/019f0d00.jpg"),
    `${API_ORIGIN}/api/v1/auth/profile/avatar/019f0d00.jpg`,
  );
});

test("a path with no leading slash still lands on the origin, not glued to it", () => {
  process.env.NEXT_PUBLIC_API_URL = `${API_ORIGIN}/api/v1`;

  assert.equal(resolveAvatarUrl("avatars/x.png"), `${API_ORIGIN}/avatars/x.png`);
});

test("a Google-hosted picture is left exactly as it is", () => {
  // These worked all along, by accident, which is why the bug looked like "only some people have
  // avatars" rather than "the resolution is missing".
  process.env.NEXT_PUBLIC_API_URL = `${API_ORIGIN}/api/v1`;
  const google = "https://lh3.googleusercontent.com/a/ACg8ocImvOKpgdV2=s96-c";

  assert.equal(resolveAvatarUrl(google), google);
});

test("a protocol-relative URL and a data URI are left alone too", () => {
  process.env.NEXT_PUBLIC_API_URL = `${API_ORIGIN}/api/v1`;

  assert.equal(resolveAvatarUrl("//cdn.example.test/a.png"), "//cdn.example.test/a.png");
  assert.equal(resolveAvatarUrl("data:image/svg+xml;utf8,<svg/>"), "data:image/svg+xml;utf8,<svg/>");
});

test("nothing in means nothing out — never an empty src", () => {
  // An <img src=""> resolves against the page URL and logs a failed request on every render,
  // behind a broken-image icon. Undefined lets the caller render no image at all.
  process.env.NEXT_PUBLIC_API_URL = `${API_ORIGIN}/api/v1`;

  assert.equal(resolveAvatarUrl(undefined), undefined);
  assert.equal(resolveAvatarUrl(null), undefined);
  assert.equal(resolveAvatarUrl(""), undefined);
  assert.equal(resolveAvatarUrl("   "), undefined);
});

test("a same-origin API configuration produces a same-origin path", () => {
  // A relative NEXT_PUBLIC_API_URL means the API is served from the app's own origin. Prefixing
  // anything there would be wrong.
  process.env.NEXT_PUBLIC_API_URL = "/api/v1";

  assert.equal(
    resolveAvatarUrl("/api/v1/auth/profile/avatar/x.jpg"),
    "/api/v1/auth/profile/avatar/x.jpg",
  );
});
