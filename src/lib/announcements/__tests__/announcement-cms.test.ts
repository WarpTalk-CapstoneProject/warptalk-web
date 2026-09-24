import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  availableActions,
  draftFrom,
  emptyDraft,
  isAllowedLink,
  sameDraft,
  toLocalInput,
  toRequest,
  toUtcIso,
  validateDraft,
  type AnnouncementDraft,
} from "../announcement-cms.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function valid(overrides: Partial<AnnouncementDraft> = {}): AnnouncementDraft {
  return { ...emptyDraft(), title: "Live captions", bodyMarkdown: "**New**", ...overrides };
}

test("a minimal draft is valid and becomes exactly the server's request shape", () => {
  const draft = valid();
  assert.equal(validateDraft(draft), null);
  assert.deepEqual(Object.keys(toRequest(draft)).sort(), [
    "audienceMode",
    "audiencePlanSlugs",
    "audienceWorkspaceIds",
    "bodyMarkdown",
    "ctaLabel",
    "ctaUrl",
    "endsAt",
    "startsAt",
    "title",
    "type",
  ]);
});

test("the request carries only the audience list its mode reads", () => {
  const draft = valid({ audienceMode: "PLANS", planSlugs: [" Pro ", "pro", "team"], workspaceIds: ["w1"] });
  const request = toRequest(draft);
  assert.deepEqual(request.audiencePlanSlugs, ["pro", "team"]);
  assert.deepEqual(request.audienceWorkspaceIds, []);
  assert.deepEqual(toRequest(valid({ planSlugs: ["pro"] })).audiencePlanSlugs, []);
});

test("targeted audiences need at least one target", () => {
  assert.equal(validateDraft(valid({ audienceMode: "PLANS" })), "plansRequired");
  assert.equal(validateDraft(valid({ audienceMode: "WORKSPACES" })), "workspacesRequired");
  assert.equal(validateDraft(valid({ audienceMode: "WORKSPACES", workspaceIds: ["w1"] })), null);
});

test("a button needs both a label and a safe link", () => {
  assert.equal(validateDraft(valid({ ctaLabel: "Try it" })), "labelWithoutLink");
  assert.equal(validateDraft(valid({ ctaUrl: "/settings" })), "linkWithoutLabel");
  assert.equal(validateDraft(valid({ ctaLabel: "Go", ctaUrl: "//evil.test" })), "linkInvalid");
  assert.equal(validateDraft(valid({ ctaLabel: "Go", ctaUrl: "javascript:alert(1)" })), "linkInvalid");
  assert.equal(validateDraft(valid({ ctaLabel: "Go", ctaUrl: "https://warptalk.vn/blog" })), null);
});

test("links mirror AnnouncementRules.IsAllowedLink", () => {
  assert.equal(isAllowedLink("/settings"), true);
  assert.equal(isAllowedLink("https://warptalk.vn"), true);
  assert.equal(isAllowedLink("//evil.test"), false);
  assert.equal(isAllowedLink("ftp://x.test"), false);
  assert.equal(isAllowedLink("/has space"), false);
});

test("the window must end after it starts", () => {
  assert.equal(validateDraft(valid({ startsAt: "2026-10-01T10:00", endsAt: "2026-10-01T09:00" })), "windowInverted");
  assert.equal(validateDraft(valid({ startsAt: "2026-10-01T10:00", endsAt: "2026-10-02T10:00" })), null);
});

test("dates round-trip between the input and the instant", () => {
  const iso = toUtcIso("2026-10-01T10:30");
  assert.ok(iso?.endsWith("Z"));
  assert.equal(toLocalInput(iso), "2026-10-01T10:30");
  assert.equal(toUtcIso(""), null);
  assert.equal(toLocalInput(null), "");
});

test("an announcement read back into the editor is not dirty", () => {
  const dto = {
    ...toRequest(valid({ audienceMode: "PLANS", planSlugs: ["pro"], ctaLabel: "Go", ctaUrl: "/x" })),
  };
  assert.equal(sameDraft(draftFrom(dto), valid({ audienceMode: "PLANS", planSlugs: ["pro"], ctaLabel: "Go", ctaUrl: "/x" })), true);
});

test("actions follow the server's lifecycle", () => {
  assert.ok(availableActions("DRAFT").includes("delete"));
  assert.ok(!availableActions("PUBLISHED").includes("delete"));
  assert.ok(!availableActions("PUBLISHED").includes("publishNow"));
  assert.deepEqual(availableActions("ARCHIVED"), ["restore", "duplicate"]);
  assert.ok(availableActions("SCHEDULED").includes("publishNow"));
});

test("the user-facing banner is mounted in the app shell and reads the viewer endpoint", () => {
  const layout = read("../../../app/(app)/layout.tsx");
  assert.match(layout, /<AnnouncementBanner\b/);
  const banner = read("../../../components/announcements/announcement-banner.tsx");
  assert.match(banner, /useActiveAnnouncements\(/);
  assert.match(banner, /useDismissAnnouncement\(/);
});
