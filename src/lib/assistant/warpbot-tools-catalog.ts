/**
 * WarpBot's BUILT-IN tools, as the /{slug}/tools page lists them.
 *
 * TEMPORARY SOURCE OF TRUTH. The real list is `TOOLS` in warptalk-ai
 * `ai_assistant_worker/chat_tools.py`; this file mirrors it by hand. It will be replaced by
 * `GET /api/v1/assistant/tools` (the worker publishes its manifest, AssistantService serves it),
 * so every row below is already shaped like that contract:
 *
 *   { name, displayName, category, effect, audience, description, details, samplePrompts }
 *
 * When the endpoint lands, delete WARPBOT_BUILT_IN_TOOLS and feed the endpoint's rows to the same
 * helpers. Until then the node test pins the 18 names to the worker's list, so a tool added there
 * and forgotten here fails CI instead of going missing from the page (it already happened once: the
 * first version of this file had 14 and missed every write tool except create_meeting).
 *
 * `continue_in_widget` (TOOLS' last entry) is deliberately absent: it is the meeting-chat →
 * widget handoff, offered only on a meeting-chat turn, not something a member asks for.
 *
 * Copy stays English, like the rest of WarpBot's tool vocabulary (see
 * src/lib/meeting/assistant-tool-labels.ts); only the page chrome around it is translated.
 *
 * Imports are none and the file is plain TypeScript: it runs under `node --test`.
 */

export type WarpBotToolCategory =
  | "meetings"
  | "knowledge"
  | "documents"
  | "glossary"
  | "translation"
  | "workspace"
  | "conversation"
  | "platform";

/** `write` tools create or share something; the page marks them "Changes data". */
export type WarpBotToolEffect = "read" | "write";

/**
 * Who the tool works for. `host`: offered to everyone, but the server only lets a meeting's host
 * complete it. `platform_admin`: answers only for a WarpTalk platform administrator, so the page
 * hides it from everyone else rather than listing a tool that would refuse them.
 */
export type WarpBotToolAudience = "all" | "host" | "platform_admin";

export interface WarpBotBuiltInTool {
  /** The function name the model calls — the id shown in mono under the display name. */
  name: string;
  displayName: string;
  category: WarpBotToolCategory;
  effect: WarpBotToolEffect;
  audience: WarpBotToolAudience;
  /** One line, shown on the collapsed row. */
  description: string;
  /** The longer explanation, shown when the row is expanded. */
  details: string;
  samplePrompts: string[];
}

/** Chip order on the page. `platform` is only offered to platform staff. */
export const WARPBOT_TOOL_CATEGORIES: readonly WarpBotToolCategory[] = [
  "meetings",
  "knowledge",
  "documents",
  "glossary",
  "translation",
  "workspace",
  "conversation",
  "platform",
] as const;

export const WARPBOT_BUILT_IN_TOOLS: readonly WarpBotBuiltInTool[] = [
  // ── Meetings ────────────────────────────────────────────────────────────────────────────
  {
    name: "create_meeting",
    displayName: "Create meeting room",
    category: "meetings",
    effect: "write",
    audience: "all",
    description: "Creates a WarpTalk translation room in this workspace, now, later or on a repeating schedule.",
    details:
      "Sets up a WarpTalk room with a title, meeting type, source language and target languages. It can be a one-off at a set time or a repeating schedule, and can be a follow-up to the meeting in progress. If a detail is missing, WarpBot asks you first. People you name are invited by email, so WarpBot only uses addresses you give it.",
    samplePrompts: [
      "Create a meeting room called Weekly sync tomorrow at 9am, English to Vietnamese",
      "Schedule a follow-up to this meeting next Monday at 2pm",
    ],
  },
  {
    name: "create_action_item",
    displayName: "Save action item",
    category: "meetings",
    effect: "write",
    audience: "all",
    description: "Saves a task to a meeting, with its owner and deadline.",
    details:
      "When you state a task, commitment or to-do, WarpBot saves it as an action item on the meeting instead of only acknowledging it. The task then appears on the meeting's page with its owner and deadline, and WarpBot links to it.",
    samplePrompts: [
      "Action: send the revised quote to the client, owner me, deadline Friday",
      "Add a task for Linh to review the contract by next Wednesday",
    ],
  },
  {
    name: "share_meeting_minutes",
    displayName: "Share meeting minutes",
    category: "meetings",
    effect: "write",
    audience: "host",
    description: "Gives someone access to a meeting's minutes by email and returns the share link.",
    details:
      "Grants a person access to a meeting's minutes and hands you the share link. WarpTalk does not email the link for you: send it yourself.",
    samplePrompts: [
      "Share the minutes of yesterday's board meeting with an@example.com",
    ],
  },
  {
    name: "list_recent_meetings",
    displayName: "List recent meetings",
    category: "meetings",
    effect: "read",
    audience: "all",
    description: "Lists your recent meetings that have ended, optionally by a word in the title.",
    details:
      "Finds your past WarpTalk meetings (ended or cancelled), optionally filtered by a keyword in the title. WarpBot uses it to find the right meeting before reading its summary, details or transcript.",
    samplePrompts: [
      "What meetings did I have this week?",
      "Find my recent meetings about the product launch",
    ],
  },
  {
    name: "get_meeting_summary",
    displayName: "Read meeting summary",
    category: "meetings",
    effect: "read",
    audience: "all",
    description: "Reads the AI summary and action items of a past meeting.",
    details:
      "Returns the summary and action items of a meeting that already has one. Summaries are produced automatically when a meeting's transcript is processed; WarpBot cannot generate one on demand.",
    samplePrompts: [
      "Summarise my last meeting",
      "What were the action items from the sprint review?",
    ],
  },
  {
    name: "get_room_detail",
    displayName: "Read meeting details",
    category: "meetings",
    effect: "read",
    audience: "all",
    description: "Reads a meeting's status, languages, host and schedule.",
    details:
      "Returns the full details of one meeting: its status, languages, host and schedule. It works from the meeting you are looking at, or from one WarpBot found by name.",
    samplePrompts: [
      "Who is hosting this meeting and which languages does it use?",
      "When is the next Weekly sync scheduled?",
    ],
  },
  {
    name: "get_transcript",
    displayName: "Read meeting transcript",
    category: "meetings",
    effect: "read",
    audience: "all",
    description: "Reads what was said in a meeting, by speaker and language.",
    details:
      "Reads transcript segments with speaker, language and text — the most recent ones first, paging back for earlier parts of a long meeting. Use it to ask what someone said, to find a quote, or to recap how the meeting opened.",
    samplePrompts: [
      "What did the client say about the budget in the last meeting?",
      "Quote how the meeting opened",
    ],
  },

  // ── Knowledge ───────────────────────────────────────────────────────────────────────────
  {
    name: "search_facts",
    displayName: "Look up decisions and facts",
    category: "knowledge",
    effect: "read",
    audience: "all",
    description: "Lists the decisions, requirements, commitments and risks recorded in this workspace.",
    details:
      "Lists the knowledge facts extracted from meetings and documents — decisions, requirements, definitions, commitments, risks and references. Best when the question names a kind of fact, such as what was decided or which risks were raised.",
    samplePrompts: [
      "What did we decide about the release date?",
      "Which risks were raised this month?",
    ],
  },
  {
    name: "semantic_search",
    displayName: "Search workspace knowledge",
    category: "knowledge",
    effect: "read",
    audience: "all",
    description: "Searches documents, transcripts, glossaries and facts by meaning, not exact words.",
    details:
      "Searches everything indexed for this workspace — documents, meeting transcripts, glossaries and extracted facts — by meaning. Good for conceptual questions. It can come back empty when nothing relevant has been indexed yet.",
    samplePrompts: [
      "What have we discussed about data retention?",
      "Find anything about onboarding new customers",
    ],
  },

  // ── Documents ───────────────────────────────────────────────────────────────────────────
  {
    name: "search_documents",
    displayName: "Find documents",
    category: "documents",
    effect: "read",
    audience: "all",
    description: "Finds workspace documents by name, or lists what documents exist.",
    details:
      "Finds documents by name, ignoring case, Vietnamese diacritics and punctuation. When no name matches, it falls back to matching the documents' content.",
    samplePrompts: [
      "Which documents do we have about pricing?",
      "Find the bug tracking document",
    ],
  },
  {
    name: "get_document",
    displayName: "Read document",
    category: "documents",
    effect: "read",
    audience: "all",
    description: "Reads a document's details and an excerpt of its text.",
    details:
      "Returns a workspace document's metadata and a text excerpt, so WarpBot can answer questions about it. It works from a document you mention, have open, or that WarpBot found by name.",
    samplePrompts: [
      "What does the onboarding guide say about account setup?",
      "Summarise the latest product spec",
    ],
  },

  // ── Glossary ────────────────────────────────────────────────────────────────────────────
  {
    name: "search_terminology",
    displayName: "Look up a term",
    category: "glossary",
    effect: "read",
    audience: "all",
    description: "Looks up how a term is defined or translated, in your glossary first.",
    details:
      "Searches this workspace's glossary first, then the platform's global glossary of common IT and business terms. Use it to ask what a term means or how it should be translated.",
    samplePrompts: [
      "How do we translate 'deployment pipeline' into Vietnamese?",
      "What does SLA mean in our glossary?",
    ],
  },
  {
    name: "create_glossary",
    displayName: "Create glossary",
    category: "glossary",
    effect: "write",
    audience: "all",
    description: "Creates a new, empty glossary for a source and target language.",
    details:
      "Creates a named glossary for one language pair in this workspace. It needs a name and both languages — WarpBot asks if you did not say them. The glossary starts empty; add terms to it next.",
    samplePrompts: [
      "Create a glossary called Legal terms, English to Japanese",
    ],
  },
  {
    name: "add_glossary_term",
    displayName: "Add glossary term",
    category: "glossary",
    effect: "write",
    audience: "all",
    description: "Saves a term and its preferred translation, so live translation uses it.",
    details:
      "Adds a term and its preferred translation to this workspace's glossary. Live translation uses it from then on.",
    samplePrompts: [
      "Add 'go-live' to our glossary, translated as 'launch day'",
      "Always keep 'sprint' untranslated in live translation",
    ],
  },

  // ── Translation ─────────────────────────────────────────────────────────────────────────
  {
    name: "translate_text",
    displayName: "Translate text",
    category: "translation",
    effect: "read",
    audience: "all",
    description: "Translates a piece of text into another language, right away.",
    details:
      "Translates text you give WarpBot into the language you ask for. Nothing is saved.",
    samplePrompts: [
      "Translate 'We will ship the fix on Friday' into Japanese",
      "Translate this paragraph into Vietnamese",
    ],
  },

  // ── Workspace ───────────────────────────────────────────────────────────────────────────
  {
    name: "search_workspace_members",
    displayName: "Find workspace members",
    category: "workspace",
    effect: "read",
    audience: "all",
    description: "Finds people in this workspace by name or email, with their role.",
    details:
      "Searches this workspace's members by name or email. Use it to ask who is in the workspace, how to reach a teammate, or what their role is.",
    samplePrompts: [
      "Who are the admins of this workspace?",
      "Find Linh's email address",
    ],
  },

  // ── Conversation ────────────────────────────────────────────────────────────────────────
  {
    name: "ask_user",
    displayName: "Ask you a question",
    category: "conversation",
    effect: "read",
    audience: "all",
    description: "Asks you multiple-choice questions when WarpBot needs a detail it does not have.",
    details:
      "Instead of guessing a missing detail — a room's title, languages or type — WarpBot shows a card of up to four multiple-choice questions and waits for your answer. It runs on its own; there is nothing to ask for.",
    samplePrompts: [
      "Set up a meeting room for me",
    ],
  },

  // ── Platform ────────────────────────────────────────────────────────────────────────────
  {
    name: "get_platform_analytics",
    displayName: "Platform analytics",
    category: "platform",
    effect: "read",
    audience: "platform_admin",
    description: "Reads platform-wide figures: workspaces, meetings, revenue, feedback and health.",
    details:
      "Reads the same reports as the admin console — workspace and meeting counts, recurring revenue, feedback ratings, sign-ups and infrastructure health — with your own admin credentials. These are totals across every workspace.",
    samplePrompts: [
      "How many workspaces signed up this month?",
      "What is our monthly recurring revenue?",
    ],
  },
];

/** The tools a viewer may see: platform-admin tools only for platform staff. */
export function visibleBuiltInTools(
  tools: readonly WarpBotBuiltInTool[],
  { isPlatformStaff }: { isPlatformStaff: boolean },
): WarpBotBuiltInTool[] {
  return tools.filter((tool) => tool.audience !== "platform_admin" || isPlatformStaff);
}

/** The category chips a viewer is offered, in page order. */
export function visibleToolCategories({
  isPlatformStaff,
}: {
  isPlatformStaff: boolean;
}): WarpBotToolCategory[] {
  return WARPBOT_TOOL_CATEGORIES.filter((category) => category !== "platform" || isPlatformStaff);
}

/** Lower-cased with diacritics folded, so a Vietnamese query matches with or without its marks. */
export function foldSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

export interface BuiltInToolFilter {
  /** Null for every category. */
  category?: WarpBotToolCategory | null;
  query?: string;
}

/** Category first, then a search over the name, id, descriptions and sample prompts. */
export function filterBuiltInTools(
  tools: readonly WarpBotBuiltInTool[],
  { category = null, query = "" }: BuiltInToolFilter = {},
): WarpBotBuiltInTool[] {
  const needle = foldSearchText(query);
  return tools.filter((tool) => {
    if (category && tool.category !== category) return false;
    if (!needle) return true;
    return [tool.name, tool.displayName, tool.description, tool.details, ...tool.samplePrompts].some(
      (text) => foldSearchText(text).includes(needle),
    );
  });
}
