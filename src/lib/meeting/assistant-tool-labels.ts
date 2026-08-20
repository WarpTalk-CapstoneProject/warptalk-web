/**
 * What WarpBot is doing, in words a person in a meeting can read.
 *
 * WHY THIS IS SHARED RATHER THAN COPIED
 *   Two surfaces run the same agent — the global widget and the in-meeting chat — and the tools
 *   come from one registry in warptalk-ai. A second copy of this map would drift the moment a tool
 *   is added, and the drift shows up as one surface naming the step and the other saying
 *   "Looking that up…" for the same call.
 *
 * WHY AN UNKNOWN TOOL STILL GETS A LABEL
 *   A tool this map has not caught up with is still evidence that WarpBot is working, which is the
 *   whole point of showing the step. Falling back to a vague sentence keeps that signal; falling
 *   back to nothing would put the surface back to a bare spinner precisely when a new tool shipped.
 */

export const ASSISTANT_TOOL_LABELS: Record<string, string> = {
  search_workspace_members: "Searching workspace members…",
  search_terminology: "Searching terminology…",
  list_recent_meetings: "Looking up recent meetings…",
  translate_text: "Translating…",
  semantic_search: "Searching knowledge base…",
  // Registered in warptalk-ai and missing here until now, so the three of them showed the
  // fallback sentence while every neighbouring tool named itself. search_documents is the one
  // a person hits most: "find the doc about X" is the commonest thing anybody asks the widget.
  search_documents: "Searching documents…",
  search_facts: "Checking what the workspace knows…",
  get_platform_analytics: "Reading platform analytics…",
  get_meeting_summary: "Looking up meeting summary…",
  get_room_detail: "Looking up room details…",
  get_transcript: "Reading the transcript…",
  get_document: "Reading the document…",
  ask_user: "Needs a couple of details…",
  create_meeting: "Creating the meeting…",
  // Not one of warptalk-ai's own tools: OpenAI runs this one server-side, and the worker
  // publishes the step by hand off the response stream because the dispatch loop a hosted call
  // never enters is what publishes every other one. From the reader's chair it is the same
  // thing happening, so it reads the same way.
  web_search: "Searching the web…",
};

/**
 * The same steps once they are over.
 *
 * A finished step kept saying "Searching documents…" with a tick beside it, which is two
 * contradictory claims on one line — still going, and done. Present continuous is a state, and a
 * state that has ended needs different words, not a different icon.
 */
export const ASSISTANT_TOOL_DONE_LABELS: Record<string, string> = {
  search_workspace_members: "Searched workspace members",
  search_terminology: "Searched terminology",
  list_recent_meetings: "Looked up recent meetings",
  translate_text: "Translated",
  semantic_search: "Searched knowledge base",
  search_documents: "Searched documents",
  search_facts: "Checked what the workspace knows",
  get_platform_analytics: "Read platform analytics",
  get_meeting_summary: "Looked up meeting summary",
  get_room_detail: "Looked up room details",
  get_transcript: "Read the transcript",
  get_document: "Read the document",
  ask_user: "Asked for details",
  create_meeting: "Created the meeting",
  web_search: "Searched the web",
};

export function assistantToolLabel(toolName: string | null | undefined): string {
  if (!toolName) return "Looking that up…";
  return ASSISTANT_TOOL_LABELS[toolName] ?? "Looking that up…";
}

/**
 * One tool call as the reader sees it: what it was, and whether it has finished.
 *
 * Shared for the same reason the labels are — the widget and the in-meeting chat show the same
 * trail for the same agent, and a second definition is how one of them ends up rendering a
 * spinner that never resolves.
 */
export type AssistantStep = {
  /** Stable across re-renders; the tool name alone repeats when a tool is called twice. */
  key: string;
  /** Kept so the row can switch between the running and the finished wording. */
  tool: string;
  done: boolean;
};

export function assistantToolDoneLabel(toolName: string | null | undefined): string {
  if (!toolName) return "Looked that up";
  return ASSISTANT_TOOL_DONE_LABELS[toolName] ?? "Looked that up";
}
