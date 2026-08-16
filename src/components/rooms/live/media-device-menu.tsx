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
import { CaretDown, Check } from "@phosphor-icons/react/dist/ssr";
import { useMediaDeviceSelect } from "@livekit/components-react";

import {
  DEVICE_KIND_LABELS as KIND_LABELS,
  mediaDeviceLabel,
} from "@/lib/meeting/media-device-label";
import type { MediaDeviceKindLabel } from "@/lib/meeting/media-device-label";

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
                    await setActiveMediaDevice(device.deviceId);
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
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
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
        className={`grid h-11 w-5 place-items-center rounded-r-xl text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink ${
          open ? "bg-surface-2 text-ink" : ""
        }`}
      >
        <CaretDown className="h-3 w-3" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          // Upwards: the meeting bar is pinned to the bottom of the viewport, so a menu that
          // opened downwards would render off-screen.
          className="absolute bottom-[calc(100%+0.5rem)] left-1/2 z-50 w-64 -translate-x-1/2 divide-y divide-hairline rounded-lg border border-hairline bg-surface-1 py-1 shadow-lg"
        >
          {/* Mounted only while open, so the device enumeration happens when the user asks for
              it rather than on every meeting-bar render. */}
          {kinds.map((kind) => (
            <DeviceSection key={kind} kind={kind} onPicked={() => setOpen(false)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
