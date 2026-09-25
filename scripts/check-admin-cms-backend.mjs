#!/usr/bin/env node
// The admin CMS against the backend it talks to. Replaces check-admin-email-catalog.mjs, which
// checked a hardcoded web-side list of emails that no longer exists: the list now comes from the
// backend's EmailTemplateCatalog, so what has to hold is (1) every route the web calls is served,
// and (2) every sender composes through the catalog, which is what makes an edit reach an inbox.
//
// Needs WARPTALK_BACKEND_ROOT (CI checks out backend development next to this repo).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const backend = process.env.WARPTALK_BACKEND_ROOT;
if (!backend || !existsSync(backend)) {
  console.error("FAIL WARPTALK_BACKEND_ROOT must point at a warptalk-backend checkout.");
  process.exit(1);
}
const read = (rel) => readFileSync(path.join(backend, rel), "utf8");
const checks = [];
const check = (label, passed) => checks.push([label, Boolean(passed)]);

const api = "notification/src/WarpTalk.NotificationService.API/Controllers";
check(
  "email templates are served at api/v1/admin/notifications/email-templates",
  read(`${api}/AdminEmailTemplatesController.cs`).includes('[Route("api/v1/admin/notifications/email-templates")]'),
);
check(
  "the announcements CMS is served at api/v1/admin/notifications/announcements",
  read(`${api}/AdminAnnouncementsController.cs`).includes('[Route("api/v1/admin/notifications/announcements")]'),
);
check(
  "the viewer feed is served at api/v1/notifications/announcements",
  read(`${api}/AnnouncementsController.cs`).includes('[Route("api/v1/notifications/announcements")]'),
);

check(
  "email layouts and blocks are served at api/v1/admin/notifications/email-blocks",
  read(`${api}/AdminEmailBlocksController.cs`).includes('[Route("api/v1/admin/notifications/email-blocks")]'),
);
check(
  "the viewer feed records impressions, dismissals and clicks",
  /HttpPost\("\{id:guid\}\/events"\)/.test(read(`${api}/AnnouncementsController.cs`)),
);
for (const controller of ["AdminEmailTemplatesController", "AdminEmailBlocksController", "AdminAnnouncementsController"]) {
  check(`${controller} writes are audited`, /\[AdminAudited\(/.test(read(`${api}/${controller}.cs`)));
}

const senders = {
  "auth (Resend)": ["auth/src/WarpTalk.AuthService.Infrastructure/Services/ResendAuthEmailSender.cs", ["AuthVerifyEmail", "AuthPasswordReset"]],
  "workspace (Resend)": ["workspace/src/WarpTalk.WorkspaceService.Infrastructure/Adapters/WorkspaceInvitationEmailComposer.cs", ["WorkspaceInvitation", "WorkspaceJoinRequestApproved"]],
  "translation-room (SMTP)": ["shared/WarpTalk.Shared/Services/SmtpEmailService.cs", ["MeetingInvitation", "MeetingReminder"]],
  "notification (Resend)": ["notification/src/WarpTalk.NotificationService.Application/Services/NotificationService.cs", ["NotificationEmailCopy"]],
};
for (const [name, [file, keys]] of Object.entries(senders)) {
  const source = read(file);
  check(
    `${name} composes through IEmailTemplateComposer with ${keys.join(", ")}`,
    /ComposeAsync\(/.test(source) && keys.every((key) => source.includes(`EmailTemplateCatalog.${key}`)),
  );
}
// Delivery counters (the Analytics tab) are only real if both provider paths report to them.
for (const [name, file] of [
  ["auth (Resend)", "auth/src/WarpTalk.AuthService.Infrastructure/Services/ResendAuthEmailSender.cs"],
  ["workspace (Resend)", "workspace/src/WarpTalk.WorkspaceService.Infrastructure/Adapters/WorkspaceInvitationEmailComposer.cs"],
  ["translation-room (SMTP)", "shared/WarpTalk.Shared/Services/SmtpEmailService.cs"],
]) {
  check(`${name} records each delivery`, /IEmailDeliveryRecorder/.test(read(file)));
}

for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
