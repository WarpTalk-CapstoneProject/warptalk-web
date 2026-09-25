import type { LegalSection } from "@/components/legal/legal-draft";

/**
 * DRAFT terms-of-use content — see legal-draft.tsx for why this exists and how it must be
 * treated. Filled in from the product's actual behavior wherever the codebase gives a real
 * answer (billing/role logic read from src/app/(app)/[workspaceSlug]/settings/**); only
 * genuinely unknowable items stay marked [CẦN XÁC NHẬN].
 */
export const TERMS_LAST_UPDATED_NOTE = "Draft prepared for review — not yet published.";

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "1. Acceptance of these terms",
    paragraphs: [
      'By creating a WarpTalk account, joining a WarpTalk workspace, or using the WarpTalk desktop app or website ("Service"), you agree to these Terms of Use. If you\'re accepting on behalf of an organization, you confirm you have authority to bind that organization, and "you" refers to that organization.',
      "If you don't agree, don't use the Service.",
    ],
  },
  {
    heading: "2. The Service",
    paragraphs: [
      "WarpTalk provides real-time speech translation during meetings, automatic transcription and AI-generated meeting summaries, optional voice cloning so translated speech can sound like the original speaker, workspaces, rooms/meetings, scheduling, documents and a team glossary, and a desktop application and browser-based bridge for translating meetings held in third-party tools (e.g. Google Meet).",
      "Features available to you depend on your workspace's plan and your role (Member, Admin, Owner), or, for platform operations, Platform Admin.",
    ],
  },
  {
    heading: "3. Accounts",
    paragraphs: [
      "You must provide accurate information when registering and keep it up to date. You're responsible for activity under your account and for keeping your password confidential. You must verify your email address before your account becomes fully active. One person, one account — sharing login credentials with others is not permitted. You must be at least 16 years old to create an account.",
      "Workspaces and roles: a workspace Owner has full control over that workspace, including billing and changing other members' roles. A workspace Admin can manage members and most workspace settings, and can view and manage billing, but cannot change another member's role or transfer ownership — only the Owner can. A Member can join meetings and use the features the workspace has enabled for them. Joining a workspace via a verified email domain or an invitation link means you agree to that workspace's own internal policies, in addition to these Terms.",
    ],
  },
  // i18n-allow: draft reviewer note in Vietnamese for @Tú, not end-user copy — this whole
  // file is a draft awaiting review, per legal-draft.tsx.
  {
    heading: "4. Subscriptions and billing",
    paragraphs: [
      "Paid plans are currently billed monthly through our payment processor, Stripe, with prices shown in Vietnamese đồng (VND). Usage is measured in credits, consumed by translation minutes, voice cloning, and other AI-metered features. [CẦN XÁC NHẬN] có cho phép credit chưa dùng cộng dồn sang kỳ sau không, và [CẦN XÁC NHẬN] chính sách hoàn tiền cụ thể (đề xuất: xét theo từng trường hợp, liên hệ hỗ trợ).",
      "If payment fails, we may suspend the workspace until payment is resolved. You can cancel a subscription at any time from workspace billing settings; cancellation takes effect at the end of your current billing period — you keep access until then, and you are not billed again afterward.",
    ],
  },
  {
    heading: "5. Acceptable use",
    paragraphs: [
      "You agree not to: use the Service for any unlawful purpose, or to harass, defame, or infringe the rights of others; record or capture a meeting, or clone someone's voice, without that person's knowledge and consent where required by law; attempt to reverse-engineer, decompile, or extract the AI models underlying the Service; interfere with or disrupt the Service; access another workspace's data without authorization, or attempt to escalate your role/permissions; upload malware or unlawful content; or use the Service to build a competing product.",
      "We may suspend or terminate accounts that violate this section.",
    ],
  },
  {
    heading: "6. Voice cloning — specific rules",
    paragraphs: [
      "You may only create a voice profile using your own voice, or with the explicit, informed consent of the person whose voice is being cloned. A workspace Owner or Admin can disable voice cloning for the whole workspace. You're responsible for how a cloned voice is used within meetings you host or attend. We may suspend voice cloning access if we reasonably suspect it's being used to impersonate someone without consent.",
    ],
  },
  {
    heading: "7. Your content",
    paragraphs: [
      "You (or your workspace) retain ownership of the meeting content, documents, and glossary terms you upload or create. By using the Service, you grant WarpTalk a limited license to process that content solely to provide the Service back to you and your workspace. We do not claim ownership of your meeting content, and we do not use it to train models shared across other customers (see our Privacy Policy).",
    ],
  },
  {
    heading: "8. Intellectual property",
    paragraphs: [
      "The Service, including its software, design, and AI models, is owned by WarpTalk (or its licensors) and protected by intellectual property law. These Terms don't grant you any rights to WarpTalk's trademarks, logos, or underlying technology beyond what's needed to use the Service as intended.",
    ],
  },
  {
    heading: "9. Third-party services",
    paragraphs: [
      "The Service integrates with third-party providers (Google Sign-In, AI/voice providers such as OpenAI and Cartesia, the payment processor Stripe, and, for some workflows, third-party meeting platforms like Google Meet). Your use of those third-party services is subject to their own terms, and WarpTalk isn't responsible for their acts or omissions.",
    ],
  },
  {
    heading: "10. Disclaimers",
    paragraphs: [
      "The Service is provided \"as is.\" Translation, transcription, and AI-generated summaries can contain errors — do not rely on WarpTalk output for decisions where mistranslation could cause harm (e.g. medical, legal, or safety-critical situations) without independent verification.",
    ],
  },
  // i18n-allow: draft reviewer note in Vietnamese for @Tú, not end-user copy — see the file
  // header above.
  {
    heading: "11. Limitation of liability",
    paragraphs: [
      "To the maximum extent permitted by law, WarpTalk will not be liable for indirect, incidental, special, or consequential damages, or for lost profits or data, arising from your use of the Service. Our total liability for any claim relating to the Service will not exceed the amount you paid us in the 12 months before the claim arose. [CẦN XÁC NHẬN nếu leader muốn con số/điều khoản khác.]",
    ],
  },
  {
    heading: "12. Termination",
    paragraphs: [
      "You may stop using the Service and delete your account at any time. We may suspend or terminate your access if you violate these Terms, or if required by law. On termination, your right to access the Service ends; data handling after termination follows the retention rules in our Privacy Policy.",
    ],
  },
  {
    heading: "13. Changes to the Service or these Terms",
    paragraphs: [
      "We may update the Service or these Terms over time. We'll give notice of material changes before they take effect. Continued use after that point means you accept the updated Terms.",
    ],
  },
  // i18n-allow: draft reviewer note in Vietnamese for @Tú, not end-user copy — see the file
  // header above.
  {
    heading: "14. Governing law and disputes",
    paragraphs: [
      "These Terms are governed by the laws of Vietnam. Any dispute arising from these Terms or your use of the Service will be resolved by the competent courts of Vietnam. [CẦN XÁC NHẬN nếu leader muốn chọn trọng tài thay vì toà án, hoặc quy định địa điểm tài phán cụ thể hơn.]",
    ],
  },
  {
    heading: "15. Contact us",
    paragraphs: ["Questions about these Terms: legal@warptalk.io.vn."],
  },
];

// i18n-allow: reviewer checklist in Vietnamese for @Tú, not end-user copy — see the file
// header above.
export const TERMS_REVIEW_NOTES = [
  "Credit chưa dùng có cộng dồn sang kỳ sau không",
  "Chính sách hoàn tiền cụ thể (đang để mặc định: xét theo từng trường hợp)",
  "Con số/điều khoản giới hạn trách nhiệm ở mục 11 có đúng ý muốn không",
  "Xác nhận luật áp dụng = Việt Nam và cơ chế toà án (hay muốn chuyển sang trọng tài)",
  "Ngày publish chính thức (thay ghi chú draft)",
];
