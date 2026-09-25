/**
 * What the admin command palette can jump to without asking a server: every admin page, the quick
 * actions, and the ranking that orders them.
 *
 * The workspace app's ⌘K is a room-code box ("Search, or paste a room code"), which means nothing
 * on a platform console. The admin palette answers the questions an operator actually types:
 * a page by name ("hoá đơn", "invoice"), an entity (a workspace, an account, an invoice number),
 * or a verb ("adjust credit").
 *
 * Keywords are data, not UI copy, so they are NOT translated per locale — they are the union of
 * English, Vietnamese and Japanese on purpose. A Vietnamese admin running the English UI still
 * types "tài khoản", and a palette that only understood the active locale would find nothing.
 */

import { bestMatchScore } from "./search-text.ts";

export type AdminPaletteKind = "page" | "action";

export interface AdminPaletteEntry {
  id: string;
  kind: AdminPaletteKind;
  href: string;
  /** Page labels: key under `common.sidebar.adminNav.items`. Actions: key under `adminLists.palette.actions`. */
  labelKey: string;
  keywords: readonly string[];
}

/**
 * Every page in the admin portal, in navigation order.
 *
 * `scripts/check-admin-command-palette-contract.mjs` fails when an admin nav href is missing here,
 * so a page added to the sidebar cannot be left unreachable from the palette.
 */
export const ADMIN_PALETTE_PAGES: readonly AdminPaletteEntry[] = [
  {
    id: "insights",
    kind: "page",
    href: "/admin",
    labelKey: "insights",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "insights", "overview", "dashboard", "home", "metrics", "kpi", "analytics", "profit", "loss", "p&l", "revenue", "growth",
      "tổng quan", "thống kê", "bảng điều khiển", "chỉ số", "lợi nhuận", "doanh thu", "tăng trưởng",
      "概要", "ダッシュボード", "分析", "収益",
    ],
  },
  {
    id: "inbox",
    kind: "page",
    href: "/admin/inbox",
    labelKey: "inbox",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "inbox", "pending", "to do", "todo", "tasks", "queue", "waiting", "work", "assigned", "follow up", "sla",
      "hộp việc", "việc cần xử lý", "việc đang chờ", "công việc", "hàng đợi", "cần làm",
      "受信トレイ", "保留", "タスク", "対応待ち",
    ],
  },
  {
    id: "workspaces",
    kind: "page",
    href: "/admin/workspaces",
    labelKey: "workspaces",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "workspaces", "workspace", "tenant", "tenants", "organization", "organisation", "org", "company", "customer", "customers",
      "không gian làm việc", "tổ chức", "khách hàng", "công ty", "doanh nghiệp",
      "ワークスペース", "組織", "顧客",
    ],
  },
  {
    id: "accounts",
    kind: "page",
    href: "/admin/users",
    labelKey: "accounts",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "accounts", "account", "users", "user", "people", "person", "login", "sign in", "email", "session", "lock", "unlock",
      "tài khoản", "người dùng", "đăng nhập", "phiên", "khoá tài khoản",
      "アカウント", "ユーザー", "ログイン",
    ],
  },
  {
    id: "subscriptions",
    kind: "page",
    href: "/admin/subscriptions",
    labelKey: "subscriptions",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "subscriptions", "subscription", "renewal", "renew", "mrr", "recurring", "trial", "cancel", "change plan",
      "gói đăng ký", "đăng ký", "thuê bao", "gia hạn", "dùng thử", "huỷ gói", "doanh thu định kỳ",
      "サブスクリプション", "契約", "更新", "トライアル",
    ],
  },
  {
    id: "packages",
    kind: "page",
    href: "/admin/packages",
    labelKey: "packages",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "packages", "credit pack", "credit packs", "top-up", "add-on", "add-ons", "addon", "coupon", "coupons",
      "promotion", "promo code", "discount", "campaign",
      "gói credit", "gói bán thêm", "tiện ích bổ sung", "mã giảm giá", "khuyến mãi", "giảm giá",
      "パッケージ", "クレジットパック", "アドオン", "クーポン", "割引",
    ],
  },
  {
    id: "plans",
    kind: "page",
    href: "/admin/plans",
    labelKey: "plansAndPricing",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "plans", "plan", "pricing", "price", "prices", "rate card", "rate cards", "tier", "package", "overage",
      "gói", "gói cước", "bảng giá", "giá", "định giá", "biểu phí",
      "プラン", "料金", "価格",
    ],
  },
  {
    id: "billing",
    kind: "page",
    href: "/admin/billing",
    labelKey: "billingLedger",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "billing", "ledger", "invoice", "invoices", "credit", "credits", "transaction", "transactions", "payment", "payments",
      "top up", "top-up", "refund", "usage alerts", "balance",
      "hoá đơn", "hóa đơn", "sổ cái", "giao dịch", "thanh toán", "tín dụng", "nạp tiền", "số dư", "công nợ", "hoàn tiền",
      "請求", "請求書", "台帳", "取引", "支払い", "クレジット",
    ],
  },
  {
    id: "operatingCosts",
    kind: "page",
    href: "/admin/finance/expenses",
    labelKey: "operatingCosts",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "operating costs", "expenses", "expense", "costs", "opex", "budget", "budgets", "vendors", "receipts", "salaries",
      "servers", "saas", "profit and loss", "p&l", "net result", "finance",
      "chi phí", "chi phí vận hành", "ngân sách", "nhà cung cấp", "hoá đơn chi", "lương", "lãi lỗ", "tài chính",
      "経費", "運営費", "予算", "損益", "財務",
    ],
  },
  {
    id: "salesLeads",
    kind: "page",
    href: "/admin/sales-leads",
    labelKey: "salesLeads",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "sales leads", "sales", "lead", "leads", "inquiry", "inquiries", "enterprise", "contact sales", "deal", "quote", "pipeline",
      "khách hàng tiềm năng", "bán hàng", "liên hệ", "báo giá", "cơ hội",
      "営業", "リード", "問い合わせ", "見積",
    ],
  },
  {
    id: "health",
    kind: "page",
    href: "/admin/health",
    labelKey: "systemHealth",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "system health", "health", "status", "uptime", "monitoring", "grafana", "services", "errors", "outbox", "dead letter", "pipeline",
      "sức khoẻ hệ thống", "sức khỏe", "giám sát", "trạng thái", "lỗi",
      "ヘルス", "監視", "稼働状況",
    ],
  },
  {
    id: "providers",
    kind: "page",
    href: "/admin/providers",
    labelKey: "providers",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "providers", "vendors", "openai", "cartesia", "livekit", "stripe", "cost", "usage", "uptime", "quota", "rate limit", "api",
      "nhà cung cấp", "chi phí", "mức dùng", "hạn mức",
      "プロバイダー", "コスト", "使用量", "稼働率",
    ],
  },
  {
    id: "feedback",
    kind: "page",
    href: "/admin/feedback",
    labelKey: "feedback",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "feedback", "rating", "ratings", "review", "survey", "comments", "nps", "satisfaction",
      "phản hồi", "đánh giá", "góp ý", "bình luận", "khảo sát",
      "フィードバック", "評価", "コメント",
    ],
  },
  {
    id: "audit",
    kind: "page",
    href: "/admin/audit",
    labelKey: "auditLog",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "audit log", "audit", "log", "logs", "history", "trail", "activity", "who did",
      "nhật ký", "kiểm toán", "lịch sử", "hoạt động",
      "監査ログ", "監査", "履歴",
    ],
  },
  {
    id: "announcements",
    kind: "page",
    href: "/admin/announcements",
    labelKey: "announcements",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "announcements", "announcement", "broadcast", "news", "banner", "notice", "release notes",
      "thông báo", "tin tức", "bản tin",
      "お知らせ", "告知",
    ],
  },
  {
    id: "emailTemplates",
    kind: "page",
    href: "/admin/email-templates",
    labelKey: "emailTemplates",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "email templates", "email", "emails", "template", "templates", "mail",
      "mẫu email", "thư điện tử", "mẫu thư",
      "メールテンプレート", "メール",
    ],
  },
  {
    id: "settings",
    kind: "page",
    href: "/admin/settings",
    labelKey: "platformSettings",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "platform settings", "settings", "config", "configuration", "fx", "exchange rate", "currency", "languages", "stripe",
      "maintenance", "feature flags", "flags", "kill switch", "security", "session", "password policy", "rate limit",
      "integrations", "retention", "vat",
      "cài đặt", "cấu hình", "tỷ giá", "tiền tệ", "ngôn ngữ", "bảo trì", "cờ tính năng", "bảo mật", "tích hợp", "lưu trữ dữ liệu",
      "設定", "構成", "為替", "メンテナンス", "機能フラグ", "セキュリティ", "連携",
    ],
  },
  {
    id: "plugins",
    kind: "page",
    href: "/admin/plugins",
    labelKey: "plugins",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "plugins", "plugin", "integration", "integrations", "app", "apps", "connector", "marketplace", "oauth",
      "tiện ích", "tích hợp", "tiện ích mở rộng", "kết nối",
      "プラグイン", "連携", "統合",
    ],
  },
  {
    id: "globalGlossary",
    kind: "page",
    href: "/admin/global-glossary",
    labelKey: "globalGlossary",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "global glossary", "glossary", "term", "terms", "terminology", "dictionary", "translation memory",
      "thuật ngữ", "từ điển", "bảng thuật ngữ", "từ vựng",
      "用語集", "用語", "辞書",
    ],
  },
  {
    id: "staff",
    kind: "page",
    href: "/admin/staff",
    labelKey: "staff",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "staff", "team", "employees", "admins", "operators", "invite staff", "suspend staff", "who has access",
      "nhân sự", "nhân viên", "quản trị viên", "đội ngũ", "mời nhân viên",
      "スタッフ", "社員", "管理者",
    ],
  },
  {
    id: "roles",
    kind: "page",
    href: "/admin/roles",
    labelKey: "roles",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "roles", "role", "permissions", "permission", "rbac", "access control", "who has this permission",
      "vai trò", "phân quyền", "quyền", "quyền hạn",
      "ロール", "権限", "アクセス制御",
    ],
  },
];

/**
 * Verbs. Each one lands on the page that owns the action with an `action=` intent the page reads
 * once and then removes, so a reload does not reopen the dialog.
 */
export const ADMIN_PALETTE_ACTIONS: readonly AdminPaletteEntry[] = [
  {
    id: "myInbox",
    kind: "action",
    href: "/admin/inbox?scope=mine",
    labelKey: "myInbox",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["my inbox", "assigned to me", "my tasks", "việc của tôi", "giao cho tôi", "自分の担当"],
  },
  {
    id: "recordExpense",
    kind: "action",
    href: "/admin/finance/expenses?action=record-expense",
    labelKey: "recordExpense",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["record expense", "add expense", "new expense", "log cost", "ghi chi phí", "thêm chi phí", "経費登録"],
  },
  {
    id: "importExpenses",
    kind: "action",
    href: "/admin/finance/expenses?tab=import",
    labelKey: "importExpenses",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["import expenses", "upload csv", "expense csv", "nhập chi phí", "nhập csv", "経費インポート"],
  },
  {
    id: "adjustCredit",
    kind: "action",
    href: "/admin/billing?action=adjust-credit",
    labelKey: "adjustCredit",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "adjust credit", "add credit", "grant credits", "top up", "refund credits", "credit adjustment",
      "điều chỉnh tín dụng", "cộng tín dụng", "nạp tín dụng", "tặng tín dụng",
      "クレジット調整",
    ],
  },
  {
    id: "createPlan",
    kind: "action",
    href: "/admin/plans?action=create-plan",
    labelKey: "createPlan",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["create plan", "new plan", "add plan", "tạo gói", "thêm gói", "gói mới", "プラン作成"],
  },
  {
    id: "createCreditPack",
    kind: "action",
    href: "/admin/packages?action=create-credit-pack",
    labelKey: "createCreditPack",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["create credit pack", "new credit pack", "new pack", "tạo gói credit", "gói credit mới", "クレジットパック作成"],
  },
  {
    id: "createCoupon",
    kind: "action",
    href: "/admin/packages?action=create-coupon",
    labelKey: "createCoupon",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["create coupon", "new coupon", "promo code", "discount code", "tạo mã giảm giá", "mã khuyến mãi", "クーポン作成"],
  },
  {
    id: "composeAnnouncement",
    kind: "action",
    // The announcements CMS (#577) owns this route: `posts/new` opens its composer.
    href: "/admin/announcements/posts/new",
    labelKey: "composeAnnouncement",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: [
      "compose announcement", "new announcement", "broadcast", "send announcement", "post",
      "soạn thông báo", "tạo thông báo", "gửi thông báo",
      "お知らせ作成",
    ],
  },
  {
    id: "addPlugin",
    kind: "action",
    href: "/admin/plugins?action=create",
    labelKey: "addPlugin",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["add plugin", "new plugin", "create plugin", "thêm plugin", "tạo tiện ích", "プラグイン追加"],
  },
  {
    id: "addGlossaryTerm",
    kind: "action",
    href: "/admin/global-glossary?action=create",
    labelKey: "addGlossaryTerm",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["add term", "new term", "glossary term", "thêm thuật ngữ", "tạo thuật ngữ", "用語追加"],
  },
  {
    id: "importGlossary",
    kind: "action",
    href: "/admin/global-glossary?action=import",
    labelKey: "importGlossary",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["import glossary", "bulk import", "csv", "nhập thuật ngữ", "nhập csv", "一括インポート"],
  },
  {
    id: "exportLedger",
    kind: "action",
    href: "/admin/billing?action=export",
    labelKey: "exportLedger",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["export ledger", "export", "excel", "xlsx", "report", "xuất sổ cái", "xuất báo cáo", "エクスポート"],
  },
  {
    id: "suspendedWorkspaces",
    kind: "action",
    href: "/admin/workspaces?status=suspended",
    labelKey: "suspendedWorkspaces",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["suspended workspaces", "suspended", "tạm ngưng", "bị đình chỉ", "停止中"],
  },
  {
    id: "lockedAccounts",
    kind: "action",
    href: "/admin/users?status=locked",
    labelKey: "lockedAccounts",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["locked accounts", "locked", "lockout", "tài khoản bị khoá", "bị khóa", "ロック"],
  },
  {
    id: "newSalesLeads",
    kind: "action",
    href: "/admin/sales-leads?status=new",
    labelKey: "newSalesLeads",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["new leads", "new sales leads", "untriaged", "khách hàng mới", "lead mới", "新規リード"],
  },
  {
    id: "inviteStaff",
    kind: "action",
    href: "/admin/staff?action=invite",
    labelKey: "inviteStaff",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["invite staff", "add staff", "new admin", "add admin", "mời nhân viên", "thêm nhân viên", "スタッフ招待"],
  },
  {
    id: "createRole",
    kind: "action",
    href: "/admin/roles?action=create",
    labelKey: "createRole",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["create role", "new role", "custom role", "tạo vai trò", "vai trò mới", "ロール作成"],
  },
  {
    id: "changedPlatformSettings",
    kind: "action",
    href: "/admin/settings?changed=1",
    labelKey: "changedPlatformSettings",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["changed settings", "overridden settings", "non-default", "cài đặt đã đổi", "khác mặc định", "変更された設定"],
  },
  {
    id: "exportPlatformSettings",
    kind: "action",
    href: "/admin/settings?action=export",
    labelKey: "exportPlatformSettings",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["export settings", "backup settings", "settings json", "xuất cài đặt", "sao lưu cấu hình", "設定エクスポート"],
  },
  {
    id: "importPlatformSettings",
    kind: "action",
    href: "/admin/settings?action=import",
    labelKey: "importPlatformSettings",
    // i18n-allow: search synonyms, matched in every language whatever the UI locale.
    keywords: ["import settings", "restore settings", "settings json", "nhập cài đặt", "khôi phục cấu hình", "設定インポート"],
  },
];

export interface RankedEntry {
  entry: AdminPaletteEntry;
  score: number;
}

/**
 * Pages and actions that match `query`, best first. The visible label counts double against a
 * keyword, so typing a page's own name always puts that page first.
 */
export function rankPaletteEntries(
  query: string,
  entries: readonly AdminPaletteEntry[],
  labelOf: (entry: AdminPaletteEntry) => string,
): RankedEntry[] {
  const ranked: RankedEntry[] = [];
  entries.forEach((entry) => {
    const labelScore = bestMatchScore(query, [labelOf(entry)]) * 2;
    const keywordScore = bestMatchScore(query, entry.keywords);
    const score = Math.max(labelScore, keywordScore);
    if (score > 0) ranked.push({ entry, score });
  });
  return ranked
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ entry, score }) => ({ entry, score }));
}

// ───────────────────────────── recent items ─────────────────────────────

export type AdminRecentKind =
  | "page"
  | "action"
  | "workspace"
  | "account"
  | "plan"
  | "plugin"
  | "invoice"
  | "ledger"
  | "salesLead"
  | "feedback"
  | "glossaryTerm"
  | "setting";

export interface AdminRecentItem {
  kind: AdminRecentKind;
  href: string;
  label: string;
  /** A second line: an email, a slug, an invoice total. */
  detail?: string;
}

export const ADMIN_RECENT_LIMIT = 8;
export const ADMIN_RECENT_STORAGE_KEY = "warptalk.admin.palette.recent.v1";

/** Puts `item` first, drops an older copy of the same destination, and caps the list. */
export function pushRecent(
  list: readonly AdminRecentItem[],
  item: AdminRecentItem,
  limit = ADMIN_RECENT_LIMIT,
): AdminRecentItem[] {
  return [item, ...list.filter((existing) => existing.href !== item.href)].slice(0, limit);
}

/** Reads a stored list, discarding anything malformed rather than throwing on it. */
export function parseRecent(raw: string | null): AdminRecentItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is AdminRecentItem =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as AdminRecentItem).href === "string" &&
          (item as AdminRecentItem).href.startsWith("/admin") &&
          typeof (item as AdminRecentItem).label === "string" &&
          typeof (item as AdminRecentItem).kind === "string",
      )
      .slice(0, ADMIN_RECENT_LIMIT);
  } catch {
    return [];
  }
}

/** The admin list page a free-text query can be handed to as `?q=`, for "Search X for …" rows. */
export const ADMIN_SEARCHABLE_LISTS: readonly { id: string; href: string; labelKey: string }[] = [
  { id: "workspaces", href: "/admin/workspaces", labelKey: "workspaces" },
  { id: "accounts", href: "/admin/users", labelKey: "accounts" },
  { id: "billing", href: "/admin/billing", labelKey: "billingLedger" },
  { id: "salesLeads", href: "/admin/sales-leads", labelKey: "salesLeads" },
  { id: "feedback", href: "/admin/feedback", labelKey: "feedback" },
  { id: "globalGlossary", href: "/admin/global-glossary", labelKey: "globalGlossary" },
  { id: "plugins", href: "/admin/plugins", labelKey: "plugins" },
  { id: "staff", href: "/admin/staff", labelKey: "staff" },
  { id: "inbox", href: "/admin/inbox", labelKey: "inbox" },
  { id: "operatingCosts", href: "/admin/finance/expenses", labelKey: "operatingCosts" },
];

export function listSearchHref(href: string, query: string): string {
  const [path, existing] = href.split("?");
  const params = new URLSearchParams(existing ?? "");
  params.set("q", query.trim());
  return `${path}?${params.toString()}`;
}
