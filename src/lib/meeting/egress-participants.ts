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

/**
 * WT-910 — the Google Meet window, in a bridge room's recording.
 *
 * A bridged call happens in Google Meet, so the picture worth recording is Meet's own window: the
 * desktop app captures it and the host's WarpTalk client publishes it under this track name
 * (persistent-meeting-session's BridgeMeetWindowPublisher). WarpTalk's own participants have no
 * cameras on in a bridge room — the popup has none — so a grid of them is a grid of initials.
 *
 * By NAME and not by source: it is published as a screen share, and an ordinary screen share in a
 * native meeting must keep recording the way it does today.
 */
export const MEET_WINDOW_TRACK_NAME = "meet-window";

export function isMeetWindowTrack(trackName: string | null | undefined): boolean {
  return trackName === MEET_WINDOW_TRACK_NAME;
}

/**
 * How the recording frame is laid out.
 *
 * `meet-window` when a Meet window video is subscribed, OR whenever the room is a bridge room
 * (`bridge`, see isBridgeRecording): the Meet stage fills the frame and nobody is drawn as a tile,
 * while every recordable participant's AUDIO is still mounted and mixed. `grid` otherwise — every
 * native meeting.
 *
 * WHY `bridge` AND NOT ONLY THE TRACK (production recording, 03 Oct)
 *   The layout used to follow the subscription alone. The Meet window's track went away 34 s into a
 *   bridge recording (B18 takes it down whenever Meet does not read as "in the call, on its tab")
 *   and the template fell straight back to the grid: two "Camera is off" tiles — "External Meeting"
 *   and the host — for the next 2.5 minutes, and the same grid for the first 3.4 s, before the
 *   subscription landed. A bridge recording is a recording of the Google Meet call; the native grid
 *   is never a picture of it. So a bridge room keeps the Meet stage for the whole file, and the
 *   stage holds the last frame (or the slate) while the window is away — see meetWindowStage.
 */
export type EgressLayout = "grid" | "meet-window";

export function resolveEgressLayout(
  tiles: ReadonlyArray<{ kind: string; meetWindow?: boolean }>,
  options: { bridge?: boolean } = {},
): EgressLayout {
  if (options.bridge === true) return "meet-window";
  return tiles.some((tile) => tile.kind === "video" && tile.meetWindow === true)
    ? "meet-window"
    : "grid";
}

/**
 * The bridge stand-in's LiveKit identity: the "External Meeting" seat the far side of the Meet call
 * is published under. The backend's WarpTalk.Shared.ExternalBridgeConstants.ParticipantUserId, and
 * the web's BRIDGE_STAND_IN_USER_ID (bridge-far-side-language.ts; the test pins the two equal).
 * Copied rather than imported so this public, session-less page pulls in no language modules.
 */
export const BRIDGE_STAND_IN_IDENTITY = "00000000-0000-0000-0000-00000000b21d";

/**
 * Whether this recording is of a Google Meet bridge room. Latched by the caller: once true it stays
 * true for the rest of the file (the stand-in leaving at the end of the call, or the window being
 * taken down, does not turn a Meet recording into a grid of initials).
 *
 * Either of two signals, both readable off the LiveKit room by this session-less page:
 *   - the bridge stand-in is in the room. It is connected for as long as the call is captured, and
 *     a bridge recording only ever starts once it is (bridge-recording.ts, `inboundOpen`) — so it is
 *     already there when the recorder connects, which is what keeps the first seconds off the grid;
 *   - a `meet-window` track was published, which only a bridge room's publisher ever does;
 *   - a `meet-audio` track was published (the call's sound, see MEET_AUDIO_TRACK_NAME), likewise.
 *
 * The ONE notion of "bridge" in this template: the layout (resolveEgressLayout) and the audio
 * (resolveEgressAudioContext / shouldRecordAudio) both read it, through the same latch.
 */
export function isBridgeRecording(input: {
  participantIdentities: Iterable<string>;
  meetWindowPublished: boolean;
  meetAudioPublished?: boolean;
}): boolean {
  if (input.meetWindowPublished || input.meetAudioPublished === true) return true;
  for (const identity of input.participantIdentities) {
    if (identity === BRIDGE_STAND_IN_IDENTITY) return true;
  }
  return false;
}

/**
 * WT-910 follow-up — the Meet window is shown only once it has a picture.
 *
 * The layout above switches to `meet-window` the moment the track is SUBSCRIBED, on a black stage.
 * A track that never delivered a frame therefore recorded as an unbroken black rectangle for the
 * whole meeting, indistinguishable from a broken file. Until the first frame is decoded (and while
 * the publisher has the track muted) the stage shows a slate instead: the grid's own light ground
 * with a line saying what is missing, so a recording without its picture explains itself.
 */
export function meetWindowShowsPicture(input: { firstFrameSeen: boolean; muted: boolean }): boolean {
  return input.firstFrameSeen && !input.muted;
}

/**
 * How long a subscribed Meet window may go without its first frame before the subscription is
 * renewed. A fresh subscription is a fresh downtrack, and with it a fresh keyframe request.
 */
export const MEET_WINDOW_FIRST_FRAME_TIMEOUT_MS = 8_000;

/** Whether to renew the subscription now: once per publication, and only for a picture that never came. */
export function shouldResubscribeMeetWindow(input: {
  firstFrameSeen: boolean;
  subscribedAtMs: number;
  nowMs: number;
  alreadyRetried: boolean;
}): boolean {
  if (input.firstFrameSeen || input.alreadyRetried) return false;
  return input.nowMs - input.subscribedAtMs >= MEET_WINDOW_FIRST_FRAME_TIMEOUT_MS;
}

/**
 * What the bridge recording's stage shows right now.
 *
 *   live   the Meet window track, once it has decoded a frame and while it is not muted;
 *   held   otherwise, the last Meet frame the recorder kept (see pickHeldMeetFrame);
 *   slate  otherwise: nothing of Meet has been seen yet (the first seconds), or nothing safe to hold.
 *
 * Never the grid: see resolveEgressLayout.
 */
export type MeetWindowStage = "live" | "held" | "slate";

export function meetWindowStage(input: {
  hasTrack: boolean;
  firstFrameSeen: boolean;
  muted: boolean;
  hasHeldFrame: boolean;
}): MeetWindowStage {
  if (input.hasTrack && meetWindowShowsPicture(input)) return "live";
  return input.hasHeldFrame ? "held" : "slate";
}

/** How often the template copies the live Meet window aside, to have something to hold. */
export const MEET_WINDOW_SNAPSHOT_INTERVAL_MS = 1_000;

/** How many snapshots are kept: enough to reach back past MEET_WINDOW_HOLD_LOOKBACK_MS. */
export const MEET_WINDOW_SNAPSHOT_RING = 8;

/**
 * How far before the picture went away a held frame must have been taken.
 *
 * B18 takes the window down when Meet leaves its tab, but not instantly: a window capture shows the
 * new tab at once, while the desktop reads the tab about once a second and believes "Meet is gone"
 * only after two reads 1.5 s apart (meet-call-state.ts), then IPC, unpublish and unsubscribe. So
 * the last ~3 s of a window that went away may be another tab, or the PiP window — exactly what
 * B18 promises is never recorded. Holding the very last frame would freeze that tab on screen for
 * as long as Meet is away. The frame held is one taken at least this long before the loss.
 */
export const MEET_WINDOW_HOLD_LOOKBACK_MS = 4_000;

/**
 * Which kept snapshot to hold when the live picture goes away at `lostAtMs`, and which to keep.
 *
 * Snapshots from the lookback window are suspect and are dropped for good (`keep` leaves them out),
 * so a later loss can never hold one either. Returns the newest snapshot that is old enough, or
 * null — the slate — when there is none (the picture was live for less than the lookback).
 */
export function pickHeldMeetFrame<T extends { atMs: number }>(
  snapshots: ReadonlyArray<T>,
  lostAtMs: number,
  lookbackMs: number = MEET_WINDOW_HOLD_LOOKBACK_MS,
): { held: T | null; keep: T[] } {
  const keep = snapshots.filter((snapshot) => snapshot.atMs <= lostAtMs - lookbackMs);
  let held: T | null = null;
  for (const snapshot of keep) {
    if (!held || snapshot.atMs > held.atMs) held = snapshot;
  }
  return { held, keep };
}

// ── Bridge recording AUDIO ───────────────────────────────────────────────────

/**
 * The Google Meet call's own sound, in a bridge room's recording.
 *
 * THE BUG THIS EXISTS FOR
 *   A bridge recording (production, 2026-10-03, 222 s) was digital silence from 1.1 s to the end
 *   while the user talked in Meet the whole time. The template mixed what WarpTalk publishes, and
 *   in a bridge room none of that is the call:
 *     - the user's voice was only their WarpTalk microphone, which is an STT tap and not what Meet
 *       hears. In a bridge it starts OFF (no join record: media preferences fail closed), is
 *       switched by the Meet mute sensor, mute-on-entry and force-mute, and is silenced by the
 *       half-duplex gate while a dub plays. In that file it was muted for nearly the whole call
 *       while Meet's own button was on.
 *     - the far side was only the stand-in's capture, which is fine, but it is the other half.
 *
 * THE TRACK
 *   The capturer's WarpTalk client publishes `meet-audio` while a bridge recording runs
 *   (components/rooms/live/bridge-meet-audio-publisher): the inbound leg's capture of Meet's
 *   playback (the far side: process loopback or the cable, whichever the bridge is already using)
 *   mixed with the user's microphone, which follows Meet's mute button rather than WarpTalk's.
 *   Published as SCREEN-SHARE AUDIO on purpose: livekit_ingress_worker reads only microphone and
 *   unknown sources (WT-631 `_carries_speech`) and the live clients play only microphones
 *   (FilteredRoomAudio), so the recording is the only thing that hears it.
 *
 *   When it is there, it replaces every other HUMAN audio track in the mix: the stand-in and the
 *   members are already inside it (they reach the capturer's Meet), so mixing them as well would
 *   play the call twice.
 */
export const MEET_AUDIO_TRACK_NAME = "meet-audio";

export function isMeetAudioTrack(trackName: string | null | undefined): boolean {
  return trackName === MEET_AUDIO_TRACK_NAME;
}

/**
 * A dub that belongs in a BRIDGE recording: an interpreter's shared default track.
 *
 * Product decision (2026-10-03): a bridge recording carries the call AND WarpTalk's translation of
 * it. One default track exists per (speaker, target language); a `-voice-{id8}-` track is the same
 * sentence again in a voice one listener picked, so it would only double the dub.
 */
export function isRecordedBridgeDub(identity: string | null | undefined): boolean {
  if (!identity || !identity.startsWith("ai-interpreter-")) return false;
  return !identity.slice("ai-interpreter-".length).includes("-voice-");
}

/** One remote participant as the audio policy sees it. */
export interface EgressAudioParticipant {
  identity: string;
  /** Names of every track the participant has PUBLISHED (subscribed or not). */
  trackNames: readonly (string | null | undefined)[];
}

export interface EgressAudioContext {
  /** A bridge recording: isBridgeRecording now, or `latched` from earlier in the file. */
  bridge: boolean;
  /** A person publishes `meet-audio`: the call's own mix replaces every other human's audio. */
  meetAudio: boolean;
}

/**
 * The room as both halves of the template need it. `bridge` is isBridgeRecording over the room
 * (counting `meet-audio`), OR'd with the caller's latch, so the layout and the audio can never
 * disagree about whether this is a bridge recording. Only people's tracks count: a bot naming a
 * track `meet-window` or `meet-audio` proves nothing.
 */
export function resolveEgressAudioContext(
  participants: ReadonlyArray<EgressAudioParticipant>,
  options: { latched?: boolean } = {},
): EgressAudioContext {
  const people = participants.filter((participant) => isRecordableParticipant(participant.identity));
  const published = (match: (name: string | null | undefined) => boolean) =>
    people.some((participant) => participant.trackNames.some(match));
  const meetAudio = published(isMeetAudioTrack);
  const bridge =
    options.latched === true ||
    isBridgeRecording({
      participantIdentities: people.map((participant) => participant.identity),
      meetWindowPublished: published(isMeetWindowTrack),
      meetAudioPublished: meetAudio,
    });
  return { bridge, meetAudio };
}

/**
 * Whether the recorder subscribes to one AUDIO publication.
 *
 *   AIBot_ (STT ingest)            never: it publishes nothing that belongs in a file.
 *   ai-interpreter- (dubs)         only in a bridge room, and only the default track per speaker
 *                                  and language. A native meeting keeps recording no dubs (the
 *                                  original reason for this template).
 *   a person's `meet-audio`        always.
 *   any other human audio          unless the room has `meet-audio`, which already contains it.
 */
export function shouldRecordAudio(
  publication: { identity: string; trackName: string | null | undefined },
  context: EgressAudioContext,
): boolean {
  const { identity, trackName } = publication;
  if (!identity || identity.startsWith("AIBot_")) return false;
  if (identity.startsWith("ai-interpreter-")) return context.bridge && isRecordedBridgeDub(identity);
  if (!isRecordableParticipant(identity)) return false;
  if (isMeetAudioTrack(trackName)) return true;
  return !context.meetAudio;
}

/**
 * The slate's second line, which used to claim "Audio is being recorded." whatever was mixed — in
 * the silent production file it said so over 222 s of nothing. It now says what is actually
 * subscribed. It cannot hear the signal, so it names the source and nothing more.
 */
export function meetWindowSlateAudioLine(input: { meetAudio: boolean; otherAudio: boolean }): string {
  if (input.meetAudio) return "The Google Meet call audio is being recorded.";
  if (input.otherAudio) return "Only audio published in WarpTalk is being recorded, not the Meet call itself.";
  return "No audio is reaching the recording yet.";
}
