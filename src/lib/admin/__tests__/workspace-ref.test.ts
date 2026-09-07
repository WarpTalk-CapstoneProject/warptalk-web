import test from "node:test";
import assert from "node:assert/strict";

import { workspaceRefKind } from "../workspace-ref.ts";

test("a workspace UUID is recognised as the id kind", () => {
  // The one from the WT-560 report.
  assert.equal(workspaceRefKind("5b6d35d3-c47c-4f48-93f8-2b5476bd4b8a"), "id");
});

test("uppercase and padded ids are still ids", () => {
  // A URL survives being retyped or title-cased before anyone clicks it.
  assert.equal(workspaceRefKind("5B6D35D3-C47C-4F48-93F8-2B5476BD4B8A"), "id");
  assert.equal(workspaceRefKind(" 5b6d35d3-c47c-4f48-93f8-2b5476bd4b8a "), "id");
});

test("a slug is a slug, including ones that look technical", () => {
  for (const slug of [
    "warptalk-demo-sep490",
    "acme-localization",
    "demo",
    "demo-2",
    // Hex-ish and dash-heavy, but not the 8-4-4-4-12 shape.
    "5b6d35d3-c47c-4f48-93f8",
    "5b6d35d3c47c4f4893f82b5476bd4b8a",
  ]) {
    assert.equal(workspaceRefKind(slug), "slug", `${slug} must be treated as a slug`);
  }
});

test("a missing ref is not an id", () => {
  // Falling through to the slug branch means one disabled query, not a request for `undefined`.
  assert.equal(workspaceRefKind(undefined), "slug");
  assert.equal(workspaceRefKind(""), "slug");
});
