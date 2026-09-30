/**
 * Curated Glossary Templates Catalog.
 * // i18n-allow-file: curated multilingual templates catalog (EN, VI, JA)
 *
 * Provides standardized templates across key domains (IT, Business, Gaming, General)
 * and languages (EN, VI, JA).
 * Used by Admin Master Portal (/admin/glossary-templates) and Consumer Galleries (Workspace / Global Glossary).
 */

import ExcelJS from "exceljs";

export const GLOSSARY_TEMPLATE_COLUMNS = [
  "Term",
  "Translation",
  "Context",
  "Field",
  "Definition",
  "Note",
  "Part of speech",
  "Priority",
] as const;

export type GlossaryTemplateCategory = "IT" | "BUSINESS" | "GAMING" | "GENERAL";
export type GlossaryTemplateLanguage = "en" | "vi" | "ja";

export interface GlossaryTemplateTermItem {
  term: string;
  translation: string;
  context: string;
  domain: string;
  partOfSpeech?: string;
  definition?: string;
  usageNote?: string;
  priority?: number;
}

export interface GlossaryTemplateDefinition {
  key: string;
  name: string;
  description: string;
  category: GlossaryTemplateCategory;
  sourceLanguage: GlossaryTemplateLanguage;
  targetLanguage: GlossaryTemplateLanguage;
  sampleTerms: GlossaryTemplateTermItem[];
  status: "published" | "draft" | "archived";
  isDefault?: boolean;
  updatedAt: string;
}

export const BUILT_IN_GLOSSARY_TEMPLATES: GlossaryTemplateDefinition[] = [
  {
    key: "it-software-devops-en-vi",
    name: "IT & Software DevOps (EN → VI)",
    description: "Bộ thuật ngữ kỹ thuật phần mềm, CI/CD và kiến trúc điện toán đám mây cho các buổi họp kỹ thuật.",
    category: "IT",
    sourceLanguage: "en",
    targetLanguage: "vi",
    status: "published",
    isDefault: true,
    updatedAt: "2026-09-29T10:00:00.000Z",
    sampleTerms: [
      {
        term: "pipeline",
        translation: "quy trình CI/CD",
        context: "Trong quy trình DevOps và tự động hóa build/deploy code lên server",
        domain: "DevOps",
        partOfSpeech: "noun",
        definition: "A set of automated processes that allow developers to build, test, and deploy code",
        usageNote: "Không dịch là 'đường ống nước' trong ngữ cảnh IT",
        priority: 8,
      },
      {
        term: "cache",
        translation: "bộ nhớ đệm",
        context: "Khi tối ưu tốc độ đọc dữ liệu từ database hoặc Redis",
        domain: "Backend",
        partOfSpeech: "noun",
        definition: "Hardware or software component that stores data temporarily to serve future requests faster",
        usageNote: "Có thể giữ nguyên từ cache hoặc dịch bộ nhớ đệm",
        priority: 7,
      },
      {
        term: "payload",
        translation: "dữ liệu truyền tải",
        context: "Nội dung dữ liệu trong body của gói tin HTTP Request/Response",
        domain: "API & Network",
        partOfSpeech: "noun",
        definition: "The actual data in a packet or message as opposed to headers or metadata",
        usageNote: "Trong REST API thường gọi tắt là payload",
        priority: 7,
      },
      {
        term: "rollback",
        translation: "hoàn tác phiên bản",
        context: "Khi bản release bị lỗi trên production cần khôi phục về phiên bản trước",
        domain: "DevOps",
        partOfSpeech: "verb",
        definition: "An operation which returns the database or software to some previous state",
        usageNote: "Dùng khi xử lý sự cố hạ tầng",
        priority: 8,
      },
      {
        term: "handshake",
        translation: "bắt tay kết nối",
        context: "Giai đoạn thiết lập phiên kết nối TLS/TCP giữa client và server",
        domain: "Networking",
        partOfSpeech: "noun",
        definition: "An automated process of negotiation between two devices",
        usageNote: "Thuật ngữ mạng máy tính",
        priority: 6,
      },
    ],
  },
  {
    key: "business-management-en-ja",
    name: "Business & Agile Project Management (EN → JA)",
    description: "Thuật ngữ quản lý dự án, báo cáo tiến độ và hội họp thương mại Anh - Nhật.",
    category: "BUSINESS",
    sourceLanguage: "en",
    targetLanguage: "ja",
    status: "published",
    isDefault: false,
    updatedAt: "2026-09-29T10:00:00.000Z",
    sampleTerms: [
      {
        term: "milestone",
        translation: "マイルストーン",
        context: "When confirming important project delivery deadlines and phase gates",
        domain: "Management",
        partOfSpeech: "noun",
        definition: "A significant stage or event in the development of a project (Katakana: マイルストーン / mairusutōn)",
        usageNote: "Katakana loanword (カタカナ語). Standard term in IT & business management.",
        priority: 8,
      },
      {
        term: "stakeholder",
        translation: "ステークホルダー",
        context: "Refers to clients, investors, executive board, and project sponsors",
        domain: "Corporate",
        partOfSpeech: "noun",
        definition: "A person or entity with an interest or concern in a business project (Katakana: ステークホルダー)",
        usageNote: "Katakana loanword (カタカナ語). Used widely in Japanese corporate meetings.",
        priority: 7,
      },
      {
        term: "standup",
        translation: "デイリースタンドアップ",
        context: "Daily 15-minute sync meeting to report progress and blockers",
        domain: "Agile",
        partOfSpeech: "noun",
        definition: "A daily short meeting to discuss progress and blockers (Katakana: デイリースタンドアップ)",
        usageNote: "Katakana loanword. Often shortened to スタンドアップ (standup) in Agile/Scrum teams.",
        priority: 7,
      },
      {
        term: "deliverable",
        translation: "成果物",
        context: "Contractual work products or documentation committed to the client",
        domain: "Contract",
        partOfSpeech: "noun",
        definition: "A tangible product or service produced as a result of a project (Kanji: 成果物 / Hiragana: せいかぶつ)",
        usageNote: "Kanji term with Hiragana reading せいかぶつ (seikabutsu). Distinct from 納品物 (のうひんぶつ).",
        priority: 9,
      },
      {
        term: "agenda",
        translation: "アジェンダ",
        context: "List of discussion topics distributed before the meeting starts",
        domain: "Meeting",
        partOfSpeech: "noun",
        definition: "Meeting agenda or schedule of topics (Katakana: アジェンダ / Kanji equivalent: 議題・ぎだい)",
        usageNote: "Katakana is preferred in tech and multinational firms; traditional Kanji equivalent is 議題 (ぎだい).",
        priority: 8,
      },
      {
        term: "meeting minutes",
        translation: "議事録",
        context: "Official notes recording decisions and action items agreed upon in the meeting",
        domain: "Corporate",
        partOfSpeech: "noun",
        definition: "Official meeting record (Kanji: 議事録 / Hiragana: ぎじろく / Katakana: ミーティングミニッツ)",
        usageNote: "Standard Kanji: 議事録 (ぎじろく / gijiroku). Avoid literal Katakana unless requested.",
        priority: 9,
      },
      {
        term: "kickoff",
        translation: "キックオフ",
        context: "The inaugural meeting marking the official launch of a project",
        domain: "Agile",
        partOfSpeech: "noun",
        definition: "Project initiation meeting (Katakana: キックオフ / kikkofu)",
        usageNote: "Katakana loanword. Often combined as キックオフミーティング (kick-off meeting).",
        priority: 7,
      },
      {
        term: "consensus",
        translation: "合意",
        context: "Reaching alignment and agreement across all participating parties",
        domain: "Negotiation",
        partOfSpeech: "noun",
        definition: "Agreement or mutual understanding (Kanji: 合意 / Hiragana: ごうい / Katakana: コンセンサス)",
        usageNote: "Both Kanji 合意 (ごうい) and Katakana コンセンサス (konsensasu) are common in business meetings.",
        priority: 8,
      },
    ],
  },
  {
    key: "software-engineering-ja-vi",
    name: "Software Development & QA (JA → VI)",
    description: "Bộ từ vựng tài liệu kỹ thuật, kiểm thử phần mềm cho các dự án BrSE và Offshore Nhật Bản.",
    category: "IT",
    sourceLanguage: "ja",
    targetLanguage: "vi",
    status: "published",
    isDefault: false,
    updatedAt: "2026-09-29T10:00:00.000Z",
    sampleTerms: [
      {
        term: "仕様書",
        translation: "tài liệu đặc tả yêu cầu",
        context: "Tài liệu mô tả chi tiết chức năng, giao diện và thiết kế hệ thống phần mềm",
        domain: "Engineering",
        partOfSpeech: "noun",
        definition: "System specification document (Kanji: 仕様書 / Hiragana: しようしょ)",
        usageNote: "Kanji: 仕様書, Hiragana đọc: しようしょ (shiyousho). Trong dự án Offshore thường gọi tắt là spec (基本設計書 / 詳細設計書).",
        priority: 9,
      },
      {
        term: "不具合",
        translation: "lỗi phần mềm",
        context: "Khi phát hiện hành vi hệ thống không đúng với spec trong quá trình test",
        domain: "QA & Testing",
        partOfSpeech: "noun",
        definition: "Software defect or malfunction (Kanji: 不具合 / Hiragana: ふぐあい)",
        usageNote: "Kanji: 不具合, Hiragana đọc: ふぐあい (fuguai). Dùng song song với từ mượn Katakana バグ (bagu).",
        priority: 9,
      },
      {
        term: "単体テスト",
        translation: "kiểm thử đơn vị",
        context: "Giai đoạn lập trình viên viết test cho từng hàm hoặc component nhỏ",
        domain: "Testing",
        partOfSpeech: "noun",
        definition: "Unit testing of isolated code components (Kanji + Katakana: 単体テスト / Hiragana: たんたいてすと)",
        usageNote: "Kết hợp Kanji 単体 (たんたい) + Katakana テスト. Thường viết tắt là UT trong báo cáo.",
        priority: 8,
      },
      {
        term: "結合テスト",
        translation: "kiểm thử tích hợp",
        context: "Kiểm thử sự tương tác và luồng dữ liệu giữa các module và API với nhau",
        domain: "Testing",
        partOfSpeech: "noun",
        definition: "Integration testing between software modules (Kanji + Katakana: 結合テスト / Hiragana: けつごうてすと)",
        usageNote: "Kết hợp Kanji 結合 (けつごう) + Katakana テスト. Thường viết tắt là IT trong báo cáo.",
        priority: 8,
      },
      {
        term: "要件定義",
        translation: "xác định yêu cầu bài toán",
        context: "Giai đoạn đầu của dự án khi làm rõ nghiệp vụ và phạm vi với khách hàng",
        domain: "Engineering",
        partOfSpeech: "noun",
        definition: "Requirements definition and scoping (Kanji: 要件定義 / Hiragana: ようけんていぎ)",
        usageNote: "Kanji: 要件定義, Hiragana đọc: ようけんていぎ (youken teigi). Viết tắt RD.",
        priority: 9,
      },
      {
        term: "リリース",
        translation: "phát hành phiên bản",
        context: "Khi triển khai và công bố phiên bản phần mềm mới cho người dùng",
        domain: "DevOps",
        partOfSpeech: "noun",
        definition: "Software version release (Katakana: リリース / rirīsu)",
        usageNote: "Katakana mượn tiếng Anh. Chú ý dấu trường âm ー (chouon). Phân biệt với デプロイ (deploy hạ tầng).",
        priority: 8,
      },
      {
        term: "デプロイ",
        translation: "triển khai hệ thống",
        context: "Đưa mã nguồn đã build lên môi trường máy chủ staging hoặc production",
        domain: "DevOps",
        partOfSpeech: "verb",
        definition: "Deployment to server environment (Katakana: デプロイ / depuroi)",
        usageNote: "Katakana mượn tiếng Anh. Thường gặp: 本番デプロイ (triển khai production), 自動デプロイ (auto-deploy).",
        priority: 9,
      },
      {
        term: "プルリクエスト",
        translation: "yêu cầu hợp nhất mã nguồn (pull request)",
        context: "Khi lập trình viên tạo request để review code trên GitHub/GitLab trước khi merge",
        domain: "Development",
        partOfSpeech: "noun",
        definition: "Pull Request for code review (Katakana: プルリクエスト / puru rikuesuto)",
        usageNote: "Katakana đầy đủ là プルリクエスト, trong giao tiếp hàng ngày thường nói tắt là プルリク (pururiku) hoặc PR.",
        priority: 8,
      },
    ],
  },
  {
    key: "tech-terminology-en-en",
    name: "Monolingual Tech Terminology (EN → EN)",
    description: "Định nghĩa thuật ngữ và chữ viết tắt nội bộ chuyên sâu giúp đồng nhất cách hiểu trong phòng họp.",
    category: "GENERAL",
    sourceLanguage: "en",
    targetLanguage: "en",
    status: "published",
    isDefault: false,
    updatedAt: "2026-09-29T10:00:00.000Z",
    sampleTerms: [
      {
        term: "PR",
        translation: "Pull Request for code review before merging",
        context: "When a developer submits branch changes to be reviewed and merged",
        domain: "Development",
        partOfSpeech: "noun",
        definition: "A method of submitting contributions to an open development project",
        usageNote: "Same-language glossary explains what the term means",
        priority: 8,
      },
      {
        term: "SLA",
        translation: "Service Level Agreement commitment for uptime and response",
        context: "Contractual commitment regarding system availability and support timing",
        domain: "Cloud & Ops",
        partOfSpeech: "noun",
        definition: "A commitment between a service provider and a client",
        usageNote: "High priority in enterprise customer discussions",
        priority: 9,
      },
    ],
  },
  {
    key: "workplace-communication-vi-en",
    name: "Workplace & Remote Meetings (VI → EN)",
    description: "Thuật ngữ báo cáo công việc hàng ngày, trao đổi trong văn phòng và họp từ xa.",
    category: "GENERAL",
    sourceLanguage: "vi",
    targetLanguage: "en",
    status: "published",
    isDefault: false,
    updatedAt: "2026-09-29T10:00:00.000Z",
    sampleTerms: [
      {
        term: "biên bản cuộc họp",
        translation: "meeting minutes",
        context: "Văn bản ghi lại tóm tắt nội dung thảo luận và phân công việc sau cuộc họp",
        domain: "Administration",
        partOfSpeech: "noun",
        definition: "The official written record of a meeting",
        usageNote: "Không dùng meeting report",
        priority: 8,
      },
      {
        term: "bàn giao công việc",
        translation: "handover / handoff",
        context: "Chuyển giao quyền quản lý công việc và tài liệu cho đồng nghiệp",
        domain: "Operations",
        partOfSpeech: "noun",
        definition: "The act of surrendering or delegating tasks to someone else",
        usageNote: "Handover dùng phổ biến trong doanh nghiệp",
        priority: 7,
      },
    ],
  },
  {
    key: "gaming-esports-en-vi",
    name: "Gaming & Esports (EN → VI)",
    description: "Thuật ngữ thi đấu trò chơi điện tử và thể thao điện tử trong livestream và voice chat.",
    category: "GAMING",
    sourceLanguage: "en",
    targetLanguage: "vi",
    status: "published",
    isDefault: false,
    updatedAt: "2026-09-29T10:00:00.000Z",
    sampleTerms: [
      {
        term: "headshot",
        translation: "bắn trúng đầu",
        context: "Trong game bắn súng góc nhìn thứ nhất (FPS)",
        domain: "Shooter",
        partOfSpeech: "noun",
        definition: "A shot that strikes an opponent in the head",
        usageNote: "Gây sát thương chí mạng",
        priority: 7,
      },
      {
        term: "gank",
        translation: "đánh úp / tập kích",
        context: "Khi người chơi di chuyển bất ngờ sang làn đường khác để tiêu diệt đối phương",
        domain: "MOBA",
        partOfSpeech: "verb",
        definition: "An ambush on an unsuspecting player by multiple teammates",
        usageNote: "Thuật ngữ MOBA kinh điển",
        priority: 8,
      },
    ],
  },
];

/**
 * Generates an Excel (.xlsx) Blob for a given glossary template.
 */
export async function generateTemplateXlsx(template: GlossaryTemplateDefinition): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`${template.sourceLanguage.toUpperCase()}-${template.targetLanguage.toUpperCase()}`);

  // Headers
  sheet.columns = [
    { header: "Term", key: "term", width: 22 },
    { header: "Translation", key: "translation", width: 26 },
    { header: "Context", key: "context", width: 35 },
    { header: "Field", key: "domain", width: 18 },
    { header: "Definition", key: "definition", width: 35 },
    { header: "Note", key: "usageNote", width: 25 },
    { header: "Part of speech", key: "partOfSpeech", width: 16 },
    { header: "Priority", key: "priority", width: 12 },
  ];

  // Header styling
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F46E5" }, // Indigo primary color
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 24;

  // Add rows
  for (const item of template.sampleTerms) {
    const row = sheet.addRow({
      term: item.term,
      translation: item.translation,
      context: item.context || "",
      domain: item.domain || "",
      definition: item.definition || "",
      usageNote: item.usageNote || "",
      partOfSpeech: item.partOfSpeech || "",
      priority: item.priority ?? 5,
    });
    row.alignment = { vertical: "middle", wrapText: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Generates a UTF-8 BOM CSV string for a given glossary template.
 */
export function generateTemplateCsv(template: GlossaryTemplateDefinition): string {
  const header = [...GLOSSARY_TEMPLATE_COLUMNS].join(",");
  const rows = template.sampleTerms.map((item) => {
    const cells = [
      item.term,
      item.translation,
      item.context || "",
      item.domain || "",
      item.definition || "",
      item.usageNote || "",
      item.partOfSpeech || "",
      String(item.priority ?? 5),
    ];
    return cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",");
  });

  // UTF-8 BOM prefix
  return "\uFEFF" + [header, ...rows].join("\r\n");
}
