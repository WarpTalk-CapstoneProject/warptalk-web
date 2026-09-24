// The admin CMS (Announcements, Email templates): real data, reachable, and actually shown.
//
// Three failures this guards, each of which this codebase has shipped before in some form:
//
//  1. A CMS page over a hardcoded array. The email templates page used to render a const catalog
//     (src/lib/admin/email-catalog.ts) that described the emails rather than managing them. Both
//     screens now read the notification service through hooks; neither may import a literal list
//     back in.
//
//  2. An editor whose edits nobody reads. Proving the SEND path reads the stored template is the
//     backend's job (EmailTemplateSendPathTests and the sender tests in auth, workspace and
//     translation-room). What the web can hold is its half: the editor saves through the
//     endpoint those senders' store is written by, with the optimistic version check, and the
//     preview is rendered by the server rather than drawn a second time here.
//
//  3. Published announcements that no user can see. The app shell must mount the banner, the
//     banner must read the viewer endpoint and dismiss through it, and the admin preview must use
//     the same card component the banner opens — otherwise "preview as users will see it" is a
//     second drawing that can drift.
//
// Source-level on purpose, like the other admin contracts: every one of these is wiring, and types
// check with any of them deleted.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(root, rel), "utf8");
const readJson = async (rel) => JSON.parse(await read(rel));

const ADMIN = "src/app/(app)/admin";
const checks = [];
const check = (label, passed) => checks.push([label, Boolean(passed)]);

const endpoints = await read("src/lib/api/endpoints.ts");
const templatesPage = await read(`${ADMIN}/email-templates/page.tsx`);
const templateEditor = await read(`${ADMIN}/email-templates/[templateKey]/page.tsx`);
const announcementsPage = await read(`${ADMIN}/announcements/page.tsx`);
const announcementEditor = await read(`${ADMIN}/announcements/posts/[postId]/page.tsx`);
const templateService = await read("src/services/admin-email-template.service.ts");
const cmsService = await read("src/services/admin-announcement-cms.service.ts");
const viewerService = await read("src/services/announcement.service.ts");
const layout = await read("src/app/(app)/layout.tsx");
const banner = await read("src/components/announcements/announcement-banner.tsx");
const previewDialog = await read("src/components/admin/cms/announcement-preview-dialog.tsx");
const previewFrame = await read("src/components/admin/cms/email-template-preview-dialog.tsx");
const i18nRequest = await read("src/i18n/request.ts");

// ── 1 · Real data, never a literal list ──────────────────────────────────────
check(
  "the email templates page reads the notification service, not a const catalog",
  /useAdminEmailTemplates\(\)/.test(templatesPage) && !/EMAIL_CATALOG|email-catalog/.test(templatesPage),
);
check(
  "the announcements page reads the CMS list endpoint",
  /useAdminAnnouncementCmsList\(/.test(announcementsPage),
);
check(
  "the email templates list is under the gateway route the portal already has",
  /adminEmailTemplates:\s*\{[\s\S]{0,200}?base:\s*"\/admin\/notifications\/email-templates"/.test(endpoints),
);
check(
  "the announcements CMS is under the gateway route the portal already has",
  /adminAnnouncementCms:\s*\{[\s\S]{0,200}?base:\s*"\/admin\/notifications\/announcements"/.test(endpoints),
);
check(
  "the viewer feed is under the user-facing notification route",
  /announcements:\s*\{[\s\S]{0,120}?active:\s*"\/notifications\/announcements"/.test(endpoints),
);
check("the template service reads every endpoint through API.adminEmailTemplates", !/["'`]\/admin\//.test(templateService));
check("the CMS service reads every endpoint through API.adminAnnouncementCms", !/["'`]\/admin\//.test(cmsService));
check("the viewer service reads every endpoint through API.announcements", !/["'`]\/notifications/.test(viewerService));

// ── 2 · The editor saves what the senders read ───────────────────────────────
check(
  "saving a template PUTs to the template's own endpoint",
  /save:[\s\S]{0,200}?apiClient\.put<[^>]+>\(API\.adminEmailTemplates\.detail\(key\)/.test(templateService),
);
check(
  "a save carries the version it was edited from, so a newer save is not overwritten",
  /expectedVersion:\s*template\.version/.test(templateEditor),
);
check(
  "the editor's preview is rendered by the server, not redrawn here",
  /useEmailTemplatePreview\(/.test(templateEditor) && /preview:[\s\S]{0,200}?API\.adminEmailTemplates\.preview/.test(templateService),
);
check(
  "an admin-authored email is previewed in a frame with no scripts or same-origin access",
  /<iframe[\s\S]{0,120}?sandbox=""/.test(previewFrame),
);
check(
  "every template card offers edit, preview, send test and reset",
  ["actions.edit", "actions.preview", "actions.sendTest", "actions.reset"].every((key) => templatesPage.includes(`t("${key}")`)),
);
check(
  "the read-only notice from the old catalog page is gone",
  !/notEditableNotice/.test(templatesPage),
);
check(
  "the email cards show which provider sends each email (Resend or SMTP)",
  /template\.provider/.test(templatesPage),
);

// ── 3 · Published announcements are shown ────────────────────────────────────
check("the app shell mounts the announcement banner", /<AnnouncementBanner\b/.test(layout));
check(
  "the banner reads the viewer feed and dismisses through the server",
  /useActiveAnnouncements\(/.test(banner) && /useDismissAnnouncement\(/.test(banner),
);
check(
  "the admin preview uses the same card component the banner opens",
  /AnnouncementCardView/.test(previewDialog) && /AnnouncementCardView/.test(banner),
);
check(
  "the announcement editor previews as users will see it",
  /AnnouncementUserPreview/.test(announcementEditor),
);
check(
  "publish now and schedule both go through the publish endpoint",
  /publish:\s*\(id: string\)\s*=>\s*`\/admin\/notifications\/announcements\/\$\{encodeURIComponent\(id\)\}\/publish`/.test(endpoints) &&
    /request:\s*\{\s*startsAt:\s*scheduledStart\s*\}/.test(announcementEditor),
);

// ── 4 · Every string in every locale ─────────────────────────────────────────
check("the adminCms namespace is loaded", /"adminCms"/.test(i18nRequest));

function leafKeys(tree, prefix = "") {
  return Object.entries(tree).flatMap(([key, value]) =>
    value && typeof value === "object" ? leafKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

const en = await readJson("messages/en/adminCms.json");
const enKeys = new Set(leafKeys(en));
for (const locale of ["vi", "ja"]) {
  const other = new Set(leafKeys(await readJson(`messages/${locale}/adminCms.json`)));
  const missing = [...enKeys].filter((key) => !other.has(key));
  check(
    missing.length ? `${locale} adminCms has every key — missing ${missing.slice(0, 5).join(", ")}` : `${locale} adminCms has every key`,
    missing.length === 0,
  );
}
for (const locale of ["en", "vi", "ja"]) {
  const common = await readJson(`messages/${locale}/common.json`);
  check(`${locale} common.announcements carries the banner strings`, common.announcements?.readMore && common.announcements?.types?.FEATURE);
}

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

const failures = checks.filter(([, passed]) => !passed);
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exitCode = 1;
}
