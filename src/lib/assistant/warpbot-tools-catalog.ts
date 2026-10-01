/**
 * Presentation copy and category metadata for WarpBot's BUILT-IN tools on /{slug}/tools.
 *
 * NOT THE LIST OF WHAT EXISTS. That comes from `GET /api/v1/assistant/tools` (`builtIn`): the AI
 * worker publishes its real tool registry to Redis and AssistantService serves it, already filtered
 * for the caller (`platform_staff` tools reach platform staff only). This file only dresses those
 * rows: a human display name, a longer explanation and sample prompts, keyed by tool `name`.
 *
 *   - A tool this file has no copy for is still listed: its name humanised plus the manifest's own
 *     description, no sample prompts. No row is ever hidden because it lacks copy.
 *   - Copy for a tool the worker no longer has is simply never used.
 *   - When the manifest is unavailable the page says so; it never falls back to this file as if it
 *     were the truth.
 *
 * Copy stays English, like the rest of WarpBot's tool vocabulary (see
 * src/lib/meeting/assistant-tool-labels.ts); only the page chrome around it is translated.
 *
 * Imports are type-only and relative: this file runs under plain `node --test`.
 */

import type {
  WarpBotBuiltInToolDto,
  WarpBotToolAudience,
  WarpBotToolEffect,
} from "../../types/assistant.ts";

export type { WarpBotToolAudience, WarpBotToolEffect };

export type WarpBotToolCategory =
  | "meetings"
  | "knowledge"
  | "documents"
  | "glossary"
  | "translation"
  | "workspace"
  | "conversation"
  | "platform"
  | "other";

/** Chip order on the page. A chip is offered only when at least one listed tool is in it. */
export const WARPBOT_TOOL_CATEGORIES: readonly WarpBotToolCategory[] = [
  "meetings",
  "knowledge",
  "documents",
  "glossary",
  "translation",
  "workspace",
  "conversation",
  "platform",
  "other",
] as const;

export interface WarpBotToolCopy {
  displayName: string;
  /** One line, shown on the collapsed row. */
  description: string;
  /** The longer explanation, shown when the row is expanded. */
  details: string;
  samplePrompts: string[];
}

/** A built-in tool as the page draws it: a manifest row plus its copy (or a fallback). */
export interface WarpBotBuiltInTool {
  /** The function name the model calls — the id shown in mono under the display name. */
  name: string;
  displayName: string;
  category: WarpBotToolCategory;
  effect: WarpBotToolEffect;
  audience: WarpBotToolAudience;
  description: string;
  /** Empty when there is no copy for the tool. */
  details: string;
  samplePrompts: string[];
}

export const WARPBOT_TOOL_COPY: Readonly<Record<string, WarpBotToolCopy>> = {
  // ── Meetings ────────────────────────────────────────────────────────────────────────────
  create_meeting: {
    displayName: "Create meeting room",
    description: "Creates a WarpTalk translation room in this workspace, now, later or on a repeating schedule.",
    details:
      "Sets up a WarpTalk room with a title, meeting type, source language and target languages. It can be a one-off at a set time or a repeating schedule, and can be a follow-up to the meeting in progress. If a detail is missing, WarpBot asks you first. People you name are invited by email, so WarpBot only uses addresses you give it.",
    samplePrompts: [
      "Create a meeting room called Weekly sync tomorrow at 9am, English to Vietnamese",
      "Schedule a follow-up to this meeting next Monday at 2pm",
    ],
  },
  create_action_item: {
    displayName: "Save action item",
    description: "Saves a task to a meeting, with its owner and deadline.",
    details:
      "When you state a task, commitment or to-do, WarpBot saves it as an action item on the meeting instead of only acknowledging it. The task then appears on the meeting's page with its owner and deadline, and WarpBot links to it.",
    samplePrompts: [
      "Action: send the revised quote to the client, owner me, deadline Friday",
      "Add a task for Linh to review the contract by next Wednesday",
    ],
  },
  share_meeting_minutes: {
    displayName: "Share meeting minutes",
    description: "Gives someone access to a meeting's minutes by email and returns the share link.",
    details:
      "Grants a person access to a meeting's minutes and hands you the share link. WarpTalk does not email the link for you: send it yourself.",
    samplePrompts: ["Share the minutes of yesterday's board meeting with an@example.com"],
  },
  list_recent_meetings: {
    displayName: "List recent meetings",
    description: "Lists your recent meetings that have ended, optionally by a word in the title.",
    details:
      "Finds your past WarpTalk meetings (ended or cancelled), optionally filtered by a keyword in the title. WarpBot uses it to find the right meeting before reading its summary, details or transcript.",
    samplePrompts: ["What meetings did I have this week?", "Find my recent meetings about the product launch"],
  },
  get_meeting_summary: {
    displayName: "Read meeting summary",
    description: "Reads the AI summary and action items of a past meeting.",
    details:
      "Returns the summary and action items of a meeting that already has one. Summaries are produced automatically when a meeting's transcript is processed; WarpBot cannot generate one on demand.",
    samplePrompts: ["Summarise my last meeting", "What were the action items from the sprint review?"],
  },
  get_room_detail: {
    displayName: "Read meeting details",
    description: "Reads a meeting's status, languages, host and schedule.",
    details:
      "Returns the full details of one meeting: its status, languages, host and schedule. It works from the meeting you are looking at, or from one WarpBot found by name.",
    samplePrompts: [
      "Who is hosting this meeting and which languages does it use?",
      "When is the next Weekly sync scheduled?",
    ],
  },
  get_transcript: {
    displayName: "Read meeting transcript",
    description: "Reads what was said in a meeting, by speaker and language.",
    details:
      "Reads transcript segments with speaker, language and text — the most recent ones first, paging back for earlier parts of a long meeting. Use it to ask what someone said, to find a quote, or to recap how the meeting opened.",
    samplePrompts: ["What did the client say about the budget in the last meeting?", "Quote how the meeting opened"],
  },

  // ── Knowledge ───────────────────────────────────────────────────────────────────────────
  search_facts: {
    displayName: "Look up decisions and facts",
    description: "Lists the decisions, requirements, commitments and risks recorded in this workspace.",
    details:
      "Lists the knowledge facts extracted from meetings and documents — decisions, requirements, definitions, commitments, risks and references. Best when the question names a kind of fact, such as what was decided or which risks were raised.",
    samplePrompts: ["What did we decide about the release date?", "Which risks were raised this month?"],
  },
  semantic_search: {
    displayName: "Search workspace knowledge",
    description: "Searches documents, transcripts, glossaries and facts by meaning, not exact words.",
    details:
      "Searches everything indexed for this workspace — documents, meeting transcripts, glossaries and extracted facts — by meaning. Good for conceptual questions. It can come back empty when nothing relevant has been indexed yet.",
    samplePrompts: ["What have we discussed about data retention?", "Find anything about onboarding new customers"],
  },

  // ── Documents ───────────────────────────────────────────────────────────────────────────
  search_documents: {
    displayName: "Find documents",
    description: "Finds workspace documents by name, or lists what documents exist.",
    details:
      "Finds documents by name, ignoring case, Vietnamese diacritics and punctuation. When no name matches, it falls back to matching the documents' content.",
    samplePrompts: ["Which documents do we have about pricing?", "Find the bug tracking document"],
  },
  get_document: {
    displayName: "Read document",
    description: "Reads a document's details and an excerpt of its text.",
    details:
      "Returns a workspace document's metadata and a text excerpt, so WarpBot can answer questions about it. It works from a document you mention, have open, or that WarpBot found by name.",
    samplePrompts: ["What does the onboarding guide say about account setup?", "Summarise the latest product spec"],
  },

  // ── Glossary ────────────────────────────────────────────────────────────────────────────
  search_terminology: {
    displayName: "Look up a term",
    description: "Looks up how a term is defined or translated, in your glossary first.",
    details:
      "Searches this workspace's glossary first, then the platform's global glossary of common IT and business terms. Use it to ask what a term means or how it should be translated.",
    samplePrompts: ["How do we translate 'deployment pipeline' into Vietnamese?", "What does SLA mean in our glossary?"],
  },
  create_glossary: {
    displayName: "Create glossary",
    description: "Creates a new, empty glossary for a source and target language.",
    details:
      "Creates a named glossary for one language pair in this workspace. It needs a name and both languages — WarpBot asks if you did not say them. The glossary starts empty; add terms to it next.",
    samplePrompts: ["Create a glossary called Legal terms, English to Japanese"],
  },
  add_glossary_term: {
    displayName: "Add glossary term",
    description: "Saves a term and its preferred translation, so live translation uses it.",
    details:
      "Adds a term and its preferred translation to this workspace's glossary. Live translation uses it from then on.",
    samplePrompts: [
      "Add 'go-live' to our glossary, translated as 'launch day'",
      "Always keep 'sprint' untranslated in live translation",
    ],
  },

  // ── Translation ─────────────────────────────────────────────────────────────────────────
  translate_text: {
    displayName: "Translate text",
    description: "Translates a piece of text into another language, right away.",
    details: "Translates text you give WarpBot into the language you ask for. Nothing is saved.",
    samplePrompts: [
      "Translate 'We will ship the fix on Friday' into Japanese",
      "Translate this paragraph into Vietnamese",
    ],
  },

  // ── Workspace ───────────────────────────────────────────────────────────────────────────
  search_workspace_members: {
    displayName: "Find workspace members",
    description: "Finds people in this workspace by name or email, with their role.",
    details:
      "Searches this workspace's members by name or email. Use it to ask who is in the workspace, how to reach a teammate, or what their role is.",
    samplePrompts: ["Who are the admins of this workspace?", "Find Linh's email address"],
  },

  // ── Conversation ────────────────────────────────────────────────────────────────────────
  ask_user: {
    displayName: "Ask you a question",
    description: "Asks you multiple-choice questions when WarpBot needs a detail it does not have.",
    details:
      "Instead of guessing a missing detail — a room's title, languages or type — WarpBot shows a card of up to four multiple-choice questions and waits for your answer. It runs on its own; there is nothing to ask for.",
    samplePrompts: ["Set up a meeting room for me"],
  },

  // ── Platform ────────────────────────────────────────────────────────────────────────────
  get_platform_analytics: {
    displayName: "Platform analytics",
    description: "Reads platform-wide figures: workspaces, meetings, revenue, feedback and health.",
    details:
      "Reads the same reports as the admin console — workspace and meeting counts, recurring revenue, feedback ratings, sign-ups and infrastructure health — with your own admin credentials. These are totals across every workspace.",
    samplePrompts: ["How many workspaces signed up this month?", "What is our monthly recurring revenue?"],
  },
};

/** The Try prompt on the web search row, offered only while `webSearch.state` is `on`. */
export const WEB_SEARCH_SAMPLE_PROMPT = "Search the web for the latest news about real-time speech translation";

/** `get_platform_analytics` → "Get platform analytics". */
export function humaniseToolName(name: string): string {
  const words = name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
}

function asCategory(value: string): WarpBotToolCategory {
  return (WARPBOT_TOOL_CATEGORIES as readonly string[]).includes(value) ? (value as WarpBotToolCategory) : "other";
}

function asAudience(value: string): WarpBotToolAudience {
  return value === "host" || value === "platform_staff" ? value : "member";
}

/**
 * The server's `builtIn` rows, dressed with copy, in the server's order. A name that appears twice
 * is listed once. Category, effect and audience always come from the server; an id the page does
 * not know is shown under "other".
 */
export function builtInToolsFromManifest(rows: readonly WarpBotBuiltInToolDto[]): WarpBotBuiltInTool[] {
  const seen = new Set<string>();
  const tools: WarpBotBuiltInTool[] = [];
  for (const row of rows) {
    if (!row?.name || seen.has(row.name)) continue;
    seen.add(row.name);
    const copy = Object.prototype.hasOwnProperty.call(WARPBOT_TOOL_COPY, row.name)
      ? WARPBOT_TOOL_COPY[row.name]
      : undefined;
    tools.push({
      name: row.name,
      displayName: copy?.displayName ?? humaniseToolName(row.name),
      category: asCategory(row.category),
      effect: row.effect === "write" ? "write" : "read",
      audience: asAudience(row.audience),
      description: copy?.description ?? row.description ?? "",
      details: copy?.details ?? "",
      samplePrompts: copy?.samplePrompts ?? [],
    });
  }
  return tools;
}

/** The category chips to offer, in page order: only categories that have a listed tool. */
export function toolCategoriesOf(tools: readonly WarpBotBuiltInTool[]): WarpBotToolCategory[] {
  const present = new Set(tools.map((tool) => tool.category));
  return WARPBOT_TOOL_CATEGORIES.filter((category) => present.has(category));
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
