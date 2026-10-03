"use client";

/**
 * WT-435 — choosing WHICH microphone, speaker or camera, from the meeting bar.
 *
 * The mic and camera buttons were toggle-only: you could mute, and you could not pick. Anyone
 * on a headset plus a built-in mic, or two cameras, had to leave the meeting and change it in
 * the OS. Every other meeting product puts this on a caret attached to the button itself, which
 * is also the only place a user looks for it.
 *
 * Rendered only inside a connected LiveKitRoom. `useMediaDeviceSelect` switches the device on
 * the live track through the room, so outside that context there is nothing to switch and the
 * caret would be a dead control.
 */

import { useEffect, useId, useRef, useState } from "react";
import { FlyoutSurface } from "@/components/rooms/live/flyout";
import { CaretDown, Check } from "@phosphor-icons/react/dist/ssr";
import { useMediaDeviceSelect } from "@livekit/components-react";

import {
  DEVICE_KIND_LABELS as KIND_LABELS,
  mediaDeviceLabel,
} from "@/lib/meeting/media-device-label";
import type { MediaDeviceKindLabel } from "@/lib/meeting/media-device-label";
import {
  rememberSelectedMicrophone,
  rememberSelectedSpeaker,
} from "@/lib/meeting/meeting-join-state";
import { toast } from "sonner";
import { useActiveMeetingStore } from "@/stores/active-meeting-store";

type DeviceKind = MediaDeviceKindLabel;

function DeviceSection({
  kind,
  onPicked,
}: {
  kind: DeviceKind;
  onPicked: () => void;
}) {
  // requestPermissions is deliberately false: opening this menu must not prompt for the camera
  // when the user only wanted to change microphone. Labels fill in once the track is live.
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind,
    requestPermissions: false,
  });

  if (devices.length === 0) {
    return (
      <div className="px-2 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
          {KIND_LABELS[kind]}
        </p>
        <p className="mt-1 text-[12px] text-ink-subtle">No device found.</p>
      </div>
    );
  }

  return (
    <div className="px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
        {KIND_LABELS[kind]}
      </p>
      <ul className="mt-1" role="group" aria-label={KIND_LABELS[kind]}>
        {devices.map((device, index) => {
          const selected = device.deviceId === activeDeviceId;
          return (
            <li key={`${kind}-${device.deviceId || index}`}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={async () => {
                  try {
                    // `exact` for every kind (3 Oct 2026). WT-631 switched the microphone as a
                    // preference (`exact: false`), and a preference is exactly that: the browser
                    // weighs it against the other capture constraints and may hand back the
                    // default input instead — silently, with the menu then ticking "Default".
                    // That was the "I pick a device and it falls back to the default" report.
                    //
                    // WT-631's worry was an exact id outliving an unplugged headset. For a live
                    // microphone livekit-client answers that itself (livekit-client 2.22,
                    // LocalParticipant.handleTrackEnded): the unplugged device ends the track and
                    // it is restarted on `deviceId: 'default'`; for a speaker its devicechange
                    // handler moves to the first output still present. The one gap left is a
                    // microphone unplugged while MUTED and then unmuted, which now fails to
                    // restart instead of landing on the default — rare, visible, and fixed by
                    // picking a device here again, against a silent wrong device on every switch.
                    // A device that vanishes between this list being drawn and the click throws
                    // here and says so below, instead of quietly capturing from somewhere else.
                    await setActiveMediaDevice(device.deviceId, { exact: true });
                    // WT-631. The switch above lasts as long as this connection. A reload builds
                    // a new one from the pre-join record, which would put the participant straight
                    // back on the device they just left — so the pick goes into that record too.
                    // The meeting bar is only ever rendered by the active meeting's session, so
                    // the active room is the room this pick belongs to.
                    const roomId = useActiveMeetingStore.getState().activeRoomId;
                    if (roomId && kind === "audioinput") {
                      rememberSelectedMicrophone(window.sessionStorage, roomId, device.deviceId);
                    } else if (roomId && kind === "audiooutput") {
                      rememberSelectedSpeaker(window.sessionStorage, roomId, device.deviceId);
                    }
                  } catch {
                    toast.error(
                      `Could not switch to ${mediaDeviceLabel(device, index, kind)}. It may have been unplugged or be in use by another app.`,
                    );
                  } finally {
                    // Closed either way. A switch that failed leaves the previous device
                    // active, and holding the menu open would read as "still working".
                    onPicked();
                  }
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors ${
                  selected ? "text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <Check
                  className={`h-3.5 w-3.5 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`}
                  aria-hidden
                />
                <span className="min-w-0 truncate">{mediaDeviceLabel(device, index, kind)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The caret that sits against a mic or camera toggle and opens its device list.
 *
 * `kinds` rather than one kind because the microphone caret also carries the speaker: they are
 * one decision to a user ("my headset"), and a separate control for output would be a third
 * button in a bar that is already full.
 */
export function MediaDeviceMenuButton({
  kinds,
  label,
}: {
  kinds: DeviceKind[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      // Portaled out of this container (see flyout.tsx), so it needs asking separately or every
      // click inside the menu reads as outside and closes it.
      if (surfaceRef.current?.contains(target)) return;
      if (!containerRef.current?.contains(target)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        className={`grid h-10 w-5 place-items-center rounded-r-xl text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink ${
          open ? "bg-surface-2 text-ink" : ""
        }`}
      >
        <CaretDown className="h-3 w-3" />
      </button>

      {open ? (
        <FlyoutSurface
          id={menuId}
          role="menu"
          aria-label={label}
          anchorRef={containerRef}
          surfaceRef={surfaceRef}
          align="center"
          // Upwards: the meeting bar is pinned to the bottom of the viewport, so a menu that
          // opened downwards would render off-screen. Portaled as well, because the bar's own
          // wrapper is a scroll container and clipped this menu away entirely.
          className="z-50 w-64 divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline bg-surface-1 py-1 shadow-lg"
        >
          {/* Mounted only while open, so the device enumeration happens when the user asks for
              it rather than on every meeting-bar render. */}
          {kinds.map((kind) => (
            <DeviceSection key={kind} kind={kind} onPicked={() => setOpen(false)} />
          ))}
        </FlyoutSurface>
      ) : null}
    </div>
  );
}
