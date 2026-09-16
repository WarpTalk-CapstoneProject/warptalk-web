/**
 * Every email the platform can send, and where each one's words actually live.
 *
 * READ-ONLY ON PURPOSE. The notification service has a `notification_templates` table, an entity
 * and a repository for it — and nothing reads that table. No sender queries it, no row is seeded,
 * and every email below is composed in code at send time. An editor over that table would save
 * successfully and change no email anyone receives: a fix wired to nothing. So this catalog shows
 * the real sources instead, and changing an email is still a code change in the service that
 * sends it.
 *
 * Kept honest by `scripts/check-admin-email-catalog.mjs`, which looks up every `subjectLiteral`
 * in its `sourcePath` inside warptalk-backend, and re-checks the two "dormant" claims.
 */

export type EmailStatus = "live" | "dormant";
export type EmailProvider = "Resend" | "SMTP";

export type EmailCatalogEntry = {
  key: string;
  name: string;
  status: EmailStatus;
  /** Why an email is dormant. Only set when `status` is "dormant". */
  dormantReason?: string;
  service: string;
  provider: EmailProvider;
  /** The subject as a reader sees it, with the variable parts named in braces. */
  subject: string;
  trigger: string;
  /** Where the body comes from. */
  bodySource: string;
  /** The values substituted into the email at send time. */
  variables: string[];
  /** Path inside warptalk-backend. */
  sourcePath: string;
  /** The subject expression exactly as it appears in `sourcePath`. The drift check matches on it. */
  subjectLiteral: string;
};

export const EMAIL_CATALOG: readonly EmailCatalogEntry[] = [
  {
    key: "auth-verify-email",
    name: "Email verification",
    status: "live",
    service: "Auth service",
    provider: "Resend",
    subject: "Verify your WarpTalk email",
    trigger:
      "Account registration, a verification resend, and Google sign-in on an account whose email is not yet verified.",
    bodySource: "HTML composed inline in C#, inside the shared auth email layout.",
    variables: ["FullName", "VerifyUrl"],
    sourcePath: "auth/src/WarpTalk.AuthService.Infrastructure/Services/ResendAuthEmailSender.cs",
    subjectLiteral: `"Verify your WarpTalk email"`,
  },
  {
    key: "auth-password-reset",
    name: "Password reset",
    status: "live",
    service: "Auth service",
    provider: "Resend",
    subject: "Reset your WarpTalk password",
    trigger: "Forgot password.",
    bodySource: "HTML composed inline in C#, inside the shared auth email layout.",
    variables: ["FullName", "ResetUrl"],
    sourcePath: "auth/src/WarpTalk.AuthService.Infrastructure/Services/ResendAuthEmailSender.cs",
    subjectLiteral: `"Reset your WarpTalk password"`,
  },
  {
    key: "workspace-invitation",
    name: "Workspace invitation",
    status: "live",
    service: "Workspace service",
    provider: "Resend",
    subject: "You've been invited to join {WorkspaceName} on WarpTalk",
    trigger: "A workspace admin invites a member, or retries delivery of a pending invitation.",
    bodySource:
      "HTML file shared/WarpTalk.Shared/Templates/workspace-invitation-email.html, with {{Placeholder}} substitution. A CDN copy is used instead when Resend:TemplateCdnUrl is set.",
    variables: ["WorkspaceName", "InviterName", "RoleName", "JoinUrl"],
    sourcePath:
      "workspace/src/WarpTalk.WorkspaceService.Infrastructure/Adapters/WorkspaceInvitationEmailComposer.cs",
    subjectLiteral: `$"You've been invited to join {workspace.Name} on WarpTalk"`,
  },
  {
    key: "workspace-join-request-approved",
    name: "Join request approved",
    status: "live",
    service: "Workspace service",
    provider: "Resend",
    subject: "Your request to join {WorkspaceName} was approved",
    trigger: "A workspace admin approves a request to join.",
    bodySource:
      "HTML file shared/WarpTalk.Shared/Templates/workspace-join-request-approved-email.html, with {{Placeholder}} substitution. A CDN copy is used instead when Resend:TemplateCdnUrl is set.",
    variables: ["WorkspaceName", "MembershipType", "JoinUrl"],
    sourcePath:
      "workspace/src/WarpTalk.WorkspaceService.Infrastructure/Adapters/WorkspaceInvitationEmailComposer.cs",
    subjectLiteral: `$"Your request to join {workspace.Name} was approved"`,
  },
  {
    key: "meeting-invitation",
    name: "Meeting invitation",
    status: "live",
    service: "Translation room service",
    provider: "SMTP",
    subject: "Invitation to Meeting: {MeetingTitle}",
    trigger:
      "Creating a meeting with invitees (only the first occurrence of a recurring series), inviting participants, and adding invitees in meeting settings.",
    bodySource: "HTML composed inline in C#.",
    variables: ["ParticipantName", "MeetingTitle", "ScheduledTime", "MeetingLink"],
    sourcePath: "shared/WarpTalk.Shared/Services/SmtpEmailService.cs",
    subjectLiteral: `$"Invitation to Meeting: {meetingTitle}"`,
  },
  {
    key: "meeting-reminder",
    name: "Meeting reminder",
    status: "dormant",
    dormantReason:
      "Implemented, but nothing calls it. Meeting reminders go out as in-app notifications only.",
    service: "Translation room service",
    provider: "SMTP",
    subject: "Reminder: Meeting '{MeetingTitle}' starts in {StartsIn}",
    trigger: "None.",
    bodySource: "HTML composed inline in C#.",
    variables: ["ParticipantName", "MeetingTitle", "StartsIn", "MeetingLink"],
    sourcePath: "shared/WarpTalk.Shared/Services/SmtpEmailService.cs",
    subjectLiteral: `$"Reminder: Meeting '{meetingTitle}' starts in {startsIn}"`,
  },
  {
    key: "notification-email-copy",
    name: "Notification email copy",
    status: "dormant",
    dormantReason:
      "Sent only when a notification's metadata carries a toEmail or email key, and no producer sets either.",
    service: "Notification service",
    provider: "Resend",
    subject: "{NotificationTitle}",
    trigger: "Any notification, for a recipient with email notifications on.",
    bodySource: "Generic HTML layout composed in C# around the notification's title, body and link.",
    variables: ["Title", "Content", "ActionUrl"],
    sourcePath:
      "notification/src/WarpTalk.NotificationService.Application/Services/NotificationService.cs",
    subjectLiteral: `new EmailMessage(userEmail, dto.Title, htmlBody)`,
  },
];
