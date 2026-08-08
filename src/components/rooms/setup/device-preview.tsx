"use client";

import {
  Microphone,
  MicrophoneSlash,
  SpeakerHigh,
  VideoCamera,
  VideoCameraSlash,
} from "@phosphor-icons/react/dist/ssr";

import { DeviceSelect } from "@/components/rooms/setup/device-select";
import { cn } from "@/lib/utils";
import type { DevicePreview as DevicePreviewState } from "@/hooks/use-device-preview";

/**
 * The self-view every pre-join surface shows: your own picture, mic and camera toggles, a
 * live input meter, and the device pickers.
 *
 * Presentation only — all state lives in useDevicePreview, so the waiting room and the setup
 * modal cannot drift on what "camera off" means or on who stops the tracks.
 */
export function DevicePreview({
  preview,
  showDevicePickers = true,
  displayName,
  className,
}: {
  preview: DevicePreviewState;
  /** Hidden on narrow layouts where the pickers would crowd the picture. */
  showDevicePickers?: boolean;
  /** Shown as an initial when there is no picture, so the frame is a person, not a void. */
  displayName?: string;
  className?: string;
}) {
  const {
    videoRef,
    cameraEnabled,
    setCameraEnabled,
    microphoneEnabled,
    setMicrophoneEnabled,
    cameraDevices,
    microphoneDevices,
    speakerDevices,
    selectedCameraId,
    setSelectedCameraId,
    selectedMicrophoneId,
    setSelectedMicrophoneId,
    selectedSpeakerId,
    setSelectedSpeakerId,
    mediaError,
    micLevel,
  } = preview;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-canvas">
        {/* A failed getUserMedia leaves the camera *enabled* — nothing turned it off, it never
            started. Rendering the <video> on `cameraEnabled` alone therefore painted an empty
            grey rectangle under the error, which is the picture of a broken app rather than of
            a person who has not granted a permission yet. */}
        {cameraEnabled && !mediaError ? (
          // Mirrored, like every other video app: an un-mirrored self-view reads as broken.
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
            autoPlay
            muted
            playsInline
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="flex flex-col items-center gap-3 text-center text-ink-muted">
              {displayName ? (
                <span className="grid size-20 place-items-center rounded-full bg-surface-2 text-2xl font-semibold text-ink">
                  {displayName.trim().charAt(0).toUpperCase()}
                </span>
              ) : (
                <VideoCameraSlash className="h-12 w-12" weight="light" />
              )}
              <span className="text-sm font-medium">
                {mediaError ? "No camera preview" : "Camera is off"}
              </span>
              {mediaError ? (
                <span role="status" className="max-w-sm text-xs leading-relaxed text-ink-muted">
                  {mediaError}
                </span>
              ) : null}
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface-1/85 p-2 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setMicrophoneEnabled(!microphoneEnabled)}
              aria-pressed={microphoneEnabled}
              aria-label={microphoneEnabled ? "Turn off microphone" : "Turn on microphone"}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
                microphoneEnabled
                  ? "bg-surface-2 text-ink hover:bg-surface-3"
                  : "bg-red-500/10 text-red-500 hover:bg-red-500/20",
              )}
            >
              {microphoneEnabled ? (
                <Microphone className="h-5 w-5" />
              ) : (
                <MicrophoneSlash className="h-5 w-5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setCameraEnabled(!cameraEnabled)}
              aria-pressed={cameraEnabled}
              aria-label={cameraEnabled ? "Turn off camera" : "Turn on camera"}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
                cameraEnabled
                  ? "bg-surface-2 text-ink hover:bg-surface-3"
                  : "bg-red-500/10 text-red-500 hover:bg-red-500/20",
              )}
            >
              {cameraEnabled ? (
                <VideoCamera className="h-5 w-5" />
              ) : (
                <VideoCameraSlash className="h-5 w-5" />
              )}
            </button>

            {/* Gated on the stream, not just the toggle. With the microphone "on" but no
                permission there is nothing to meter, and an empty track next to the buttons
                reads as a stray sliver of UI rather than as a level that happens to be zero. */}
            {microphoneEnabled && !mediaError ? (
              <>
                <div className="mx-1 h-6 w-px bg-border/60" />
                {/* Proof the microphone is actually picking something up — the one thing a
                    device check exists to answer. */}
                <div
                  className="flex h-8 w-2 items-end overflow-hidden rounded-full bg-surface-2"
                  role="meter"
                  aria-label="Microphone input level"
                  aria-valuenow={micLevel}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="w-full rounded-full bg-semantic-success transition-all duration-75 ease-out"
                    style={{ height: `${micLevel}%` }}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {showDevicePickers ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <DeviceSelect
            label="Camera"
            icon={<VideoCamera className="h-4 w-4 text-ink-muted" />}
            value={selectedCameraId}
            onChange={setSelectedCameraId}
            devices={cameraDevices}
            fallback="Default Camera"
          />
          <DeviceSelect
            label="Microphone"
            icon={<Microphone className="h-4 w-4 text-ink-muted" />}
            value={selectedMicrophoneId}
            onChange={setSelectedMicrophoneId}
            devices={microphoneDevices}
            fallback="Default Microphone"
          />
          <DeviceSelect
            label="Speaker"
            icon={<SpeakerHigh className="h-4 w-4 text-ink-muted" />}
            value={selectedSpeakerId}
            onChange={setSelectedSpeakerId}
            devices={speakerDevices}
            fallback="Default Speaker"
          />
        </div>
      ) : null}
    </div>
  );
}
