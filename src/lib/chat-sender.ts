import type { ChatMessageDto, ParticipantInfoDto } from "@/types/realtime";

/**
 * Who a meeting-chat message is from, and whether it is WarpBot.
 *
 * Both answers were wrong for the assistant. The panel asked
 * `message.messageType === "assistant"`, but the server writes
 * `messageType: "assistant_response"` and marks the author with
 * `senderType: "assistant"` — so the assistant branch never ran, WarpBot fell through to the
 * participant lookup, matched nobody, and was labelled "User". Its replies appeared under
 * the same name as a human's.
 *
 * `senderType` is the field to read: it is what the meeting service sets when it writes the
 * message and what the result consumer sets when it writes the answer.
 *
 * Pure so both rules can be tested without a meeting.
 */

export const ASSISTANT_DISPLAY_NAME = "WarpBot";

export function isAssistantMessage(
  message: Pick<ChatMessageDto, "senderType" | "messageType">,
): boolean {
  // Both spellings accepted: senderType is authoritative, messageType is checked too so a
  // message written by an older server version is still recognised.
  return (
    message.senderType === "assistant" ||
    message.messageType === "assistant_response"
  );
}

export function chatSenderName(
  message: Pick<
    ChatMessageDto,
    "senderType" | "messageType" | "senderUserId" | "senderDisplayName"
  >,
  currentUser: { id?: string; fullName?: string } | null | undefined,
  participants: readonly Pick<ParticipantInfoDto, "userId" | "displayName">[],
): string {
  if (isAssistantMessage(message)) return ASSISTANT_DISPLAY_NAME;

  if (currentUser?.id && message.senderUserId === currentUser.id) {
    return currentUser.fullName || message.senderDisplayName || "You";
  }

  const participant = participants.find(
    (candidate) =>
      candidate.userId === message.senderUserId ||
      candidate.displayName === message.senderDisplayName,
  );

  // The server already said who sent this. Falling straight to "User" threw that away, so
  // anyone who had left the room — and therefore left the participant list — lost their name
  // on every message they had written.
  return participant?.displayName || message.senderDisplayName || "User";
}
