import type { LegalSection } from "@/components/legal/legal-draft";

/**
 * DRAFT privacy policy content — see legal-draft.tsx for why this exists and how it must be
 * treated. Filled in from the product's actual behavior (source below each fact) wherever the
 * codebase gives a real answer; only genuinely unknowable items (legal registration details,
 * regulatory thresholds, model-training policy) stay marked [CẦN XÁC NHẬN].
 */
export const PRIVACY_LAST_UPDATED_NOTE = "Draft prepared for review — not yet published.";

// i18n-allow: this whole file is a draft awaiting review by a Vietnamese-speaking lead
// (@Tú), not translated end-user copy — the [CẦN XÁC NHẬN] markers are notes to that
// reviewer, in the language they and the rest of legal-draft.tsx's audience actually work
// in. See legal-draft.tsx for why this page exists outside the normal i18n catalog.
export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "1. Who we are",
    paragraphs: [
      'WarpTalk ("WarpTalk", "we", "us") provides an AI-powered platform for real-time meeting translation, transcription, AI summaries, and voice cloning, accessible via web (app.warptalk.io.vn) and a desktop application.',
      "Legal entity and registered address: [CẦN XÁC NHẬN — tên pháp nhân đăng ký kinh doanh và địa chỉ, nếu dự án đã có pháp nhân chính thức]. Contact for privacy matters: privacy@warptalk.io.vn.",
      "This policy applies to everyone who creates a WarpTalk account, joins a WarpTalk workspace as a guest, or otherwise uses our services.",
    ],
  },
  {
    heading: "2. What we collect",
    paragraphs: [
      "Account information: full name, email address, password (stored as a salted hash — we never store or can see your plain-text password), your default speak/listen language, and, if you sign in with Google, your Google account ID, name, email, and profile picture.",
      "Meeting content: audio captured during meetings for the duration needed to produce a live translation, the transcripts and translations generated from that audio, AI summaries and generated artifacts, recordings if a workspace enables them, and in-meeting chat messages.",
      "Voice data: if you opt in to Voice Profiles (human voice cloning), we process a sample of your voice to create a synthetic voice model. Voice cloning is opt-in per person and can be switched off workspace-wide by a workspace Owner or Admin. Raw voice samples are used to train your voice model and are not kept beyond what's needed to do that; the resulting voice model is what's stored and reused.",
      "Workspace and usage data: workspace name, members, roles (Owner / Admin / Member), workspace settings (default language, timezone, verified email domains, meeting-artifact retention period), documents, glossary and knowledge-base content, usage metrics (meetings held, credits consumed), and device/browser/IP information for security and troubleshooting.",
      "Billing information: plan/subscription details, invoices, and payment status. Payment card details are collected and processed directly by our payment processor, Stripe — WarpTalk does not store your full card number.",
      "Cookies: session cookies to keep you signed in. We do not currently use advertising cookies or third-party tracking pixels.",
    ],
  },
  // i18n-allow: draft reviewer note in Vietnamese for @Tú, not end-user copy — see the file
  // header above.
  {
    heading: "3. How we use your information",
    paragraphs: [
      "We use the information above to provide the core service (real-time translation, transcription, AI summaries, voice cloning), authenticate and secure your account, operate and bill your workspace subscription, provide customer support, detect and prevent fraud or abuse, monitor system health, and comply with legal obligations.",
      "We do not use your meeting audio, transcripts, or voice samples to train general-purpose AI models shared across customers, and we do not sell your personal data. [CẦN XÁC NHẬN nếu điều này thay đổi trong tương lai — cần công bố lại rõ ràng trước khi áp dụng.]",
    ],
  },
  {
    heading: "4. Who we share it with",
    paragraphs: [
      "AI providers (currently OpenAI and Cartesia) receive meeting audio/text for transcription, translation, summarization, and voice synthesis, strictly to deliver those features back to you. Stripe receives billing contact details and payment information to process subscription payments. Google receives OAuth token exchange data if you sign in with Google. Our cloud infrastructure provider hosts the data described above. Law enforcement or regulators receive only what is legally required, under a valid legal request.",
      "We require every third party we share data with to protect it under terms at least as strict as this policy, and we don't allow any of them to use your data for their own purposes.",
    ],
  },
  // i18n-allow: draft reviewer note in Vietnamese for @Tú, not end-user copy — see the file
  // header above.
  {
    heading: "5. How long we keep your data",
    paragraphs: [
      "Meeting artifacts (transcripts, summaries, recordings, documents) are kept for the retention period each workspace sets (30 days by default; a workspace Owner or Admin can change this in workspace settings).",
      "Account data is kept for as long as your account is active. If you delete your account, we remove your personal data within [CẦN XÁC NHẬN — đề xuất 30 ngày] except where we're required to keep billing records for tax/accounting purposes (typically several years under Vietnamese accounting law — [CẦN XÁC NHẬN] thời hạn chính xác).",
    ],
  },
  // i18n-allow: draft reviewer note in Vietnamese for @Tú, not end-user copy — see the file
  // header above.
  {
    heading: "6. Your rights",
    paragraphs: [
      "You can access and correct your personal data at any time from your account Settings. You can withdraw consent for voice cloning at any time by removing your Voice Profile. You can request deletion of your account and associated data, or export a copy of your data, by contacting privacy@warptalk.io.vn. You can also object to or ask us to restrict certain processing.",
      "We will respond to these requests within [CẦN XÁC NHẬN — đề xuất 30 ngày theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân].",
      "If your workspace was created by an employer or organization, some requests (e.g. deleting workspace-wide meeting records) may need to go through your workspace Owner, since they control that workspace's data and billing.",
    ],
  },
  {
    heading: "7. Security",
    paragraphs: [
      "We use industry-standard measures to protect your data, including encryption in transit (HTTPS/WSS), hashed passwords, and role-based access control within workspaces (Member / Admin / Owner, plus Platform Admin for WarpTalk's own operations team). No system is 100% secure; if we become aware of a breach affecting your data, we will notify affected users and any authority required by law without undue delay.",
    ],
  },
  // i18n-allow: draft reviewer note in Vietnamese for @Tú, not end-user copy — see the file
  // header above.
  {
    heading: "8. International data transfers",
    paragraphs: [
      "[CẦN XÁC NHẬN] vùng/quốc gia lưu trữ dữ liệu chính thức, và nếu dữ liệu được xử lý bởi AI provider có máy chủ ngoài Việt Nam, cơ sở pháp lý cho việc chuyển dữ liệu ra nước ngoài theo Nghị định 13/2023/NĐ-CP (ví dụ: đánh giá tác động chuyển dữ liệu, hoặc điều khoản hợp đồng chuẩn với nhà cung cấp).",
    ],
  },
  {
    heading: "9. Children's privacy",
    paragraphs: [
      "WarpTalk is a workplace/meeting tool and is not directed at children. You must be at least 16 years old to create an account. We do not knowingly collect data from children under that age; if we learn we have, we will delete it.",
    ],
  },
  {
    heading: "10. Changes to this policy",
    paragraphs: [
      "We may update this policy from time to time. Material changes will be notified in-app or by email before they take effect. Continuing to use WarpTalk after an update means you accept the revised policy.",
    ],
  },
  {
    heading: "11. Contact us",
    paragraphs: [
      "Questions about this policy or how we handle your data: privacy@warptalk.io.vn.",
    ],
  },
];

// i18n-allow: reviewer checklist in Vietnamese for @Tú, not end-user copy — see the file
// header above.
export const PRIVACY_REVIEW_NOTES = [
  "Tên pháp nhân + địa chỉ đăng ký kinh doanh chính thức (nếu dự án đã có), hoặc xác nhận dùng \"WarpTalk\" như hiện tại",
  "Có thay đổi chính sách không dùng data để train model chung trong tương lai không",
  "Thời gian giữ account data sau khi user xoá tài khoản (đề xuất 30 ngày)",
  "Thời hạn lưu hoá đơn theo luật kế toán VN chính xác",
  "Vùng/quốc gia lưu trữ dữ liệu chính thức + cơ sở pháp lý nếu chuyển ra nước ngoài",
  "Ngày publish chính thức (thay ghi chú draft)",
];
