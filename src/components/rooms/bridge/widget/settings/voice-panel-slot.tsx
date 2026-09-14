"use client";

/**
 * The body of the widget's "Voice" sub-panel: the shared VoicePanel, in bridge mode. WT-525.
 *
 * Voice state lives in the main window (the listen voice, the dub voice, the clone consent, the
 * clone capture, the meeting-audio level), so this panel draws what the relay snapshot reports and
 * sends every pick back as an intent — never through this window's own hub. Only the two server
 * facts are read here directly: the voice catalog for the listen language, and this user's own
 * voice profiles.
 *
 * Rules carried over from the design, and held by check-bridge-widget-relay-contract.mjs:
 *   - Picking a LISTEN voice never withdraws the clone consent. VoicePanel's bridge mode turns the
 *     control bar's rule off (`pickWithdrawsConsent: false`), and nothing here calls the consent
 *     handler with false on the side.
 *   - No Voice on/off switch in the panel: the dock's Text | Voice owns it. `voiceEnabled` is still
 *     passed, because it decides whether "Their voice" is shown.
 *   - No Flash mode footer: Room speed already has its own row in the flyout's root, and one switch
 *     in two places is two places to disagree.
 */

import { useEffect, useId, useMemo, useState } from "react";

import { VoicePanel } from "@/components/rooms/live/voice-panel";
import { useVoiceProfiles } from "@/hooks/use-voice-profiles";
import { clampMeetingAudioLevel } from "@/lib/audio/bridge-far-side-monitor";
import type { BridgeWidgetRelayStatus } from "@/lib/meeting/bridge-widget-relay";
import type { VoiceOptionDto } from "@/types/realtime";

import { useBridgeWidget } from "../widget-context";
import { useBridgeWidgetRelayClient } from "./use-bridge-widget-relay-client";

const UNAVAILABLE: Record<Exclude<BridgeWidgetRelayStatus, "connected">, string> = {
  waiting: "Checking the WarpTalk window…",
  "no-host": "Open this meeting in the WarpTalk window to change voices here.",
  incompatible: "WarpTalk was updated. Reload it to change voices here.",
};

export function VoicePanelSlot() {
  const { roomId, hub, connectionState } = useBridgeWidget();
  const relay = useBridgeWidgetRelayClient(roomId);
  const snapshot = relay.view.status === "connected" ? relay.view.snapshot : null;
  const voice = snapshot?.voice;
  const listenLanguage = snapshot?.listenLanguage ?? "";

  // The catalog for the language this user hears, read the way the meeting reads it
  // (GetVoiceCatalog is a plain lookup by language, not a room-group call). Stamped with its
  // language so a list for the previous language is never offered for the new one.
  const [catalog, setCatalog] = useState<{ language: string; items: VoiceOptionDto[] } | null>(null);
  useEffect(() => {
    if (!hub || connectionState !== "live" || !listenLanguage || !voice) return;
    let cancelled = false;
    hub
      .invoke<VoiceOptionDto[]>("GetVoiceCatalog", listenLanguage)
      .then((items) => {
        if (!cancelled) setCatalog({ language: listenLanguage, items: items ?? [] });
      })
      .catch(() => {
        // Non-critical: the panel still offers Automatic and this user's own voices.
      });
    return () => {
      cancelled = true;
    };
  }, [hub, connectionState, listenLanguage, voice]);
  const voiceCatalog = catalog?.language === listenLanguage ? catalog.items : [];

  // persistent-meeting-session's rule: only profiles with a provider voice behind them, because an
  // uploaded recording has none until it has been cloned.
  const { data: savedVoiceProfiles } = useVoiceProfiles();
  const ownVoiceProfiles = useMemo(
    () =>
      (savedVoiceProfiles ?? [])
        .filter((profile) => profile.providerVoiceId && profile.isActive)
        .map((profile) => ({
          id: profile.id,
          name: profile.displayName || "My voice",
          voiceId: profile.providerVoiceId!,
        })),
    [savedVoiceProfiles],
  );

  if (!snapshot || !voice) {
    return (
      <p className="px-2.5 pb-2 pt-0.5 text-[12px] leading-snug text-ink-muted">
        {relay.view.status !== "connected"
          ? UNAVAILABLE[relay.view.status]
          : // Connected to a main window from before this panel: its snapshot has no voice half,
            // and every pick made here would be dropped there as an unknown intent.
            "Reload the WarpTalk window to change voices here."}
      </p>
    );
  }

  return (
    <VoicePanel
      mode="bridge"
      voiceEnabled={snapshot.voiceEnabled}
      voicePreference={voice.voicePreference}
      voiceCatalog={voiceCatalog}
      onChangeVoicePreference={relay.setVoicePreference}
      voiceCloneEnabled={voice.voiceCloneEnabled}
      voiceCloneHasAudience={voice.voiceCloneHasAudience}
      onChangeVoiceCloneConsent={relay.setVoiceCloneConsent}
      dubVoice={voice.dubVoice}
      ownVoiceProfiles={ownVoiceProfiles}
      onChangeDubVoice={relay.setDubVoice}
      cloneCapture={voice.cloneCapture}
      footer={
        snapshot.voiceEnabled ? (
          voice.meetingAudioLevel !== null ? (
            <MeetingAudioLevel level={voice.meetingAudioLevel} onCommit={relay.setMeetingAudioLevel} />
          ) : null
        ) : (
          <p className="mx-2.5 mb-2 rounded-md bg-surface-2 px-2.5 py-2 text-[11px] leading-snug text-ink-muted">
            Switch to <span className="font-semibold text-ink">Voice</span> in the dock to choose the
            voice you hear them in.
          </p>
        )
      }
    />
  );
}

/**
 * How loud the other side's original voice plays under a translation.
 *
 * Shown only where WarpTalk plays the call to the host (a second audio cable carries it): on the
 * loopback path Meet plays it and this would change nothing. The level is sent when the drag ends,
 * not on every step, and the dragged value stays on screen until the main window reports a new one.
 */
function MeetingAudioLevel({
  level,
  onCommit,
}: {
  level: number;
  onCommit: (level: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{ value: number; base: number } | null>(null);
  // A draft made against an older reported level is over: the main window has answered.
  const shown = draft && draft.base === level ? draft.value : level;
  const percent = Math.round(shown * 100);

  function commit() {
    if (!draft || draft.base !== level || draft.value === level) return;
    onCommit(clampMeetingAudioLevel(draft.value));
  }

  return (
    <div className="mx-2.5 mb-2 border-t border-surface-3 pt-2">
      <p className="pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
        Meeting audio
      </p>
      <p className="pb-1.5 text-[11px] leading-snug text-ink-muted">
        Google Meet plays into the audio cable, so WarpTalk plays the call to you and lowers it
        while a translation speaks.
      </p>
      <div className="flex items-center gap-2.5">
        <label htmlFor={id} className="shrink-0 text-[12px] text-ink">
          Original
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          aria-valuetext={`${percent} percent while a translation plays`}
          onChange={(event) => setDraft({ value: Number(event.target.value) / 100, base: level })}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-primary"
        />
        <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-muted">
          {percent}%
        </span>
      </div>
    </div>
  );
}
