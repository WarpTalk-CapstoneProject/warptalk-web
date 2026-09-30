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
    shortDescription: "Prompt the user with multiple-choice questions when essential parameters or intent need clarification.",
    detailedDescription:
      "When an action requires missing details (e.g. target languages, schedule time, or room configuration), WarpBot renders an interactive form with selectable options instead of guessing.",
    parametersSummary: ["questions (array of structured questions with title, options, and multi-select setting)"],
    samplePrompts: [
      "Schedule a meeting for tomorrow afternoon but I'm unsure which translation language pair to pick",
      "Set up a design review session for next week",
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
    shortDescription: "Create a live translation meeting room with real-time multilingual captioning and audio.",
    detailedDescription:
      "Automatically sets up a translation room in the active workspace with source and target languages configured, supporting instant, scheduled, or recurring meetings.",
    parametersSummary: [
      "title (meeting room title)",
      "meeting_type (instant, scheduled, recurring)",
      "source_language (host speaking language)",
      "target_languages (array of target translation languages)",
      "scheduled_start_at (optional scheduled start timestamp)",
    ],
    samplePrompts: [
      "Create a 'Sprint Planning' meeting with Vietnamese translated to English today at 2:00 PM",
      "Start an instant 'Global All-Hands' room translating Japanese to Vietnamese and English",
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
    shortDescription: "List recent meetings and active translation rooms across the workspace.",
    detailedDescription:
      "Look up past and ongoing translation rooms that the user has access to, displaying status (active or ended), duration, language configuration, and host information.",
    parametersSummary: ["days (lookback window in days, default 7)", "limit (maximum number of rooms, up to 20)"],
    samplePrompts: [
      "Show me my meetings from the past 7 days",
      "What translation rooms were held recently in this workspace?",
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
    shortDescription: "View detailed configuration, participants, and status for a specific meeting.",
    detailedDescription:
      "Retrieve complete metadata of a Translation Room: room code, host, duration, configured language pairs, and direct join link.",
    parametersSummary: ["room_id (unique meeting room identifier)"],
    samplePrompts: [
      "Get details and settings for the meeting that just finished",
      "Which languages were enabled in the Project Kickoff room?",
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
    shortDescription: "Extract AI-generated meeting minutes, key takeaways, and action items.",
    detailedDescription:
      "Read executive meeting recaps synthesized by the AI Worker from the diarized transcript, including overview, key decisions, and assigned action items.",
    parametersSummary: ["room_id (unique room identifier to retrieve summary for)"],
    samplePrompts: [
      "Give me the summary and key decisions from yesterday's All-Hands meeting",
      "What action items were assigned to the Frontend team in the last session?",
    ],
    iconName: "FileText",
  },
  {
    id: "get_transcript",
    name: "Retrieve Meeting Transcript",
    category: "transcripts",
    categoryLabel: "Transcripts",
    scope: "workspace_members",
    scopeBadge: "Workspace Members",
    isAdminOnly: false,
    shortDescription: "Retrieve timestamped, speaker-diarized transcript segments from a meeting.",
    detailedDescription:
      "Search and inspect exact spoken dialogue in the recorded meeting transcript. Supports keyword queries or filtering by speaker identity.",
    parametersSummary: [
      "room_id (unique meeting room identifier)",
      "search_term (optional keyword query)",
      "speaker_id (optional speaker filter)",
      "limit (maximum transcript segments to return)",
    ],
    samplePrompts: [
      "Did anyone mention 'marketing budget' in the last meeting?",
      "Extract everything Alex said during this morning's call",
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
    shortDescription: "Translate text into target languages honoring workspace tone and terminology.",
    detailedDescription:
      "Neural machine translation adhering to workspace AI usage policies (Translation Tone: Formal or Casual), ensuring fluent syntax and consistent domain glossary terms.",
    parametersSummary: [
      "text (input text to translate)",
      "target_language (target language code, e.g. en, vi, ja, ko)",
      "tone (Casual, Formal, or Default)",
    ],
    samplePrompts: [
      "Translate this message to Japanese with a formal tone: 'We look forward to collaborating with your team.'",
      "Translate this alert to Vietnamese: 'The deployment pipeline has succeeded with zero downtime.'",
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
    shortDescription: "Look up approved terms, definitions, and official translations in the Workspace Glossary.",
    detailedDescription:
      "Search terminology definitions, usage context, and standard translation pairs in the Global and Workspace glossaries approved by administrators.",
    parametersSummary: ["query (term or phrase to search)", "domain (optional industry domain)"],
    samplePrompts: [
      "How is 'Gross Margin' defined in this workspace glossary?",
      "Look up the term 'ASR' in our project terminology database",
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
    shortDescription: "Filter extracted facts, architectural decisions, and risks from past discussions.",
    detailedDescription:
      "Query the workspace knowledge base for structured facts categorized into decisions, risks, agreements, and blockers extracted across translation sessions.",
    parametersSummary: [
      "query (fact search keyword)",
      "category (decisions, risks, agreements, or architecture)",
      "limit (maximum facts to retrieve)",
    ],
    samplePrompts: [
      "What key architectural decisions were approved in the past week?",
      "Find recorded technical risks regarding real-time audio latency",
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
    shortDescription: "Perform deep vector semantic search across documents, transcripts, and notes.",
    detailedDescription:
      "Executes vector similarity search powered by Qdrant beyond exact keywords, connecting user questions with the most relevant conceptual sections across workspace records.",
    parametersSummary: [
      "query (concept, question, or topic to search)",
      "room_id (optional filter to scope to a specific room)",
      "limit (maximum result segments)",
    ],
    samplePrompts: [
      "Find documentation and discussions regarding customer data privacy policies",
      "Where is the server outage escalation procedure documented?",
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
    shortDescription: "Search uploaded files and documents in the workspace knowledge library.",
    detailedDescription:
      "Filter and locate documents by filename, format (PDF, DOCX, TXT), upload date, and AI indexing status for retrieval-augmented generation (RAG).",
    parametersSummary: ["query (document title or content keyword)", "limit (maximum documents to return)"],
    samplePrompts: [
      "Search for the payment and refund policy document",
      "Are there any files related to local development environment setup?",
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
    shortDescription: "Read approved workspace document contents and cited excerpts.",
    detailedDescription:
      "Extracts actual verified text content from uploaded workspace documents (up to 4,000 characters per segment) for grounded answers and citations.",
    parametersSummary: ["document_id (unique document identifier to read)"],
    samplePrompts: [
      "Read the User Guide document and summarize the first 3 onboarding steps",
      "Extract the warranty clause from the service agreement",
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
    shortDescription: "Look up member directory, organizational roles, and contact emails.",
    detailedDescription:
      "Browse and search team members across the workspace by name, email, role (Owner, Admin, Member), and active status to facilitate meeting invites.",
    parametersSummary: ["query (name or email keyword)", "limit (maximum members to return)"],
    samplePrompts: [
      "Who is the Workspace Owner for this organization?",
      "Find the email address for our lead QA engineer",
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
    shortDescription: "Access system-wide tenant, revenue, user growth, and infrastructure health metrics.",
    detailedDescription:
      "Platform Administrator exclusive capability. Queries multi-tenant platform metrics: room activity overview, recurring revenue (MRR/ARR), feedback ratings, user signups, and cluster health (Redis, Qdrant, LiveKit).",
    parametersSummary: [
      "reports (array of reports: overview, revenue, feedback, users, health)",
      "days (metric calculation window in days, default 30)",
    ],
    samplePrompts: [
      "Generate platform metrics for total meetings and subscription revenue over the last 30 days",
      "Check infrastructure health and active streaming pipeline capacity",
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
