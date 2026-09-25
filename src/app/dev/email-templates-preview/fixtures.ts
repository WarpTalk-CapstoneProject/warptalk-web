/**
 * Fixtures for /dev/email-templates-preview: emails rendered the way the server renders them
 * (EmailTemplateRenderer's built-in layout, copied here with sample values already filled in),
 * so thumbnails and the inbox preview can be judged without a notification service.
 */

import type { EmailRenderedDto, EmailTemplateListItemDto } from "@/types/admin-cms";

const DARK_CSS =
  ".wt-page { background-color: #111113 !important; } " +
  ".wt-card { background-color: #18181B !important; border-color: #27272A !important; } " +
  ".wt-card h1, .wt-card p, .wt-card strong, .wt-card span, .wt-card div, .wt-brand { color: #F4F4F5 !important; } " +
  ".wt-footer { color: #71717A !important; }";

const paragraph = (html: string, bottom = 16) =>
  `<p style="margin: 0 0 ${bottom}px 0; font-size: 15px; line-height: 1.6; color: #3F3F46;">${html}</p>`;
const button = (label: string) =>
  `<div style="margin: 32px 0;"><a href="https://app.warptalk.vn/" target="_blank" style="display: inline-block; background-color: #18181B; color: #FFFFFF; font-size: 14px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 10px;">${label}</a></div>`;

export function layout(subject: string, preheader: string, heading: string, content: string, dark: boolean): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title>${dark ? `<style>${DARK_CSS}</style>` : ""}</head>
<body class="wt-page" style="margin: 0; padding: 0; width: 100%; background-color: #FBF9F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
<span style="display: none !important;">${preheader}</span>
<table role="presentation" class="wt-page" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #FBF9F5; padding: 48px 16px;"><tr><td align="center">
<table role="presentation" class="wt-card" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #FFFFFF; border: 1px solid #E4E4E7; border-radius: 16px; overflow: hidden;">
<tr><td style="padding: 40px 36px 0 36px;"><div class="wt-brand" style="font-size: 22px; font-weight: 700; color: #18181B; letter-spacing: -0.5px;">WarpTalk<span style="color: #D97757; font-weight: 900;">.</span></div></td></tr>
<tr><td style="padding: 24px 36px 40px 36px;">
${heading ? `<h1 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 700; color: #18181B; line-height: 1.3;">${heading}</h1>` : ""}
${content}
</td></tr></table>
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; margin-top: 24px;"><tr><td class="wt-footer" align="center" style="font-size: 12px; color: #A1A1AA;">&copy; 2026 WarpTalk Inc. &bull; Real-time AI Workspace Collaboration</td></tr></table>
</td></tr></table></body></html>`;
}

interface FixtureEmail {
  subject: Record<string, string>;
  preheader: Record<string, string>;
  heading: Record<string, string>;
  body: Record<string, string>;
  text: string;
}

// i18n-allow: fixture email content in each language an email is written in (dev preview only).
export const FIXTURE_EMAILS: Record<string, FixtureEmail> = {
  // i18n-allow: fixture content in each language (dev preview only).
  "auth.verify-email": {
    subject: { en: "Verify your WarpTalk email", vi: "Xác minh email WarpTalk của bạn", ja: "WarpTalk のメールアドレスを確認してください" },
    preheader: { en: "One click and your account is ready.", vi: "Một cú nhấp là tài khoản sẵn sàng.", ja: "ワンクリックでアカウントの準備が整います。" },
    heading: { en: "Verify your email", vi: "Xác minh email", ja: "メールアドレスの確認" },
    body: {
      en: paragraph('Hi <strong style="color: #18181B;">Linh Nguyen</strong>,') + paragraph("Welcome to WarpTalk! Please verify your email address by clicking the button below to complete your registration.", 28) + button("Verify Email Address &rarr;"),
      vi: paragraph('Chào <strong style="color: #18181B;">Linh Nguyen</strong>,') + paragraph("Chào mừng bạn đến với WarpTalk! Hãy xác minh địa chỉ email bằng nút bên dưới để hoàn tất đăng ký.", 28) + button("Xác minh email &rarr;"),
      ja: paragraph('<strong style="color: #18181B;">Linh Nguyen</strong> 様') + paragraph("WarpTalk へようこそ！下のボタンからメールアドレスを確認して、登録を完了してください。", 28) + button("メールアドレスを確認 &rarr;"),
    },
    text: "Hi Linh Nguyen,\n\nWelcome to WarpTalk! Please verify your email address:\nhttps://app.warptalk.vn/verify-email?token=sample-token",
  },
  // i18n-allow: fixture content in each language (dev preview only).
  "meeting.invitation": {
    subject: { en: "Weekly product sync — you're invited", vi: "Họp sản phẩm hằng tuần — bạn được mời", ja: "週次プロダクト定例へのご招待" },
    preheader: { en: "Thursday 10:00 · Join from your browser", vi: "Thứ Năm 10:00 · Tham gia từ trình duyệt", ja: "木曜 10:00・ブラウザから参加" },
    heading: { en: "You're invited to a meeting", vi: "Bạn được mời họp", ja: "会議への招待" },
    body: {
      en: paragraph("Minh Tran invited you to <strong>Weekly product sync</strong> on Thursday at 10:00 (GMT+7).") + paragraph("Live captions and translation are on for English and Vietnamese.", 28) + button("Join meeting &rarr;"),
      vi: paragraph("Minh Tran mời bạn tham gia <strong>Họp sản phẩm hằng tuần</strong> vào Thứ Năm lúc 10:00 (GMT+7).", 28) + button("Tham gia &rarr;"),
      ja: paragraph("Minh Tran さんから木曜 10:00（GMT+7）の<strong>週次プロダクト定例</strong>に招待されました。", 28) + button("参加する &rarr;"),
    },
    text: "Minh Tran invited you to Weekly product sync on Thursday at 10:00 (GMT+7).\nJoin: https://app.warptalk.vn/join/abc-defg",
  },
  // i18n-allow: fixture content in each language (dev preview only).
  "autumn-launch": {
    subject: { en: "Hi Linh Nguyen, we launch on October 1", vi: "Chào Linh Nguyen, ra mắt ngày 1/10", ja: "Linh Nguyen 様、10 月 1 日に公開します" },
    preheader: { en: "Live captions in 40 languages, and a new meeting record.", vi: "Phụ đề trực tiếp 40 ngôn ngữ và biên bản họp mới.", ja: "40 言語のライブ字幕と新しい議事録。" },
    heading: { en: "Autumn launch", vi: "Ra mắt mùa thu", ja: "秋のリリース" },
    body: {
      en:
        paragraph('Hi <strong style="color: #18181B;">Linh Nguyen</strong>,') +
        paragraph("On <strong>October 1</strong> WarpTalk gets live captions in 40 languages, a meeting record you can share, and faster voice translation.") +
        '<div style="height: 160px; border-radius: 12px; margin: 8px 0 20px; background: linear-gradient(135deg, #D97757, #4F46E5);"></div>' +
        button("Save your seat &rarr;"),
      vi: paragraph('Chào <strong style="color: #18181B;">Linh Nguyen</strong>,') + paragraph("Ngày <strong>1/10</strong> WarpTalk ra mắt phụ đề trực tiếp 40 ngôn ngữ và biên bản họp có thể chia sẻ.", 28) + button("Giữ chỗ &rarr;"),
      ja: paragraph('<strong style="color: #18181B;">Linh Nguyen</strong> 様') + paragraph("<strong>10 月 1 日</strong>、WarpTalk に 40 言語のライブ字幕と共有できる議事録が加わります。", 28) + button("席を予約 &rarr;"),
    },
    text: "Hi Linh Nguyen,\n\nOn October 1 WarpTalk gets live captions in 40 languages.\nSave your seat: https://warptalk.vn/launch",
  },
};

export function renderFixture(key: string, locale: string, dark: boolean): EmailRenderedDto {
  const email = FIXTURE_EMAILS[key] ?? FIXTURE_EMAILS["auth.verify-email"];
  const lang = email.subject[locale] ? locale : "en";
  return {
    subject: email.subject[lang],
    preheader: email.preheader[lang],
    html: layout(email.subject[lang], email.preheader[lang], email.heading[lang], email.body[lang], dark),
    text: email.text,
    layoutName: "Built-in layout",
    localeUsed: lang,
    sourceUsed: key === "autumn-launch" ? "DRAFT" : "PUBLISHED",
    version: 3,
    fromName: "WarpTalk",
    fromAddress: "no-reply@warptalk.vn",
    toName: "Linh Nguyen",
    toAddress: "linh@example.com",
  };
}

const variant = (locale: string, publishedVersion: number, hasDraftChanges: boolean) => ({
  id: `${locale}-${publishedVersion}`,
  locale,
  status: "ACTIVE",
  publishedVersion,
  hasDraftChanges,
  publishedAt: "2026-09-20T08:00:00Z",
  publishedBy: null,
  draftUpdatedAt: "2026-09-24T08:00:00Z",
  draftUpdatedBy: "00000000-0000-0000-0000-000000000001",
});

export const FIXTURE_TEMPLATES: EmailTemplateListItemDto[] = [
  {
    key: "auth.verify-email",
    name: "Verify email",
    description: "Sent right after sign-up.",
    service: "auth",
    provider: "Resend",
    trigger: "Someone signs up",
    isLive: true,
    dormantReason: null,
    variables: [],
    subject: "Verify your WarpTalk email",
    layoutName: null,
    variants: [variant("en", 3, false), variant("vi", 1, true)],
    hasDraftChanges: true,
    updatedAt: "2026-09-24T08:00:00Z",
    updatedBy: null,
    last30Days: { sent: 1284, failed: 3 },
    isCustom: false,
    category: "BUILT_IN",
    status: "ACTIVE",
    renderedSubject: "Verify your WarpTalk email",
    renderedPreheader: "One click and your account is ready.",
  },
  {
    key: "meeting.invitation",
    name: "Meeting invitation",
    description: "Sent when someone is invited to a meeting.",
    service: "translation-room",
    provider: "SMTP",
    trigger: "A host invites people",
    isLive: true,
    dormantReason: null,
    variables: [],
    subject: "{{MeetingTitle}} — you're invited",
    layoutName: null,
    variants: [],
    hasDraftChanges: false,
    updatedAt: null,
    updatedBy: null,
    last30Days: { sent: 342, failed: 0 },
    isCustom: false,
    category: "BUILT_IN",
    status: "ACTIVE",
    renderedSubject: "Weekly product sync — you're invited",
    renderedPreheader: "Thursday 10:00 · Join from your browser",
  },
  {
    key: "autumn-launch",
    name: "Autumn launch",
    description: "Tell everyone about the launch.",
    service: "notification",
    provider: "Resend",
    trigger: "Sent by an admin to an audience.",
    isLive: true,
    dormantReason: null,
    variables: [
      { name: "RecipientName", description: "The recipient's name.", sample: "Linh Nguyen", required: false, multiline: false, implicit: true, type: "TEXT" },
      { name: "EventDate", description: "Launch date", label: "Launch date", sample: "October 1", required: true, multiline: false, type: "DATE" },
    ],
    subject: "Hi {{RecipientName}}, we launch on {{EventDate}}",
    layoutName: null,
    variants: [variant("en", 0, true)],
    hasDraftChanges: true,
    updatedAt: "2026-09-25T02:00:00Z",
    updatedBy: null,
    last30Days: { sent: 0, failed: 0 },
    isCustom: true,
    category: "MARKETING",
    status: "ACTIVE",
    renderedSubject: "Hi Linh Nguyen, we launch on October 1",
    renderedPreheader: "Live captions in 40 languages, and a new meeting record.",
  },
];
