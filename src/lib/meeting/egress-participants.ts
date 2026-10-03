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
 *   - a `meet-window` track was published, which only a bridge room's publisher ever does.
 */
export function isBridgeRecording(input: {
  participantIdentities: Iterable<string>;
  meetWindowPublished: boolean;
}): boolean {
  if (input.meetWindowPublished) return true;
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
