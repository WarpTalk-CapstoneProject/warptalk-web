import { NOISE_SUPPRESSION_PREFERENCE_VERSION } from "./track-effects-preferences.ts";

export const JOIN_PREVIEW_KEY = "warptalk.join.preview";
export const DEVICE_PREVIEW_KEY = "warptalk.devices.preview";
// Extension included on purpose: this module is exercised by node --experimental-strip-types,
// which does not resolve extensionless relative imports.
import { liveMeetingPath } from "../workspace/workspace-routes.ts";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export type JoinState = {
  displayName: string;
  roomCode: string;
  speakLanguage: string;
  listenLanguage: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  speakerEnabled: boolean;
  voiceEnabled?: boolean;
  backgroundBlurEnabled?: boolean;
  participantId?: string;
};

export type StoredJoinState = Partial<JoinState> & { roomId?: string };

type DeviceState = {
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  noiseSuppressionEnabled: boolean;
  noiseSuppressionPreferenceVersion: number;
  backgroundBlurEnabled: boolean;
  /** WT-631. The microphone picked on the pre-join screen, so the meeting captures from it. */
  selectedMicrophoneId?: string;
};

export type MeetingMediaPreferences = {
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  noiseSuppressionEnabled: boolean;
  backgroundBlurEnabled: boolean;
  /**
   * WT-631. Which input device to capture from, or "" for whatever the browser calls default.
   *
   * Both pre-join screens have a microphone picker, and their preview honours it — the level
   * meter people watch before joining reads from the device they chose. The choice then went
   * nowhere: completeMeetingJoin stored booleans only, and the meeting captured from the OS
   * default input instead. On a machine with a virtual audio cable installed (VB-Cable, or the
   * devices WarpTalk's external bridge uses) that default is often the loopback, which carries
   * every sound the machine plays — so the meeting transcribed another browser tab while the
   * participant's real microphone sat unused.
   */
  selectedMicrophoneId: string;
};

function parseObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function readMeetingJoinState(
  storage: StorageReader,
  roomId: string,
): StoredJoinState {
  const join = parseObject(storage.getItem(JOIN_PREVIEW_KEY));
  return join.roomId === roomId ? (join as StoredJoinState) : {};
}

/**
 * Media permission is fail-closed. Only preferences created for this exact room may
 * enable a camera or microphone; stale/global browser state must never publish tracks.
 */
export function readMeetingMediaPreferences(
  storage: StorageReader,
  roomId: string,
): MeetingMediaPreferences {
  const join = readMeetingJoinState(storage, roomId);
  const devices = parseObject(storage.getItem(DEVICE_PREVIEW_KEY));
  const roomDevices =
    devices.roomId === roomId || devices.roomId === undefined ? devices : {};
  // WT-631. Read even on the fail-closed path below, because it is not a permission: it only
  // says WHICH input to use once the participant turns a microphone on, and it can never turn
  // one on by itself. A host who started the meeting without a pre-join screen and then picked
  // a microphone from the meeting bar keeps that pick across a reload this way.
  const selectedMicrophoneId =
    typeof roomDevices.selectedMicrophoneId === "string"
      ? roomDevices.selectedMicrophoneId
      : "";
  if (join.roomId !== roomId) {
    return {
      cameraEnabled: false,
      microphoneEnabled: false,
      // ON, unlike the two above it, and the difference is what fail-closed means here. Camera and
      // microphone are PERMISSIONS: publishing one the participant did not ask for is the failure.
      // Noise suppression is not a permission — it only describes how an already-permitted
      // microphone gets processed, and there is nothing to fail closed about. Off would just be a
      // dirtier microphone.
      noiseSuppressionEnabled: true,
      backgroundBlurEnabled: false,
      selectedMicrophoneId,
    };
  }

  return {
    cameraEnabled:
      typeof roomDevices.cameraEnabled === "boolean"
        ? roomDevices.cameraEnabled
        : join.cameraEnabled === true,
    microphoneEnabled:
      typeof roomDevices.microphoneEnabled === "boolean"
        ? roomDevices.microphoneEnabled
        : join.microphoneEnabled === true,
    // ON BY DEFAULT, and the version check is what makes that safe to change. A preference
    // written at the CURRENT version is a real choice and is honoured either way — including an
    // explicit opt-out. Anything older is not an answer to this question at all (most of those
    // `false` values were the previous default, never a decision), so it falls through to the
    // default rather than pinning people to it forever.
    //
    // The downgrade path is what makes ON the right default: every failure inside
    // useTrackProcessors restores the browser's own suppression BEFORE reporting, so the worst
    // outcome of defaulting to on is exactly the audio that defaulting to off would have given.
    noiseSuppressionEnabled:
      roomDevices.noiseSuppressionPreferenceVersion ===
      NOISE_SUPPRESSION_PREFERENCE_VERSION
        ? roomDevices.noiseSuppressionEnabled === true
        : true,
    backgroundBlurEnabled:
      roomDevices.backgroundBlurEnabled === true ||
      join.backgroundBlurEnabled === true,
    selectedMicrophoneId,
  };
}

/**
 * Record a microphone chosen from inside the meeting (WT-631).
 *
 * The meeting bar's picker moves the live capture through LiveKit, and LiveKit keeps that choice
 * for the rest of the connection. A reload starts a new connection from this record, though, and
 * without the write it would put the participant straight back on the device they had just moved
 * away from. Same record the pre-join screen writes, so there is one answer to "which microphone
 * does this meeting use".
 *
 * Merged into the record when it belongs to this room (or to none), so the camera/microphone
 * permissions and the noise-suppression choice beside it survive. A record stamped for ANOTHER
 * room is an earlier meeting in this tab; writing into it would change that meeting's preference
 * and still not be read for this one, so it is replaced with a record for this room instead.
 */
export function rememberSelectedMicrophone(
  storage: StorageReader & StorageWriter,
  roomId: string,
  deviceId: string,
) {
  const devices = parseObject(storage.getItem(DEVICE_PREVIEW_KEY));
  const base =
    devices.roomId === roomId || devices.roomId === undefined ? devices : {};
  storage.setItem(
    DEVICE_PREVIEW_KEY,
    JSON.stringify({ ...base, roomId, selectedMicrophoneId: deviceId }),
  );
}

/**
 * The LiveKit room options that make the meeting capture from the chosen microphone (WT-631).
 *
 * Set as the ROOM's capture default rather than on the `audio` prop of <LiveKitRoom>, because the
 * prop is read in exactly one place — the first publish after connecting. A participant who joins
 * muted (or is muted on entry) publishes nothing then, and their microphone is created later by
 * the toggle with the room's defaults alone; the prop would have missed them entirely. The room
 * default is also what LiveKit itself rewrites when the participant switches device mid-meeting,
 * so a reconnect keeps their latest pick instead of reverting to this one.
 *
 * `ideal`, not `exact`: an id saved from a headset that has since been unplugged would make an
 * exact constraint throw OverconstrainedError and join them with no microphone at all. Preferring
 * it and falling back to the default is no worse than what every meeting did before.
 *
 * Undefined with no preference, so the room is built exactly as it was before this existed.
 */
export function microphoneRoomOptions(
  selectedMicrophoneId: string,
): { audioCaptureDefaults: { deviceId: { ideal: string } } } | undefined {
  return selectedMicrophoneId
    ? { audioCaptureDefaults: { deviceId: { ideal: selectedMicrophoneId } } }
    : undefined;
}

export function completeMeetingJoin({
  storage,
  roomId,
  workspaceSlug,
  joinState,
  deviceState,
  navigate,
  closePreview,
}: {
  storage: StorageWriter;
  roomId: string;
  /** The workspace the meeting belongs to; see liveMeetingPath for the slug-less case. */
  workspaceSlug: string | null | undefined;
  joinState: JoinState;
  deviceState: DeviceState;
  navigate: (path: string) => void;
  closePreview: () => void;
}) {
  storage.setItem(
    JOIN_PREVIEW_KEY,
    JSON.stringify({ ...joinState, roomId }),
  );
  storage.setItem(
    DEVICE_PREVIEW_KEY,
    JSON.stringify({ ...deviceState, roomId }),
  );

  // Start navigation while the modal is still mounted. Closing it first can remove
  // the component that owns the router during the successful mutation callback.
  navigate(liveMeetingPath(workspaceSlug, roomId));
  closePreview();
}
