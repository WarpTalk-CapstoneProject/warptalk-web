/**
 * Longest chat message the meeting room accepts (WT-237).
 *
 * Mirrored by MeetingChatConstants.MaxMessageLength on the backend — the editor stops the
 * typing at this count, and the API rejects anything past it for clients that do not.
 */
export const MAX_CHAT_MESSAGE_LENGTH = 1000;

/** Show the remaining-character hint only once the message is close to the cap. */
export const CHAT_MESSAGE_COUNTER_THRESHOLD = 900;
