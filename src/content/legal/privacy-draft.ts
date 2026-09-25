import type { LegalSection } from "@/components/legal/legal-draft";

/**
 * DRAFT privacy policy content — see legal-draft.tsx for why this exists and how it must be
 * treated. Sourced from the product's actual features (real-time translation, voice cloning,
 * workspaces, Stripe billing, AI providers) as of the WT-813 QA pass, not from legal counsel.
 */
export const PRIVACY_LAST_UPDATED_NOTE = "Draft prepared for review — not yet published.";

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "1. Who we are",
    paragraphs: [
      'WarpTalk ("WarpTalk", "we", "us") provides an AI-powered platform for real-time meeting translation, transcription, AI summaries, and voice cloning, accessible via web (app.warptalk.io.vn) and a desktop application.',
      "Legal entity: [CẦN XÁC NHẬN — tên pháp nhân đăng ký kinh doanh]. Registered address: [CẦN XÁC NHẬN]. Contact for privacy matters: [CẦN XÁC NHẬN — email, vd privacy@warptalk.io.vn].",
      "This policy applies to everyone who creates a WarpTalk account, joins a WarpTalk workspace as a guest, or otherwise uses our services.",
    ],
  },
  {
    heading: "2. What we collect",
    paragraphs: [
      "Account information: full name, email address, password (stored as a salted hash — we never store or can see your plain-text password), language preferences, and, if you sign in with Google, your Google account ID, name, email, and profile picture.",
      "Meeting content: audio captured during meetings for the duration needed to produce a live translation, the transcripts and translations generated from that audio, AI summaries and generated artifacts, recordings if a workspace enables them, and in-meeting chat messages.",
      "Voice data: if you opt in to Voice Profiles (human voice cloning), we process a sample of your voice to create a synthetic voice model. Voice cloning is opt-in only, and a workspace can enable or disable it (voiceCloningEnabled). [CẦN XÁC NHẬN] whether raw voice samples are retained after a voice model is trained, and for how long.",
      "Workspace and usage data: workspace name, members, roles, settings (default language, timezone, verified email domains), documents, glossary and knowledge-base content, usage metrics, and device/browser/IP information for security and troubleshooting.",
      "Billing information: plan/subscription details, invoices, and payment status. Payment card details are collected and processed directly by our payment processor, Stripe — WarpTalk does not store your full card number.",
      "Cookies: session cookies to keep you signed in. [CẦN XÁC NHẬN] whether any analytics/advertising cookies are used; if so, list them here with purpose and retention.",
    ],
  },
  {
    heading: "3. How we use your information",
    paragraphs: [
      "We use the information above to provide the core service (real-time translation, transcription, AI summaries, voice cloning), authenticate and secure your account, operate and bill your workspace subscription, improve translation and AI quality, provide customer support, detect and prevent fraud or abuse, and comply with legal obligations.",
      "[CẦN XÁC NHẬN] whether meeting audio/transcripts are ever used to train or fine-tune models, and if so, describe the anonymization and opt-out process.",
      "We do not sell your personal data.",
    ],
  },
  {
    heading: "4. Who we share it with",
    paragraphs: [
      "AI providers (e.g. OpenAI, Cartesia) receive meeting audio/text for transcription, translation, summarization, and voice synthesis. Stripe receives billing contact details and payment information for processing subscription payments. Google receives OAuth token exchange data if you sign in with Google. Our cloud infrastructure providers host all of the data above. Law enforcement or regulators receive only what is legally required, under a valid legal request.",
      "[CẦN XÁC NHẬN] full, named list of sub-processors (required under most data-protection laws) — the list above is based on integrations visible in the product and may be incomplete.",
      "We require every third party we share data with to protect it under terms at least as strict as this policy.",
    ],
  },
  {
    heading: "5. How long we keep your data",
    paragraphs: [
      "Meeting artifacts (transcripts, summaries, recordings, documents) are kept for artifactRetentionDays as configured per workspace (default appears to be 30 days; a workspace admin can change this). [CẦN XÁC NHẬN] the default and the allowed range.",
      "Account data is kept for as long as your account is active, plus [CẦN XÁC NHẬN] a defined period after deletion for backup/legal purposes. Billing records are kept as required by tax/accounting law — [CẦN XÁC NHẬN] the exact period under Vietnamese law. Voice models: [CẦN XÁC NHẬN].",
    ],
  },
  {
    heading: "6. Your rights",
    paragraphs: [
      "Depending on your location, you may have the right to access the personal data we hold about you, correct inaccurate data, request deletion of your account and associated data, withdraw consent for voice cloning at any time, export your data ([CẦN XÁC NHẬN] whether a self-service export tool exists), and object to or restrict certain processing.",
      "To exercise these rights, contact [CẦN XÁC NHẬN — email]. We will respond within [CẦN XÁC NHẬN — vd 30 ngày theo Nghị định 13/2023/NĐ-CP].",
      "If your workspace was created by an employer or organization, some requests may need to go through your workspace Owner/Admin, since they control that workspace's data.",
    ],
  },
  {
    heading: "7. Security",
    paragraphs: [
      "We use industry-standard measures to protect your data, including encryption in transit (HTTPS/WSS), hashed passwords, and role-based access control within workspaces (Member / Admin / Owner / Platform Admin). No system is 100% secure; if we become aware of a breach affecting your data, we will notify you as required by law.",
    ],
  },
  {
    heading: "8. International data transfers",
    paragraphs: [
      "[CẦN XÁC NHẬN] where data is hosted (region/country) and, if data leaves Vietnam (e.g. to AI providers or cloud regions outside Vietnam), the legal basis/safeguard used for that transfer under Nghị định 13/2023/NĐ-CP.",
    ],
  },
  {
    heading: "9. Children's privacy",
    paragraphs: [
      "WarpTalk is not directed at children under [CẦN XÁC NHẬN — 13 hoặc 16 tuỳ luật áp dụng]. We do not knowingly collect data from children under that age.",
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
      "Questions about this policy or how we handle your data: [CẦN XÁC NHẬN — email, ví dụ privacy@warptalk.io.vn].",
    ],
  },
];

export const PRIVACY_REVIEW_NOTES = [
  "Tên pháp nhân, địa chỉ đăng ký kinh doanh, email liên hệ privacy",
  "Voice sample gốc có lưu sau khi train model không, lưu bao lâu",
  "Có dùng audio/transcript để train/fine-tune model không, có cơ chế opt-out không",
  "Danh sách đầy đủ sub-processor (tên công ty AI provider, cloud provider...)",
  "Retention mặc định của artifact (đang thấy code là 30 ngày) và range cho phép chỉnh",
  "Retention account sau khi xoá, retention hoá đơn theo luật kế toán VN",
  "Có tool tự export dữ liệu không",
  "Thời hạn phản hồi yêu cầu của user (theo Nghị định 13/2023/NĐ-CP)",
  "Vùng/quốc gia lưu trữ dữ liệu, cơ sở pháp lý chuyển dữ liệu ra nước ngoài nếu có",
  "Độ tuổi tối thiểu được phép dùng dịch vụ",
  "Ngày publish chính thức (thay cho ghi chú draft)",
];
