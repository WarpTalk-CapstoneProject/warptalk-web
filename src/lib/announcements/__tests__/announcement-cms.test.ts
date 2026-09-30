import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  assetUrl,
  availableActions,
  bulkActionsFor,
  draftFrom,
  iconFor,
  imageMarkdown,
  isAllowedImage,
  surfaceClasses,
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
    "dismissible",
    "endsAt",
    "frequency",
    "icon",
    "imageUrl",
    "newUsersWithinDays",
    "placement",
    "priority",
    "secondaryCtaLabel",
    "secondaryCtaUrl",
    "startsAt",
    "targetLocales",
    "targetRoles",
    "title",
    "type",
    "variant",
    "accentColor",
    "emailTemplateKey",
  ].sort());
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

test("a secondary button needs the primary one, and both halves of itself", () => {
  assert.equal(validateDraft(valid({ secondaryCtaLabel: "Later", secondaryCtaUrl: "/x" })), "secondaryNeedsPrimary");
  const withPrimary = { ctaLabel: "Go", ctaUrl: "/go" };
  assert.equal(validateDraft(valid({ ...withPrimary, secondaryCtaLabel: "Later" })), "secondaryIncomplete");
  assert.equal(validateDraft(valid({ ...withPrimary, secondaryCtaLabel: "Later", secondaryCtaUrl: "javascript:x" })), "secondaryLinkInvalid");
  assert.equal(validateDraft(valid({ ...withPrimary, secondaryCtaLabel: "Later", secondaryCtaUrl: "/later" })), null);
});

test("images are an uploaded asset or an https URL", () => {
  assert.equal(isAllowedImage("/api/v1/notifications/announcements/assets/0f3c2a1e-aaaa-4bbb-8ccc-1234567890ab"), true);
  assert.equal(isAllowedImage("/api/v1/notifications/announcements/assets/../../x"), false);
  assert.equal(isAllowedImage("https://cdn.warptalk.vn/a.png"), true);
  assert.equal(isAllowedImage("http://cdn.warptalk.vn/a.png"), false);
  assert.equal(validateDraft(valid({ imageUrl: "ftp://x" })), "imageInvalid");
});

test("priority and the new-user window stay in range", () => {
  assert.equal(validateDraft(valid({ priority: 101 })), "priorityOutOfRange");
  assert.equal(validateDraft(valid({ newUsersWithinDays: "0" })), "newUsersOutOfRange");
  assert.equal(validateDraft(valid({ newUsersWithinDays: "abc" })), "newUsersOutOfRange");
  assert.equal(toRequest(valid({ newUsersWithinDays: "14" })).newUsersWithinDays, 14);
  assert.equal(toRequest(valid()).newUsersWithinDays, null);
});

test("targeting survives a round trip through the server shape", () => {
  const draft = valid({ targetRoles: ["Owner", "Owner", "Admin"], targetLocales: ["vi"], placement: "MODAL", icon: "rocket" });
  const request = toRequest(draft);
  assert.deepEqual(request.targetRoles, ["Owner", "Admin"]);
  assert.equal(sameDraft(draftFrom({ ...request }), { ...draft, targetRoles: ["Owner", "Admin"] }), true);
});

test("bulk offers only what at least one selected item's lifecycle allows", () => {
  assert.deepEqual(bulkActionsFor([]), []);
  assert.deepEqual(bulkActionsFor(["PUBLISHED"]), ["duplicate", "archive"]);
  assert.deepEqual(bulkActionsFor(["DRAFT", "ARCHIVED"]), ["publish", "duplicate", "archive", "delete"]);
});

test("design helpers: a type's default icon, a variant's surface, an uploaded image's URL", () => {
  assert.equal(iconFor("MAINTENANCE", null), "wrench");
  assert.equal(iconFor("MAINTENANCE", "rocket"), "rocket");
  assert.equal(iconFor("FEATURE", "not-an-icon"), "sparkle");
  assert.match(surfaceClasses("SOLID", "RED"), /bg-red-600/);
  assert.match(surfaceClasses("OUTLINE", "BLUE"), /border-sky-500/);
  const path = "/api/v1/notifications/announcements/assets/0f3c2a1e-aaaa-4bbb-8ccc-1234567890ab";
  assert.equal(assetUrl(path, "https://app.warptalk.vn/api/v1"), `https://app.warptalk.vn${path}`);
  assert.equal(assetUrl("https://cdn.x/a.png", "https://app.warptalk.vn/api/v1"), "https://cdn.x/a.png");
  assert.equal(imageMarkdown("/a.png", "A [b] c"), "![A b c](/a.png)");
});

test("the user side mounts a surface for every placement and reads the viewer endpoint", () => {
  const layout = read("../../../app/(app)/layout.tsx");
  assert.match(layout, /<AnnouncementHost\b/);
  const host = read("../../../components/announcements/announcement-host.tsx");
  assert.match(host, /useActiveAnnouncements\(/);
  for (const surface of ["TopBannerSurface", "ModalSurface", "ToastSurface"]) assert.match(host, new RegExp(`<${surface}\\b`));
  const panel = read("../../../components/notifications/notification-popover.tsx");
  assert.match(panel, /<NotificationCenterAnnouncements\b/);
  const home = read("../../../app/(app)/[workspaceSlug]/home/page.tsx");
  assert.match(home, /<DashboardAnnouncements\b/);
});
