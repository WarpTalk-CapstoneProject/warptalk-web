/**
 * Whether a chat message may go out now, or has to wait for WarpBot to finish. WT-580.
 *
 * WHAT WENT WRONG
 *   Nothing stopped a second `@WarpBot …` while the first was still being answered. Three things
 *   followed, and the report is all of them:
 *
 *     • `beginAssistantTurn()` ran a second time and took over the trail, so the first question's
 *       steps were replaced mid-answer by the second's.
 *     • The backend builds each request's history from what is IN THE DATABASE, and answer 1 was
 *       not written yet — so question 2 was answered against `[User Q1, User Q2]`, two user turns
 *       in a row and no reply between them. It was answering the wrong conversation.
 *     • Both answers then completed within milliseconds of each other and reached the client in
 *       one SignalR batch, arriving on screen together rather than in turn.
 *
 * WHY QUEUE RATHER THAN BLOCK
 *   Refusing the second question throws away something the user has already typed and meant. They
 *   asked two things; both deserve an answer, each with the other's answer in view. Holding the
 *   second for a few seconds buys exactly that.
 *
 * WHY ONLY AGENT MESSAGES
 *   An ordinary message to the humans in the room must never wait on WarpBot. It is a live meeting
 *   chat; making people queue behind a language model would be a worse bug than the one being
 *   fixed. Only a message that actually addresses the agent is held.
 */

/**
 * How many asks may be waiting behind the one in flight.
 *
 * Small on purpose. A queue this is allowed to grow is a way to spend a meeting's credits by
 * holding down Enter, and by the fourth queued question the answers would be arriving against a
 * conversation the asker has long since moved on from.
 */
export const MAX_QUEUED_AGENT_ASKS = 3;

export type AgentSendDecision =
  /** Dispatch it now. */
  | "send"
  /** Hold it; flush when the assistant goes idle. */
  | "queue"
  /** Too many already waiting — tell the user rather than silently dropping it. */
  | "refuse";

export function decideAgentSend(input: {
  /** Whether this message actually addresses the agent (an `agent` mention). */
  asksTheAgent: boolean;
  /** Whether the assistant is mid-answer — any non-idle state, "slow" included. */
  assistantBusy: boolean;
  /** How many asks are already waiting. */
  queueLength: number;
}): AgentSendDecision {
  // Human chat is never held. This is the branch that keeps the meeting usable.
  if (!input.asksTheAgent) return "send";
  if (!input.assistantBusy) return "send";
  return input.queueLength >= MAX_QUEUED_AGENT_ASKS ? "refuse" : "queue";
}
