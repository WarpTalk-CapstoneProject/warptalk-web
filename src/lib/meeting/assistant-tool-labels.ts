/**
 * What WarpBot is doing, in words a person in a meeting can read.
 *
 * WHY THIS IS SHARED RATHER THAN COPIED
 *   Two surfaces run the same agent — the global widget and the in-meeting chat — and the tools
 *   come from one registry in warptalk-ai. A second copy of this map would drift the moment a tool
 *   is added, and the drift shows up as one surface naming the step and the other saying
 *   "Looking that up" for the same call.
 *
 * WHY AN UNKNOWN TOOL STILL GETS A LABEL
 *   A tool this map has not caught up with is still evidence that WarpBot is working, which is the
 *   whole point of showing the step. Falling back to a vague sentence keeps that signal; falling
 *   back to nothing would put the surface back to a bare spinner precisely when a new tool shipped.
 *
 * WHY THE LABELS CARRY NO ELLIPSIS
 *   They used to end in "…" to say "in progress", and the step already says that twice over — a
 *   spinner beside it and a shimmer running through the text. The ellipsis also sat between the
 *   label and its target, where it read as a truncation of the wrong half: "Searching documents…
 *   onboarding" looks like the name was cut off. Running and finished wording differ instead,
 *   which is what actually distinguishes the two states.
 */

/**
 * The two steps that are not tool calls.
 *
 * A turn is not only its tools. Before the first call WarpBot is reading the question, and after
 * the last one it is writing the answer — the two longest stretches of a slow turn, and the two
 * that used to show a bare "Thinking..." with no trail at all. Naming them is what makes the trail
 * a sequence a person can follow rather than a list of the tools that happened to run.
 *
 * Double-underscored so they can never collide with a tool name from warptalk-ai's registry.
 */
export const THINKING_STEP = "__thinking__";
export const WRITING_STEP = "__writing__";

export const ASSISTANT_TOOL_LABELS: Record<string, string> = {
  [THINKING_STEP]: "Reading your question",
  [WRITING_STEP]: "Writing the answer",
  search_workspace_members: "Searching workspace members",
  search_terminology: "Searching terminology",
  list_recent_meetings: "Looking up recent meetings",
  translate_text: "Translating",
  semantic_search: "Searching the knowledge base",
  // Registered in warptalk-ai and missing here until v146, so the three of them showed the
  // fallback sentence while every neighbouring tool named itself. search_documents is the one
  // a person hits most: "find the doc about X" is the commonest thing anybody asks the widget.
  search_documents: "Searching documents",
  search_facts: "Checking what the workspace knows",
  get_platform_analytics: "Reading platform analytics",
  get_meeting_summary: "Looking up the meeting summary",
  get_room_detail: "Looking up the room",
  get_transcript: "Reading the transcript",
  get_document: "Reading the document",
  ask_user: "Asking you for a couple of details",
  create_meeting: "Creating the meeting",
  // Not one of warptalk-ai's own tools: OpenAI runs this one server-side, and the worker
  // publishes the step by hand off the response stream because the dispatch loop a hosted call
  // never enters is what publishes every other one. From the reader's chair it is the same
  // thing happening, so it reads the same way.
  web_search: "Searching the web",
};

/**
 * The same steps once they are over.
 *
 * A finished step kept saying "Searching documents…" with a tick beside it, which is two
 * contradictory claims on one line — still going, and done. Present continuous is a state, and a
 * state that has ended needs different words, not a different icon.
 */
export const ASSISTANT_TOOL_DONE_LABELS: Record<string, string> = {
  [THINKING_STEP]: "Read your question",
  [WRITING_STEP]: "Wrote the answer",
  search_workspace_members: "Searched workspace members",
  search_terminology: "Searched terminology",
  list_recent_meetings: "Looked up recent meetings",
  translate_text: "Translated",
  semantic_search: "Searched the knowledge base",
  search_documents: "Searched documents",
  search_facts: "Checked what the workspace knows",
  get_platform_analytics: "Read platform analytics",
  get_meeting_summary: "Looked up the meeting summary",
  get_room_detail: "Looked up the room",
  get_transcript: "Read the transcript",
  get_document: "Read the document",
  ask_user: "Asked you for details",
  create_meeting: "Created the meeting",
  web_search: "Searched the web",
};

export function assistantToolLabel(toolName: string | null | undefined): string {
  if (!toolName) return "Looking that up";
  return ASSISTANT_TOOL_LABELS[toolName] ?? "Looking that up";
}

/**
 * One tool call as the reader sees it: what it was, what it was about, and whether it finished.
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
  /**
   * What the call is ABOUT — the phrase searched, the file opened, the site fetched.
   *
   * Comes from the worker (ai_assistant_worker/tool_targets.py), never invented here: a target
   * this client guessed at would be a claim about what the agent did, made by something that
   * cannot know. Absent whenever the call has no subject worth naming, which is normal.
   */
  detail?: string;
};

export function assistantToolDoneLabel(toolName: string | null | undefined): string {
  if (!toolName) return "Looked that up";
  return ASSISTANT_TOOL_DONE_LABELS[toolName] ?? "Looked that up";
}

/**
 * Fill in a target learned after the step was already on screen.
 *
 * The hosted web search publishes its started event before OpenAI has said what it is searching
 * for, so the completed event is often the first one that can name the target. Without this the
 * one tool a person most wants named — "which site?" — would be the only one that never is.
 *
 * Deliberately additive: a detail already shown is never replaced, because the running step's
 * target is the more specific of the two whenever both exist, and a label that changes under the
 * reader mid-turn is worse than one that arrives late.
 */
export function withStepDetail(
  steps: readonly AssistantStep[],
  tool: string,
  detail: string | null | undefined,
): AssistantStep[] {
  if (!detail) return steps as AssistantStep[];
  let filled = false;
  // Last first: a tool called twice in one turn should have its MOST RECENT step named, which
  // is the one the arriving event belongs to.
  const next = [...steps];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const step = next[index];
    if (!filled && step.tool === tool && !step.detail) {
      next[index] = { ...step, detail };
      filled = true;
    }
  }
  return next;
}
