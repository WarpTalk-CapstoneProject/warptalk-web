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
};

export type MeetingMediaPreferences = {
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  noiseSuppressionEnabled: boolean;
  backgroundBlurEnabled: boolean;
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
    };
  }

  const devices = parseObject(storage.getItem(DEVICE_PREVIEW_KEY));
  const roomDevices =
    devices.roomId === roomId || devices.roomId === undefined ? devices : {};

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
  };
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
