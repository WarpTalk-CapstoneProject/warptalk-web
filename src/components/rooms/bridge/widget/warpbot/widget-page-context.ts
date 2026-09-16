import type { AssistantPageContextDto } from "@/types/assistant";
import type { TranslationRoomDto } from "@/types/translationRoom";

/**
 * What the Meet widget's WarpBot tells the model about where it is. WT-525 t5 / WT-620.
 *
 * THE CONTRACT HAS NO SURFACE FIELD
 *   The only context a question can carry is `AssistantPageContextDto` — pageType, entityId,
 *   workspaceId and a string→string snapshot. It is free-form at every hop: .NET only checks the
 *   workspace (SerializePageContext) and the worker renders every snapshot pair into the page
 *   context system message. Nothing anywhere knows "external_meeting_widget".
 *
 * WHY `pageType` IS "in_meeting" AND NOT "external_meeting_widget"
 *   The worker picks its prompt template by pageType (chat_templates._PAGE_TEMPLATES), and an
 *   unlisted value falls back to GENERAL. "in_meeting" gets MEETING, whose entity binding tells the
 *   model that entity_id IS the meeting_id for get_transcript — the whole point of asking from
 *   inside the call. Sending "external_meeting_widget" today would buy a label and lose that
 *   binding, so the answer to "what did she just say?" would start by guessing which meeting.
 *
 *   The surface still travels, as a snapshot pair, which the worker shows to the model verbatim.
 *   Once the worker maps "external_meeting_widget" to MEETING (one dict entry — WT-620), this
 *   constant is the only line that has to change.
 */
export const WIDGET_PAGE_TYPE = "in_meeting";

/** What the snapshot says this surface is. Also what WT-620 is asked to route on. */
export const WIDGET_SURFACE = "external_meeting_widget";

export function buildWidgetPageContext(input: {
  roomId: string;
  room: TranslationRoomDto | undefined;
  /** The workspace the conversation was created in. See usePrivateWarpBotThread. */
  workspaceId: string;
}): AssistantPageContextDto {
  const { room } = input;
  const snapshot: Record<string, string> = {
    surface: WIDGET_SURFACE,
    // Said in words as well: a snapshot key is only as useful as the model's reading of it, and
    // "the user is in a Google Meet call" changes what a sensible answer looks like — they cannot
    // click through to anything, and they are listening to the people the transcript quotes.
    meetingPlatform: "google_meet",
  };
  // Display-only projection, as the DTO asks: the title and the lifecycle word, nothing the model
  // should treat as data. The transcript itself is read server-side through get_transcript, with
  // the caller's own token — pasting segments here would put a meeting's words into a hint field
  // that no access check ever looks at.
  if (room?.title) snapshot.title = room.title;
  if (room?.status) snapshot.status = String(room.status);

  return {
    pageType: WIDGET_PAGE_TYPE,
    entityId: input.roomId,
    workspaceId: input.workspaceId,
    snapshot,
  };
}
