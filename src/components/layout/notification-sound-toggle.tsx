"use client";

/**
 * Mute the notification cues.
 *
 * In the header rather than buried in settings, for the same reason the translation languages
 * moved out of the settings menu: the moment somebody wants this is the moment a sound just went
 * off in a room where it should not have, and a preference you have to go looking for at that
 * moment is one you turn off by muting the whole tab instead.
 *
 * Reads once on mount rather than during render — the value lives in localStorage, which is not
 * available while the server renders this component, and reading it in the body would produce a
 * hydration mismatch between a server that assumes audible and a browser that knows better.
 */

import { useEffect, useState } from "react";
import { SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react/dist/ssr";

import {
  areNotificationSoundsMuted,
  playNotificationCue,
  setNotificationSoundsMuted,
} from "@/lib/notifications/notification-sounds";

export function NotificationSoundToggle() {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(areNotificationSoundsMuted());
  }, []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setNotificationSoundsMuted(next);
    // Play the cue when switching sound ON, so the choice is confirmed by the thing being
    // chosen. Un-muting silently leaves you wondering whether it worked until the next meeting.
    if (!next) playNotificationCue("participant-joined");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={muted ? "Notification sounds are off" : "Notification sounds are on"}
      aria-label={muted ? "Turn notification sounds on" : "Turn notification sounds off"}
      aria-pressed={!muted}
      className="flex size-6 items-center justify-center rounded-full border border-hairline bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {muted ? <SpeakerSlash size={12} weight="bold" /> : <SpeakerHigh size={12} weight="bold" />}
    </button>
  );
}
