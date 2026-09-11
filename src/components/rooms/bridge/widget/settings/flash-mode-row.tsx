"use client";

/**
 * Flash mode — a ROOM setting: translation starts while people are still speaking (WT-B). The
 * widget's copy of the "Room speed" block of the meeting's Voice panel. WT-525 t4.
 *
 * Read by everyone, written by the room host only, as in the meeting: a guest sees the switch
 * where the host left it and cannot move it, because hiding it would leave them unable to tell a
 * fast room from a slow one — which they can hear. `isHost` from the widget context is the room's
 * own host (hostId or the DTO's isHost), not a workspace admin, which matches the `isRoomHost`
 * gate persistent-meeting-session puts on this switch: the endpoint answers an admin with 403.
 *
 * Called from this window, not relayed: the value is server-side, and the main window's copy
 * re-reads it every 30s (useFlashMode), so it catches up on its own.
 */

import { useId } from "react";

import { Switch } from "@/components/ui/switch";
import { useFlashMode, useSetFlashMode } from "@/hooks/use-translationRooms";

export function FlashModeRow({ roomId, isHost }: { roomId: string; isHost: boolean }) {
  // Always on while the widget is: it polls every 30s, 2 requests a minute against the gateway's
  // 100/min per IP (see SAVED_TRANSCRIPT_REFRESH_MS in use-bridge-widget-state.ts). Enabling it
  // only while the flyout is open would draw the switch "off / not known" for a moment on every
  // open and then flip it — a reading that lies, then corrects itself.
  const { data: flashMode } = useFlashMode(roomId);
  const setFlashMode = useSetFlashMode(roomId);
  const labelId = useId();
  const descriptionId = useId();

  // The native sentences, by who is looking and where the value came from.
  const description = isHost
    ? "Start translating while people are still speaking. Faster, and still experimental."
    : flashMode.source === "room"
      ? "Set by the host. Translation starts while people are still speaking."
      : flashMode.source === "deployment"
        // Nobody set this room; "the host" would name a person who made no such choice.
        ? "Following the platform default. Translation starts while people are still speaking."
        // No override and no published default: the switch sits off without claiming a reading.
        : "Not known right now — the room is using whatever the platform defaults to.";

  return (
    <div className="flex w-full items-start justify-between gap-3 px-2.5 py-2">
      <span className="min-w-0 text-left">
        <span id={labelId} className="block text-[13px] font-medium text-ink">
          Flash mode
        </span>
        <span id={descriptionId} className="block text-[11px] leading-snug text-ink-subtle">
          {description}
        </span>
      </span>
      <Switch
        size="sm"
        className="mt-0.5 shrink-0"
        checked={flashMode.enabled}
        disabled={!isHost || setFlashMode.isPending}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        onCheckedChange={(checked) => {
          if (isHost) setFlashMode.mutate(Boolean(checked));
        }}
      />
    </div>
  );
}
