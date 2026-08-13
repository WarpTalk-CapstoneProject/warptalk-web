// Every file the application downloads passes through normalizeResponseRoles, and it used to
// arrive as `{}`.
//
// The interceptor rebuilt every object it met, field by field, into a fresh literal. A Blob is
// `typeof "object"` and is not an array, so it went down that path — and `Object.keys(blob)` is
// empty, because .text(), .arrayBuffer(), .size and .type all live on the prototype. Opening a
// text document called `.text()` on the result and the page died with "x.text is not a
// function"; artifact, transcript and file downloads got the same `{}` and died at
// URL.createObjectURL instead.
//
// Roles still have to be lowercased — that is what this function is for — so the tests below
// pin both halves: rewrite the fields it owns, and return everything else exactly as it came.

import assert from "node:assert/strict";
import test from "node:test";

import { isPlainObject, normalizeResponseRoles } from "../normalize-response.ts";

test("a Blob survives with its methods intact", () => {
  const blob = new Blob(["# WarpTalk"], { type: "text/markdown" });

  const result = normalizeResponseRoles(blob);

  assert.equal(result, blob, "the very same Blob must come back, not a copy of its fields");
  assert.equal(typeof (result as Blob).text, "function");
  assert.equal((result as Blob).type, "text/markdown");
});

test("a Blob nested inside a body is not flattened either", () => {
  const blob = new Blob(["x"]);

  const result = normalizeResponseRoles({ file: blob, role: "OWNER" }) as Record<string, unknown>;

  assert.equal(result.file, blob);
  assert.equal(result.role, "owner");
});

test("other prototype-bearing objects are returned untouched", () => {
  const date = new Date("2026-08-13T00:00:00.000Z");
  const map = new Map([["a", 1]]);
  const bytes = new ArrayBuffer(8);

  assert.equal(normalizeResponseRoles(date), date);
  assert.equal(normalizeResponseRoles(map), map);
  assert.equal(normalizeResponseRoles(bytes), bytes);
});

test("roles are lowercased wherever they appear", () => {
  const result = normalizeResponseRoles({
    role: "Owner",
    member: { roleName: "ADMIN", nested: { workspaceRole: "MeMbEr" } },
    list: [{ currentRole: "OWNER" }],
  }) as Record<string, unknown>;

  assert.equal(result.role, "owner");
  assert.equal((result.member as Record<string, unknown>).roleName, "admin");
  assert.equal(
    ((result.member as Record<string, unknown>).nested as Record<string, unknown>).workspaceRole,
    "member",
  );
  assert.equal((result.list as Record<string, unknown>[])[0].currentRole, "owner");
});

test("a non-string role is left alone rather than coerced", () => {
  // A numeric role id is not a name to lowercase, and calling .toLowerCase() on it would throw.
  const result = normalizeResponseRoles({ role: 3, roleName: null }) as Record<string, unknown>;

  assert.equal(result.role, 3);
  assert.equal(result.roleName, null);
});

test("primitives and null pass through", () => {
  assert.equal(normalizeResponseRoles(null), null);
  assert.equal(normalizeResponseRoles(undefined), undefined);
  assert.equal(normalizeResponseRoles("plain text body"), "plain text body");
  assert.equal(normalizeResponseRoles(42), 42);
});

test("isPlainObject separates literals from everything else", () => {
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject(Object.create(null)), true);
  assert.equal(isPlainObject(new Blob(["x"])), false);
  assert.equal(isPlainObject(new Date()), false);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject("string"), false);
});
