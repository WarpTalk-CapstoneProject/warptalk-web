import type { ChatMessageDto } from "@/types/realtime";
import type { AssistantSeedMessageDto } from "@/types/assistant";
import { isAssistantMessage } from "../meeting/chat-sender.ts";
import { stripMeetingMarkers } from "./meeting-links.ts";

/**
 * "Chuyển qua widget để bàn tiếp" — the in-meeting WarpBot thread, as the opening turns of a
 * widget conversation.
 *
 * WHY A COPY AND NOT A SHARED THREAD
 *     The meeting chat's WarpBot turns are rows in the meeting service, shared by the whole room;
 *     the widget's conversations are private rows in the assistant service. Nothing links them,
 *     and making one thread live in both would mean the room reading somebody's private follow-up.
 *     So the widget gets a NEW conversation that starts with the thread, and the first question
 *     asked there reaches the worker with it as history — which is all "continue" has to mean.
 *
 * WHICH MESSAGES
 *     The WarpBot thread, not the whole side chat: every WarpBot answer, and every message that
 *     asked WarpBot something. Two colleagues arranging lunch in the same chat are not part of the
 *     conversation being continued, and would be put in the model's mouth as the user's words.
 *
 * WHOSE WORDS
 *     The widget is private, so every "user" turn reads as the person continuing. A question some
 *     OTHER participant asked WarpBot is prefixed with their name, so neither the reader nor the
 *     model mistakes it for their own.
 *
 * Pure, so the rules can be tested without a meeting — see __tests__/meeting-handoff.test.ts.
 */

/**
 * How many thread messages travel. Recent context is what a follow-up needs; the service caps a
 * seeded conversation at 40 turns, and one is the preamble.
 */
export const HANDOFF_MAX_TURNS = 24;

/** Per turn, under the service's 8000-character cap with room to spare for the name prefix. */
export const HANDOFF_MAX_TURN_CHARS = 6000;

/** Matches the 60 characters the assistant service titles a conversation with. */
export const HANDOFF_MAX_TITLE_CHARS = 60;

export interface MeetingHandoffInput {
  messages: readonly ChatMessageDto[];
  roomId: string;
  roomTitle?: string | null;
  currentUserId?: string | null;
}

export interface MeetingHandoffSeed {
  title: string;
  seedMessages: AssistantSeedMessageDto[];
}

/** Whether a meeting-chat message belongs to the WarpBot thread. */
export function isWarpBotThreadMessage(message: ChatMessageDto): boolean {
  if (message.messageType === "file") return false;
  if (isAssistantMessage(message)) return true;
  if (message.containsWarpbotMention) return true;
  return (message.mentions ?? []).some((mention) => mention.type === "agent");
}

function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > HANDOFF_MAX_TURN_CHARS
    ? `${trimmed.slice(0, HANDOFF_MAX_TURN_CHARS - 1).trimEnd()}…`
    : trimmed;
}

/**
 * The title and opening turns of the widget conversation that continues this meeting's thread.
 *
 * The first turn is WarpBot's own line naming the meeting and its id. It is what keeps the
 * continuation about THIS meeting once the person leaves the meeting page — the widget's ambient
 * context moves with them, and a "that decision" three questions later still has to resolve.
 */
export function buildMeetingHandoffSeed(input: MeetingHandoffInput): MeetingHandoffSeed {
  const roomTitle = input.roomTitle?.trim() || "this meeting";

  const thread = [...input.messages]
    .filter(isWarpBotThreadMessage)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-HANDOFF_MAX_TURNS);

  const turns: AssistantSeedMessageDto[] = [];
  for (const message of thread) {
    // Markers first, then the clip. A handed-over turn is a quote of what was said, not a
    // meeting being created again — and clipping mid-marker would leave half an HTML comment,
    // which nothing downstream recognises as one and every reader sees as characters.
    const text = clip(stripMeetingMarkers(message.originalText ?? ""));
    if (!text) continue;

    if (isAssistantMessage(message)) {
      turns.push({ role: "assistant", content: text });
      continue;
    }

    const isMine = Boolean(input.currentUserId) && message.senderUserId === input.currentUserId;
    const speaker = message.senderDisplayName?.trim();
    turns.push({
      role: "user",
      content: isMine || !speaker ? text : `${speaker} (in the meeting): ${text}`,
    });
  }

  const preamble: AssistantSeedMessageDto = {
    role: "assistant",
    content:
      `Continuing our WarpBot conversation from the meeting “${roomTitle}” ` +
      `(meeting_id: ${input.roomId}). Ask me anything about it, or tell me what to do next.`,
  };

  const title = `${roomTitle} · WarpBot`;
  return {
    title:
      title.length > HANDOFF_MAX_TITLE_CHARS
        ? `${title.slice(0, HANDOFF_MAX_TITLE_CHARS - 1).trimEnd()}…`
        : title,
    seedMessages: [preamble, ...turns],
  };
}
