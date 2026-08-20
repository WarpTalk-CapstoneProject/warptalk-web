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

export function assistantToolLabel(toolName: string | null | undefined): string {
  if (!toolName) return "Looking that up…";
  return ASSISTANT_TOOL_LABELS[toolName] ?? "Looking that up…";
}
