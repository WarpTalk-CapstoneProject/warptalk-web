export type ToolScope = "all_users" | "workspace_members" | "platform_admin";

export type ToolCategory =
  | "all"
  | "meetings"
  | "transcripts"
  | "knowledge"
  | "documents"
  | "translation"
  | "members"
  | "interactive"
  | "analytics";

export interface ToolCategoryMeta {
  id: ToolCategory;
  label: string;
  badge: string;
  iconName: string;
}

export interface WarpBotToolItem {
  id: string;
  name: string;
  category: Exclude<ToolCategory, "all">;
  categoryLabel: string;
  scope: ToolScope;
  scopeBadge: string;
  isAdminOnly: boolean;
  shortDescription: string;
  detailedDescription: string;
  parametersSummary: string[];
  samplePrompts: string[];
  iconName: string;
}

export const TOOL_CATEGORIES: readonly ToolCategoryMeta[] = [
  { id: "all", label: "All Tools", badge: "14", iconName: "SquaresFour" },
  { id: "meetings", label: "Meetings", badge: "4", iconName: "VideoCamera" },
  { id: "transcripts", label: "Transcripts", badge: "1", iconName: "ChatsCircle" },
  { id: "knowledge", label: "Knowledge & Facts", badge: "3", iconName: "BookOpen" },
  { id: "documents", label: "Documents", badge: "2", iconName: "FileText" },
  { id: "translation", label: "Instant Translation", badge: "1", iconName: "Translate" },
  { id: "members", label: "Workspace & Directory", badge: "1", iconName: "Users" },
  { id: "interactive", label: "Interactive Clarification", badge: "1", iconName: "Brain" },
  { id: "analytics", label: "Platform Analytics", badge: "1", iconName: "ChartBar" },
] as const;

export const WARPBOT_TOOLS_CATALOG: readonly WarpBotToolItem[] = [
  {
    id: "ask_user",
    name: "Multi-choice Inquiry",
    category: "interactive",
    categoryLabel: "Interactive Clarification",
    scope: "all_users",
    scopeBadge: "All Users",
    isAdminOnly: false,
    shortDescription: "Tự động hỏi thêm lựa chọn khi thiếu dữ liệu đầu vào hoặc cần làm rõ yêu cầu phức tạp.",
    detailedDescription:
      "Khi người dùng yêu cầu tạo cuộc họp hoặc thao tác mà chưa cung cấp đủ tham số thiết yếu (như ngôn ngữ đích, thời gian, loại phòng), WarpBot sẽ tạo một Interactive Form với các options để người dùng click chọn trực tiếp thay vì đoán mò.",
    parametersSummary: ["questions (mảng câu hỏi kèm tiêu đề và danh sách options)"],
    samplePrompts: [
      "Tạo giúp tôi phòng họp ngày mai lúc 3h chiều nhưng tôi chưa rõ nên chọn ngôn ngữ nào",
      "Lên lịch họp thảo luận thiết kế hệ thống tuần tới",
    ],
    iconName: "Brain",
  },
  {
    id: "create_meeting",
    name: "Create Meeting Room",
    category: "meetings",
    categoryLabel: "Meetings",
    scope: "workspace_members",
    scopeBadge: "Workspace Members",
    isAdminOnly: false,
    shortDescription: "Tạo phòng họp trực tuyến với cấu hình dịch đa ngôn ngữ theo thời gian thực.",
    detailedDescription:
      "Tự động khởi tạo phòng dịch thuật trong workspace hiện tại với đầy đủ cấu hình ngôn ngữ nói (source language) và ngôn ngữ nghe (target languages), kèm lịch hẹn hoặc kích hoạt ngay.",
    parametersSummary: [
      "title (tên cuộc họp)",
      "meeting_type (instant, scheduled, recurring)",
      "source_language (ngôn ngữ gốc)",
      "target_languages (danh sách ngôn ngữ dịch đích)",
      "scheduled_start_at (thời điểm bắt đầu)",
    ],
    samplePrompts: [
      "Tạo giúp tôi phòng họp 'Sprint Planning' tiếng Việt dịch sang tiếng Anh lúc 14:00 hôm nay",
      "Tạo phòng họp 'Global All-Hands' tiếng Nhật dịch sang tiếng Việt và tiếng Anh ngay bây giờ",
    ],
    iconName: "VideoCamera",
  },
  {
    id: "list_recent_meetings",
    name: "List Recent Meetings",
    category: "meetings",
    categoryLabel: "Meetings",
    scope: "workspace_members",
    scopeBadge: "Workspace Members",
    isAdminOnly: false,
    shortDescription: "Liệt kê danh sách các cuộc họp đã diễn ra gần đây trong workspace.",
    detailedDescription:
      "Tra cứu lịch sử các phòng họp mà thành viên có quyền truy cập, hiển thị trạng thái (ended, active), thời gian diễn ra và người chủ trì (host).",
    parametersSummary: ["days (số ngày nhìn lại, mặc định 7)", "limit (số lượng cuộc họp tối đa, tối đa 20)"],
    samplePrompts: [
      "Liệt kê các cuộc họp trong tuần qua của tôi",
      "Gần đây workspace đã tổ chức những cuộc họp nào?",
    ],
    iconName: "CalendarBlank",
  },
  {
    id: "get_room_detail",
    name: "Meeting Details & Configuration",
    category: "meetings",
    categoryLabel: "Meetings",
    scope: "workspace_members",
    scopeBadge: "Workspace Members",
    isAdminOnly: false,
    shortDescription: "Xem cấu hình chi tiết, danh sách người tham gia và trạng thái của một phòng họp.",
    detailedDescription:
      "Truy xuất metadata chi tiết của một Translation Room: mã phòng (code), host, thời lượng, danh sách cặp ngôn ngữ dịch thuật, và link truy cập phòng.",
    parametersSummary: ["room_id (mã định danh phòng họp)"],
    samplePrompts: [
      "Xem chi tiết thông tin và cấu hình phòng họp vừa kết thúc",
      "Phòng họp Kickoff Project được thiết lập những ngôn ngữ nào?",
    ],
    iconName: "Info",
  },
  {
    id: "get_meeting_summary",
    name: "Meeting AI Summary & Action Items",
    category: "meetings",
    categoryLabel: "Meetings",
    scope: "workspace_members",
    scopeBadge: "Workspace Members",
    isAdminOnly: false,
    shortDescription: "Trích xuất biên bản tóm tắt AI, quyết định cốt lõi và danh sách hành động cần làm.",
    detailedDescription:
      "Đọc biên bản họp được tự động tổng hợp bởi AI Worker từ transcript ghi âm, bao gồm Overview, Key Takeaways, Action Items phân chia theo người chịu trách nhiệm.",
    parametersSummary: ["room_id (mã phòng cần lấy summary)"],
    samplePrompts: [
      "Cho tôi xem tóm tắt cuộc họp All-Hands hôm qua",
      "Có những action items nào được giao cho team Frontend trong buổi họp vừa rồi?",
    ],
    iconName: "FileCheck",
  },
  {
    id: "get_transcript",
    name: "Retrieve Meeting Transcript",
    category: "transcripts",
    categoryLabel: "Transcripts",
    scope: "workspace_members",
    scopeBadge: "Workspace Members",
    isAdminOnly: false,
    shortDescription: "Truy vấn và trích xuất lời thoại chính xác theo từng mốc thời gian và người nói.",
    detailedDescription:
      "Lục tìm từng câu nói trong bản ghi âm phân tách người nói (diarized transcript). Hỗ trợ tìm kiếm theo từ khóa hoặc lọc theo từng người tham gia trong cuộc họp.",
    parametersSummary: [
      "room_id (mã phòng)",
      "search_term (từ khóa cần tìm trong lời thoại)",
      "speaker_id (người phát biểu)",
      "limit (số đoạn tối đa)",
    ],
    samplePrompts: [
      "Ai đã nhắc đến từ khóa 'ngân sách marketing' trong buổi họp trước?",
      "Trích xuất những gì anh Tú đã phát biểu trong cuộc họp sáng nay",
    ],
    iconName: "ChatsCircle",
  },
  {
    id: "translate_text",
    name: "Instant Neural Translation",
    category: "translation",
    categoryLabel: "Instant Translation",
    scope: "all_users",
    scopeBadge: "All Users",
    isAdminOnly: false,
    shortDescription: "Dịch nhanh văn bản sang ngôn ngữ đích theo phong cách và thuật ngữ workspace.",
    detailedDescription:
      "Công cụ dịch tức thì áp dụng AiUsagePolicy của workspace (Translation Tone & Honorific Style: Formal/Casual), đảm bảo câu chữ tự nhiên và giữ đúng thuật ngữ chuyên ngành.",
    parametersSummary: [
      "text (đoạn văn bản cần dịch)",
      "target_language (ngôn ngữ đích: en, vi, ja, ko, zh...)",
      "tone (Casual, Formal, Default)",
    ],
    samplePrompts: [
      "Dịch đoạn sau sang tiếng Nhật với văn phong trang trọng: 'Chúng tôi rất hân hạnh được hợp tác cùng quý đối tác.'",
      "Translate this message to Vietnamese: 'The deployment pipeline has succeeded with zero downtime.'",
    ],
    iconName: "Translate",
  },
  {
    id: "search_terminology",
    name: "Search Workspace Glossary",
    category: "knowledge",
    categoryLabel: "Knowledge & Facts",
    scope: "workspace_members",
    scopeBadge: "Workspace Members",
    isAdminOnly: false,
    shortDescription: "Tra cứu định nghĩa thuật ngữ nội bộ và bảng dịch chuẩn trong Glossary.",
    detailedDescription:
      "Tìm kiếm định nghĩa, ngữ cảnh sử dụng và bản dịch chuẩn của các thuật ngữ chuyên ngành trong Global Glossary và Workspace Glossary đã được phê duyệt.",
    parametersSummary: ["query (từ hoặc cụm từ cần tra cứu)", "domain (lĩnh vực chuyên môn)"],
    samplePrompts: [
      "Thuật ngữ 'Gross Margin' trong workspace này được định nghĩa thế nào?",
      "Kiểm tra thuật ngữ 'ASR' trong từ điển chuyên ngành của dự án",
    ],
    iconName: "BookOpen",
  },
  {
    id: "search_facts",
    name: "Search Extracted Facts & Decisions",
    category: "knowledge",
    categoryLabel: "Knowledge & Facts",
    scope: "workspace_members",
    scopeBadge: "Workspace Members",
    isAdminOnly: false,
    shortDescription: "Lọc các sự thật, quyết định và rủi ro đã được trích xuất từ các cuộc thảo luận.",
    detailedDescription:
      "Truy vấn kho tri thức facts của workspace đã được phân loại theo danh mục: decisions (quyết định), risks (rủi ro), agreements (thỏa thuận), blockers (rào cản).",
    parametersSummary: [
      "query (từ khóa sự thật)",
      "category (decisions, risks, agreements, architecture)",
      "limit (số lượng facts tối đa)",
    ],
    samplePrompts: [
      "Có những quyết định (decisions) nào quan trọng được đưa ra trong tuần qua?",
      "Tìm các rủi ro kỹ thuật đã được ghi nhận liên quan đến độ trễ âm thanh",
    ],
    iconName: "Lightbulb",
  },
  {
    id: "semantic_search",
    name: "Deep Semantic Vector Search",
    category: "knowledge",
    categoryLabel: "Knowledge & Facts",
    scope: "workspace_members",
    scopeBadge: "Workspace Members",
    isAdminOnly: false,
    shortDescription: "Tìm kiếm vector thông minh đa nguồn trên tài liệu, transcript và ghi chú.",
    detailedDescription:
      "Thực hiện tìm kiếm ngữ nghĩa sâu (Qdrant semantic search) không phụ thuộc vào từ khóa chính xác, giúp kết nối câu hỏi của người dùng với các tài liệu và đoạn hội thoại liên quan mật thiết nhất.",
    parametersSummary: [
      "query (câu hỏi hoặc ý niệm cần tìm)",
      "room_id (tùy chọn: thu hẹp trong 1 phòng cụ thể)",
      "limit (số đoạn kết quả tối đa)",
    ],
    samplePrompts: [
      "Tìm tài liệu và thảo luận nói về chính sách bảo vệ dữ liệu cá nhân khách hàng",
      "Quy trình xử lý sự cố máy chủ khi mất kết nối mạng được ghi ở đâu?",
    ],
    iconName: "MagnifyingGlassPlus",
  },
  {
    id: "search_documents",
    name: "Search Workspace Documents",
    category: "documents",
    categoryLabel: "Documents",
    scope: "workspace_members",
    scopeBadge: "Workspace Members",
    isAdminOnly: false,
    shortDescription: "Tìm kiếm danh sách tài liệu được lưu trữ trong thư viện workspace.",
    detailedDescription:
      "Tìm kiếm theo tên file, định dạng (PDF, DOCX, TXT), ngày tải lên và trạng thái AI indexing (được phép đưa vào RAG hay không) của các tài liệu trong workspace.",
    parametersSummary: ["query (tên tài liệu hoặc từ khóa tiêu đề)", "limit (số tài liệu tối đa)"],
    samplePrompts: [
      "Tìm tài liệu về chính sách thanh toán và hoàn tiền",
      "Trong workspace có file nào liên quan đến hướng dẫn cài đặt môi trường không?",
    ],
    iconName: "FileText",
  },
  {
    id: "get_document",
    name: "Document Content Reader",
    category: "documents",
    categoryLabel: "Documents",
    scope: "workspace_members",
    scopeBadge: "Workspace Members",
    isAdminOnly: false,
    shortDescription: "Đọc nội dung và trích đoạn cụ thể từ tài liệu workspace đã được phê duyệt.",
    detailedDescription:
      "Trích xuất nội dung văn bản thực tế của tài liệu (tối đa 4000 ký tự mỗi trích đoạn) để WarpBot trả lời câu hỏi trực tiếp dựa trên nội dung nguồn đáng tin cậy.",
    parametersSummary: ["document_id (mã định danh tài liệu cần đọc)"],
    samplePrompts: [
      "Đọc nội dung tài liệu Hướng dẫn sử dụng và tóm tắt 3 bước đầu tiên",
      "Trích xuất điều khoản bảo hành từ tài liệu hợp đồng",
    ],
    iconName: "FileMagnifyingGlass",
  },
  {
    id: "search_workspace_members",
    name: "Workspace Member Directory",
    category: "members",
    categoryLabel: "Workspace & Directory",
    scope: "workspace_members",
    scopeBadge: "Workspace Members",
    isAdminOnly: false,
    shortDescription: "Tra cứu thông tin, chức vụ, vai trò và địa chỉ liên lạc của thành viên.",
    detailedDescription:
      "Tìm kiếm danh bạ thành viên trong workspace: Họ tên, email, vai trò (Owner, Admin, Member), trạng thái tham gia, giúp WarpBot gợi ý người phù hợp khi tạo lịch họp.",
    parametersSummary: ["query (tên hoặc email thành viên)", "limit (số lượng tối đa)"],
    samplePrompts: [
      "Ai là người giữ vai trò Workspace Owner trong tổ chức này?",
      "Tìm email của bạn phụ trách kiểm thử phần mềm",
    ],
    iconName: "Users",
  },
  {
    id: "get_platform_analytics",
    name: "Platform Analytics & Health",
    category: "analytics",
    categoryLabel: "Platform Analytics",
    scope: "platform_admin",
    scopeBadge: "Platform Admin Only",
    isAdminOnly: true,
    shortDescription: "Báo cáo doanh thu, số lượng người dùng, phòng họp và sức khỏe hệ thống toàn sàn.",
    detailedDescription:
      "Công cụ độc quyền cấp quản trị nền tảng (Platform / System Administrator). Đọc trực tiếp các báo cáo quản trị toàn hệ thống: overview (tổng quan phòng họp & tenant), revenue (doanh thu định kỳ MRR/ARR), feedback (đánh giá hài lòng), users (người dùng mới), health (tình trạng hạ tầng Redis, Qdrant, LiveKit).",
    parametersSummary: [
      "reports (danh sách báo cáo: overview, revenue, feedback, users, health)",
      "days (khoảng thời gian tính toán ngày, mặc định 30)",
    ],
    samplePrompts: [
      "Báo cáo tổng quan số lượng phòng họp và doanh thu toàn sàn trong 30 ngày qua",
      "Kiểm tra tình trạng sức khỏe hạ tầng hệ thống và các pipeline đang chạy",
    ],
    iconName: "ChartBar",
  },
] as const;

/**
 * Filter tools based on category and optional text search query.
 */
export function filterWarpBotTools(
  tools: readonly WarpBotToolItem[],
  options: {
    category?: ToolCategory;
    searchQuery?: string;
    scopeFilter?: "all" | "workspace_only" | "admin_only";
  } = {},
): WarpBotToolItem[] {
  const { category = "all", searchQuery = "", scopeFilter = "all" } = options;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return tools.filter((tool) => {
    // 1. Category check
    if (category !== "all" && tool.category !== category) {
      return false;
    }

    // 2. Scope check
    if (scopeFilter === "admin_only" && !tool.isAdminOnly) {
      return false;
    }
    if (scopeFilter === "workspace_only" && tool.isAdminOnly) {
      return false;
    }

    // 3. Search query check
    if (!normalizedQuery) {
      return true;
    }

    const matchesName = tool.name.toLowerCase().includes(normalizedQuery);
    const matchesId = tool.id.toLowerCase().includes(normalizedQuery);
    const matchesDesc = tool.shortDescription.toLowerCase().includes(normalizedQuery);
    const matchesCategory = tool.categoryLabel.toLowerCase().includes(normalizedQuery);
    const matchesPrompts = tool.samplePrompts.some((p) => p.toLowerCase().includes(normalizedQuery));

    return matchesName || matchesId || matchesDesc || matchesCategory || matchesPrompts;
  });
}

/**
 * Summary statistics of the catalog.
 */
export function getWarpBotToolsStats(tools: readonly WarpBotToolItem[] = WARPBOT_TOOLS_CATALOG) {
  const total = tools.length;
  const adminOnlyCount = tools.filter((t) => t.isAdminOnly).length;
  const workspaceCount = total - adminOnlyCount;
  const categoriesCount = new Set(tools.map((t) => t.category)).size;

  return {
    total,
    adminOnlyCount,
    workspaceCount,
    categoriesCount,
  };
}
