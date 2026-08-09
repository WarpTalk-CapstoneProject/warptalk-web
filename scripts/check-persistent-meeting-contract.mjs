import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8").catch((error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  });
}

const [appLayout, roomRoute, meetingSession, meetingStore, lifecycle, miniDock] =
  await Promise.all([
    source("src/app/(app)/layout.tsx"),
    source("src/app/(app)/[workspaceSlug]/rooms/[id]/live/page.tsx"),
    source("src/components/rooms/live/persistent-meeting-session.tsx"),
    source("src/stores/active-meeting-store.ts"),
    source("src/lib/meeting/meeting-session-lifecycle.ts"),
    source("src/components/rooms/live/mini-meeting-dock.tsx"),
  ]);

assert.match(
  meetingStore,
  /activeRoomId:[\s\S]*openMeeting:[\s\S]*closeMeeting:/,
  "the app must keep the active meeting id outside the route component",
);
assert.match(
  roomRoute,
  /openMeeting\(roomId\)/,
  "visiting a live room must activate the persistent meeting session",
);
assert.doesNotMatch(
  roomRoute,
  /LiveKitRoom|createHubConnection|useLeaveTranslationRoom/,
  "the route wrapper must not own connections that disappear during navigation",
);
assert.match(
  appLayout,
  /<PersistentMeetingSession[\s\S]*key=\{activeMeetingRoomId\}[\s\S]*compact=\{!isLiveMeetingRoute\}/,
  "the persistent session must stay mounted while its presentation changes",
);
// The floating window used to be pinned to bottom-right in this file, and that literal was
// asserted here. It is draggable now, so the position lives in MiniMeetingDock and the thing
// worth pinning is what the pinning was FOR: the window must not end up somewhere it covers
// the page permanently or cannot be grabbed again.
assert.match(
  appLayout,
  /<MiniMeetingDock floating=\{!isLiveMeetingRoute\}/,
  "the floating presentation must be owned by the dock, which keeps it inside the viewport",
);
assert.match(
  miniDock,
  /clampToViewport/,
  "every dock position must be clamped — a window dragged off the edge can never be grabbed again",
);
assert.match(
  miniDock,
  /addEventListener\("resize"/,
  "a shrinking viewport must pull the window back into view, not strand it outside",
);
// The single-wrapper rule, stated where it can be broken. Two branches rendering their own
// <PersistentMeetingSession> read as equivalent and are not: React unmounts on the switch.
assert.doesNotMatch(
  appLayout,
  /isLiveMeetingRoute \?[\s\S]{0,600}?<PersistentMeetingSession[\s\S]{0,600}?<PersistentMeetingSession/,
  "the session must be rendered once, not once per presentation — a ternary between two of them remounts it and drops the call",
);
assert.match(
  meetingSession,
  /export function PersistentMeetingSession\([\s\S]*roomId[\s\S]*compact[\s\S]*onMeetingClosed/,
  "the live meeting implementation must accept layout-owned persistence controls",
);
assert.doesNotMatch(
  meetingSession,
  /useParams/,
  "the persistent session must not be tied to the currently visible route params",
);
assert.match(
  meetingSession,
  /<LiveKitRoom[\s\S]*compact \? \([\s\S]*data-mini-meeting[\s\S]*\) : \([\s\S]*data-meeting-content/,
  "full and mini views must share one mounted LiveKitRoom",
);
// Through liveMeetingPath, not a literal. The path is spelled once now; a second copy here
// is how `/room/{id}` survived without a workspace slug while every route around it had one.
assert.match(
  meetingSession,
  /aria-label="Return to meeting"[\s\S]*router\.push\(liveMeetingPath\(activeWorkspaceSlug, roomId\)\)/,
  "the mini meeting must provide a clear route back to the full meeting",
);
assert.match(
  meetingSession,
  /handleExit[\s\S]*onMeetingClosed\(\)[\s\S]*router\.push/,
  "only an explicit leave or end action should close the persistent meeting",
);
// The mini window's chrome, pinned where it can be undone.
assert.match(
  meetingSession,
  /aria-label="Leave meeting"[\s\S]{0,400}handleExit\("leave"\)/,
  "the mini meeting must offer a way out that does not require expanding it first",
);
assert.doesNotMatch(
  meetingSession,
  /data-mini-meeting[\s\S]{0,4000}(inset-x-0 top-0[^"]*bg-black|bottom-0 z-40[\s\S]{0,80}bg-black)/,
  "the mini meeting must not reintroduce full-width opaque bars over the picture",
);
assert.match(
  miniDock,
  /closest\("button, a, input, textarea, select, \[role='button'\]"\)/,
  "the dock must treat controls as controls, not as drag surfaces — that exclusion is what lets the whole window be the handle",
);

// --- Billing: a minimised tab must not hold LiveKit open forever -------------------------
// A LiveKit token is never withdrawn, so `connect={Boolean(token)}` was true for the life of
// the tab: wall-clock connection minutes kept billing, and the AI ingress bot kept counting a
// human and so never idle-released either.
assert.doesNotMatch(
  meetingSession,
  /connect=\{Boolean\(meetingSession\?\.token\)\}/,
  "LiveKit presence must not be decided by the mere existence of a token",
);
assert.match(
  meetingSession,
  /const shouldConnectLiveKit = shouldConnectMeeting\(\{\s*\n?\s*hasToken: Boolean\(meetingSession\?\.token\),\s*\n?\s*canConnectRoom: canConnectMeeting,\s*\n?\s*idleReaped: meetingIsIdleReaped,/,
  "connecting must also require a joinable room and a session that has not been idle-reaped",
);
assert.match(
  lifecycle,
  /return hasToken && canConnectRoom && !idleReaped;/,
  "the connect rule itself must stay all three conditions",
);
// The LiveKit disconnect alone is not the finish line: an abandoned tab that keeps polling
// still burns the gateway's 100-req/min/IP budget, whose rejections are bodyless 503s that
// read as an outage.
assert.match(
  meetingSession,
  /useTranslationRoomParticipants\(\s*\n?\s*roomId,\s*\n?\s*meetingSession !== null &&\s*\n?\s*!meetingSession\.isWaitingRoom &&\s*\n?\s*!meetingIsIdleReaped,/,
  "an idle-reaped session must stop polling, not just stop publishing",
);
assert.match(
  lifecycle,
  /MINI_MEETING_IDLE_TIMEOUT_MS = 15 \* 60 \* 1000/,
  "the minimised idle timeout must stay long enough to survive stepping away from a meeting",
);
assert.match(
  lifecycle,
  /export function isIdleReaped\([\s\S]*?return compact && idleDisconnected;/,
  "only a minimised session is ever reaped",
);
assert.match(
  meetingSession,
  /if \(!compact \|\| idleDisconnected\) return;/,
  "the idle reaper must never run against the full-size meeting view",
);

// --- WT-303: localParticipant is the only source of truth for mic/camera ------------------
// @livekit/components-react@2.9.21 reads <LiveKitRoom audio/video> only inside its
// RoomEvent.SignalConnected handler, so a post-connect prop change publishes nothing. Buttons
// that wrote React state therefore muted an icon and nothing else.
assert.doesNotMatch(
  meetingSession,
  /onClick=\{\(\) => setMicrophoneEnabled\(\(current\) => !current\)\}/,
  "a media button must change the published track, not a React mirror of it",
);
assert.doesNotMatch(
  meetingSession,
  /onClick=\{\(\) => setCameraEnabled\(\(current\) => !current\)\}/,
  "a media button must change the published track, not a React mirror of it",
);
assert.match(
  meetingSession,
  /const \{ enabled, pending, toggle \} = useTrackToggle\(\{ source \}\)/,
  "the mini window's media buttons must read and write localParticipant, like <TrackToggle>",
);
assert.match(
  meetingSession,
  /if \(room\.state !== ConnectionState\.Connected\) return;/,
  "React state may only mirror LiveKit while connected, or a disconnect rewrites the intent",
);
assert.match(
  meetingSession,
  /localMediaControlRef\.current\?\.setMicrophoneEnabled\(false\)/,
  "a host's ForceMuted must reach the published track",
);

// --- WT-306: the meeting survives a reload on a non-room route ---------------------------
assert.match(
  meetingStore,
  /createJSONStorage\(\(\) => sessionStorage\)/,
  "the active meeting is per-tab: two tabs must not rehydrate one LiveKit identity",
);
assert.doesNotMatch(
  meetingStore,
  /createJSONStorage\(\(\) => localStorage\)|storage: localStorage/,
  "the active meeting id must never be shared across tabs",
);
assert.match(
  meetingStore,
  /partialize: \(state\) => \(\{ activeRoomId: state\.activeRoomId \}\)/,
  "only the room id may be persisted",
);
assert.match(
  meetingSession,
  /const meetingRoomIsGone = isRestoredMeetingStale\(\{[\s\S]*?roomLoadFailed: roomQuery\.isError,[\s\S]*?canConnectRoom: canConnectMeeting,/,
  "a restored room id that no longer resolves must retire the session, not mount a dead panel",
);
assert.doesNotMatch(
  appLayout,
  /sessionStorage/,
  "the layout must not read browser storage during render — the store owns rehydration",
);

console.log("Persistent meeting contract passed.");
