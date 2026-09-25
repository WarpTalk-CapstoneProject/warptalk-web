// The admin CMS (Announcements, Email templates) v2: real data, reachable, audited, and actually
// shown to the people it is for.
//
// Failures this guards, each of which this codebase has shipped before in some form:
//
//  1. A CMS page over a hardcoded array. Both screens read the notification service through
//     hooks; neither may import a literal list back in.
//
//  2. An editor whose edits nobody reads — or, worse, whose unpublished edits everybody reads.
//     Content and templates are managed separately (emails vs layouts/blocks), each with a draft
//     side and a published side. Saving goes to the draft endpoint with the optimistic check;
//     only Publish moves anything to what senders read. The preview is rendered by the server,
//     in a sandboxed frame.
//
//  3. Published announcements that no user can see. Every placement the editor offers must have a
//     surface mounted somewhere the user goes: the shell (banner, modal, toast), the bell panel
//     (notification centre) and the workspace home (dashboard card). The admin preview must draw
//     them with the same components.
//
//  4. A write the audit log never hears about. The History tabs read the platform audit log for
//     the item; the writes themselves are recorded by [AdminAudited] on the notification service
//     (checked on the backend side by CmsAdminAuditContractTests).
//
//  5. A list screen that only half-exists: every list needs search, filter chips, sort, a
//     card/table toggle and bulk actions; every detail page needs its tabs and a sticky action
//     bar with Cmd/Ctrl+S, and every destructive action goes through a confirmation.
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
const emailsPage = await read(`${ADMIN}/email-templates/page.tsx`);
const emailEditor = await read(`${ADMIN}/email-templates/[templateKey]/page.tsx`);
const blockEditor = await read(`${ADMIN}/email-templates/blocks/[blockId]/page.tsx`);
const announcementsPage = await read(`${ADMIN}/announcements/page.tsx`);
const announcementEditor = await read(`${ADMIN}/announcements/posts/[postId]/page.tsx`);
const templateService = await read("src/services/admin-email-template.service.ts");
const blockService = await read("src/services/admin-email-block.service.ts");
const cmsService = await read("src/services/admin-announcement-cms.service.ts");
const viewerService = await read("src/services/announcement.service.ts");
const auditService = await read("src/services/cms-audit.service.ts");
const viewerHook = await read("src/hooks/use-announcements.ts");
const layout = await read("src/app/(app)/layout.tsx");
const host = await read("src/components/announcements/announcement-host.tsx");
const feeds = await read("src/components/announcements/announcement-feeds.tsx");
const surfaces = await read("src/components/announcements/announcement-surfaces.tsx");
const bell = await read("src/components/notifications/notification-popover.tsx");
const home = await read("src/app/(app)/[workspaceSlug]/home/page.tsx");
const adminPreview = await read("src/components/admin/cms/announcement-preview.tsx");
const emailFrame = await read("src/components/admin/cms/email-preview-frame.tsx");
const editorChrome = await read("src/components/admin/cms/cms-editor.tsx");
const listChrome = await read("src/components/admin/cms/cms-list.tsx");
const history = await read("src/components/admin/cms/cms-history.tsx");
const markdownEditor = await read("src/components/admin/cms/markdown-editor.tsx");
const cmsLib = await read("src/lib/announcements/announcement-cms.ts");
const i18nRequest = await read("src/i18n/request.ts");

// ── 1 · Real data, never a literal list ──────────────────────────────────────
check("the email list reads the notification service, not a const catalog", /useAdminEmailTemplates\(\)/.test(emailsPage) && !/EMAIL_CATALOG|email-catalog/.test(emailsPage));
check("layouts and blocks are read from their own endpoint", /useEmailBlocks\("LAYOUT"\)/.test(emailsPage) && /useEmailBlocks\("PARTIAL"\)/.test(emailsPage));
check("the announcements page reads the CMS list endpoint", /useAdminAnnouncementCmsList\(/.test(announcementsPage));
check("email content is under the gateway route the portal already has", /adminEmailTemplates:\s*\{[\s\S]{0,200}?base:\s*"\/admin\/notifications\/email-templates"/.test(endpoints));
check("layouts and blocks are under the same gateway route", /adminEmailBlocks:\s*\{[\s\S]{0,120}?base:\s*"\/admin\/notifications\/email-blocks"/.test(endpoints));
check("the announcements CMS is under the gateway route the portal already has", /adminAnnouncementCms:\s*\{[\s\S]{0,200}?base:\s*"\/admin\/notifications\/announcements"/.test(endpoints));
check("the viewer feed is under the user-facing notification route", /announcements:\s*\{[\s\S]{0,120}?active:\s*"\/notifications\/announcements"/.test(endpoints));
for (const [name, source] of [["template", templateService], ["block", blockService], ["announcement CMS", cmsService]]) {
  check(`the ${name} service reads every endpoint through API.*`, !/["'`]\/admin\//.test(source));
}
check("the viewer service reads every endpoint through API.announcements", !/["'`]\/notifications/.test(viewerService));

// ── 2 · Drafts are drafts; only Publish reaches the senders ──────────────────
check("saving an email writes the locale's DRAFT endpoint", /saveDraft:[\s\S]{0,240}?API\.adminEmailTemplates\.locale\(key, locale, "draft"\)/.test(templateService));
check("publishing an email is its own endpoint", /publish:[\s\S]{0,240}?API\.adminEmailTemplates\.locale\(key, locale, "publish"\)/.test(templateService));
check("a save carries the draft it was edited from, so a newer save is not overwritten", /expectedDraftUpdatedAt:\s*variant\?\.draftUpdatedAt/.test(emailEditor));
check("a publish carries the version it was based on", /expectedPublishedVersion:\s*variant\?\.publishedVersion/.test(emailEditor));
check("a block save carries the draft it was edited from", /expectedDraftUpdatedAt:\s*block\.draftUpdatedAt/.test(blockEditor));
check("the email preview is rendered by the server, not redrawn here", /useEmailTemplatePreview\(/.test(emailEditor) && /preview:[\s\S]{0,200}?API\.adminEmailTemplates\.preview/.test(templateService));
check("an admin-authored email is previewed in a frame with no scripts or same-origin access", /<iframe[\s\S]{0,160}?sandbox=""/.test(emailFrame));
check("the email preview offers desktop/mobile and light/dark", /"desktop"[\s\S]*"mobile"/.test(emailFrame) && /dark/.test(emailFrame));
check("the email editor is per locale (en, vi, ja)", /EMAIL_LOCALES\.map/.test(emailEditor) && /sentVersionFor\(/.test(emailEditor));
check("an email can pick a layout and include blocks", /LayoutTab/.test(emailEditor) && /blockInclude\(/.test(emailEditor));
check("an email has named sample-data sets", /useSaveSampleSet\(/.test(emailEditor) && /useDeleteSampleSet\(/.test(emailEditor));
check("an email can be sent as a test to any addresses", /SendTestEmailDialog/.test(emailEditor) && /SendTestEmailDialog/.test(emailsPage));
check("delivery counters are shown per email", /useEmailTemplateStats\(/.test(emailEditor) && /last30Days/.test(emailsPage));

// ── 3 · Every placement offered is rendered for users ────────────────────────
const placements = [...cmsLib.matchAll(/PLACEMENTS = \[([^\]]+)\]/g)][0]?.[1] ?? "";
for (const placement of ["TOP_BANNER", "MODAL", "TOAST", "NOTIFICATION_CENTER", "DASHBOARD_CARD"]) {
  check(`the editor offers ${placement}`, placements.includes(`"${placement}"`));
}
check("the app shell mounts the announcement host", /<AnnouncementHost\b/.test(layout));
check("the host renders the banner, the modal and the toasts", /<TopBannerSurface\b/.test(host) && /<ModalSurface\b/.test(host) && /<ToastSurface\b/.test(host));
check("the bell panel renders notification-centre announcements", /<NotificationCenterAnnouncements\b/.test(bell) && /<NotificationCardSurface\b/.test(feeds));
check("the workspace home renders dashboard-card announcements", /<DashboardAnnouncements\b/.test(home) && /<DashboardCardSurface\b/.test(feeds));
check("every surface reads the viewer feed", /useActiveAnnouncements\(/.test(host) && /useActiveAnnouncements\(/.test(feeds));
check("the feed sends the viewer's locale and a per-tab session id", /announcementService\.active\(locale, currentSessionId\(\)\)/.test(viewerHook));
check("impressions, dismissals and clicks are reported", ["IMPRESSION", "DISMISS", "CTA_CLICK", "SECONDARY_CLICK"].every((type) => viewerHook.includes(`"${type}"`)));
check("the admin preview draws the same components users see", ["TopBannerSurface", "ModalSurface", "ToastSurface", "NotificationCardSurface", "DashboardCardSurface"].every((name) => adminPreview.includes(`<${name}`)));
check("announcement images load only if uploaded or https", /isAllowedImage\(/.test(surfaces));
check("the markdown editor uploads images to the asset store", /useUploadAnnouncementAsset\(/.test(markdownEditor));

// ── 4 · History reads the audit log ──────────────────────────────────────────
check("History tabs read the platform audit log by entity", /API\.adminAuditLog\.base/.test(auditService) && /entityId/.test(auditService));
check("every detail page has an audit History", [emailEditor, blockEditor, announcementEditor].every((source) => /<AuditHistory\b/.test(source)));
check("email and block history offers diff and restore", /<VersionHistory\b/.test(emailEditor) && /<VersionHistory\b/.test(blockEditor) && /<DiffView\b/.test(history));

// ── 5 · Full list and editor UI ──────────────────────────────────────────────
for (const [name, source] of [["emails", emailsPage], ["announcements", announcementsPage]]) {
  for (const part of ["CmsSearchInput", "CmsSortSelect", "CmsViewToggle", "CmsBulkBar", "CmsEmptyState", "FilterChip"]) {
    check(`the ${name} list has ${part}`, source.includes(`<${part}`));
  }
}
for (const [name, source] of [["email", emailEditor], ["block", blockEditor], ["announcement", announcementEditor]]) {
  check(`the ${name} editor has tabs, a sticky action bar and keyboard save`, /<CmsTabBar\b/.test(source) && /<CmsActionBar\b/.test(source) && /useSaveShortcut\(/.test(source));
  check(`the ${name} editor confirms before acting`, /useConfirm\(\)/.test(source));
}
for (const tab of ["content", "design", "audience", "schedule", "preview", "history", "analytics"]) {
  check(`the announcement editor has a ${tab} tab`, announcementEditor.includes(`"${tab}"`));
}
check("the save shortcut is Cmd/Ctrl+S", /metaKey \|\| event\.ctrlKey/.test(editorChrome) && /=== "s"/.test(editorChrome));
check("the list remembers card or table view", /localStorage/.test(listChrome));

// ── 6 · Every string in every locale ─────────────────────────────────────────
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
  const a = common.announcements ?? {};
  check(`${locale} common.announcements carries the viewer strings`, a.readMore && a.close && a.badge && a.dismiss && a.types?.FEATURE);
}

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

const failures = checks.filter(([, passed]) => !passed);
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exitCode = 1;
}
