import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkspaceEntryPath,
  normalizeWorkspaceSlug,
  parseWorkspaceSlugInput,
} from "./workspace-slug.ts";

test("normalizes valid workspace slugs", () => {
  assert.equal(normalizeWorkspaceSlug("Acme-Team"), "acme-team");
  assert.equal(normalizeWorkspaceSlug("a"), "a");
});

test("rejects reserved, route-like, and URL-like workspace slugs", () => {
  assert.equal(normalizeWorkspaceSlug("workspace"), null);
  assert.equal(normalizeWorkspaceSlug("localhost"), null);
  assert.equal(normalizeWorkspaceSlug("localhost:3000"), null);
  assert.equal(normalizeWorkspaceSlug("/acme"), null);
  assert.equal(normalizeWorkspaceSlug("acme/team"), null);
});

test("builds workspace entry paths only for trusted slugs", () => {
  assert.equal(getWorkspaceEntryPath("acme"), "/acme/home");
  assert.equal(getWorkspaceEntryPath("localhost"), "/workspace");
  assert.equal(getWorkspaceEntryPath(null), "/workspace");
});

test("parses workspace slugs from plain slugs and URLs", () => {
  assert.equal(parseWorkspaceSlugInput("acme"), "acme");
  assert.equal(parseWorkspaceSlugInput("https://warptalk.app/workspace/acme"), "acme");
  assert.equal(parseWorkspaceSlugInput("warptalk.app/workspace/acme"), "acme");
  assert.equal(parseWorkspaceSlugInput("http://localhost:3000/workspace/acme"), "acme");
  assert.equal(parseWorkspaceSlugInput("localhost:3000/workspace/acme"), "acme");
});

test("does not parse localhost hostnames as workspace slugs", () => {
  assert.equal(parseWorkspaceSlugInput("localhost"), null);
  assert.equal(parseWorkspaceSlugInput("localhost:3000"), null);
  assert.equal(parseWorkspaceSlugInput("http://localhost:3000"), null);
  assert.equal(parseWorkspaceSlugInput("http://localhost:3000/localhost"), null);
  assert.equal(parseWorkspaceSlugInput("localhost:3000/localhost"), null);
});
