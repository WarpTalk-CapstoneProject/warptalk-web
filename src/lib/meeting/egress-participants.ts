/**
 * Who belongs in the recording.
 *
 * THE BUG THIS EXISTS FOR
 *   `StartRoomCompositeEgress` records the MIXED room. tts_worker connects one bot participant per
 *   (speaker, target language) and publishes its dubbed voice into that same room, so the archived
 *   file is the original speech with every translation layered on top of it. Anyone who opens the
 *   recording hears all of them at once.
 *
 * WHY A TEMPLATE AND NOT A FLAG ON THE REQUEST
 *   RoomComposite has no include/exclude list — livekit/egress#923 is the open request for one.
 *   The supported way to control what a composite contains is a custom template: the egress opens
 *   Chrome on a page of ours, and whatever that page subscribes to is what gets recorded. So the
 *   filter has to live in a web page, and this is the rule that page applies.
 *
 * THE RULE MIRRORS livekit_ingress_worker._is_ai_bot_identity
 *   Both prefixes, for the same reason it has both: `ai-interpreter-` is the TTS publisher's dub
 *   track, and `AIBot_` is the ingest bot that feeds STT. A third copy of a rule is a third place
 *   for it to drift, so the prefixes are named here with the pointer, and the identity formats they
 *   match are documented in tts_worker/livekit_publisher.py.
 */

/** Identity prefixes every non-human participant in a meeting room carries. */
export const AI_PARTICIPANT_PREFIXES = ["ai-interpreter-", "AIBot_"] as const;

/**
 * Whether this participant is a person whose audio and video belong in the recording.
 *
 * Case-sensitive on purpose: both prefixes are produced by code, not typed by anyone, and a
 * case-insensitive match would silently accept identities neither producer emits.
 */
export function isRecordableParticipant(identity: string | null | undefined): boolean {
  if (!identity) return false;
  return !AI_PARTICIPANT_PREFIXES.some((prefix) => identity.startsWith(prefix));
}

/**
 * What to print under a recorded participant's tile.
 *
 * `RemoteParticipant.name` carries the real display name today — `LiveKitTokenService.GenerateToken`
 * embeds it as the JWT's `name` claim, and `MeetingRoomService` resolves it from the caller's own
 * display name (or the translation room's roster) before minting the token, falling back to the
 * literal string "Participant" only when neither is available. That fallback, and a guest who
 * somehow reaches the room with an empty name claim, are the two cases this function exists for:
 * the LiveKit identity (a stable id, never blank) reads better on a recording than an empty label.
 *
 * Mirrors the fallback `meeting-stage.tsx` already uses for the live UI
 * (`trackRef.participant.name || identity || fallbackName`) so the recording names people the same
 * way the meeting itself does.
 */
export function resolveEgressDisplayName(
  name: string | null | undefined,
  identity: string | null | undefined,
): string {
  return name?.trim() || identity?.trim() || "Participant";
}
