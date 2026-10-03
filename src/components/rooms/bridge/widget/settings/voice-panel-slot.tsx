"use client";

/**
 * The body of the widget's "Voice" sub-panel: the shared VoicePanel, in bridge mode. WT-525.
 *
 * Voice state lives in the main window (the listen voice, the dub voice, the clone consent, the
 * clone capture, the meeting-audio level), so this panel draws what the relay snapshot reports and
 * sends every pick back as an intent — never through this window's own hub. Only three server
 * facts are read here directly: the voice catalog for the listen language, this user's own voice
 * profiles, and their account-level consent to be cloned in a meeting (asked here when missing).
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
import { useTranslations } from "next-intl";

import { VoicePanel } from "@/components/rooms/live/voice-panel";
import { Button } from "@/components/ui/button";
import { useGrantVoiceConsent, useVoiceConsent, useVoiceProfiles } from "@/hooks/use-voice-profiles";
import { clampMeetingAudioLevel } from "@/lib/audio/bridge-far-side-monitor";
import {
  OWN_VOICE_PICK_TIMEOUT_MS,
  judgeOwnVoicePick,
  planOwnVoicePick,
} from "@/lib/meeting/voice-clone-prompt";
import type { VoiceOptionDto } from "@/types/realtime";

import { useBridgeWidget } from "../widget-context";

export function VoicePanelSlot() {
  const t = useTranslations("rooms.bridgeWidget");
  const { hub, connectionState, relay } = useBridgeWidget();
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

  // "My voice" is two gates, and this window only ever sent the second: the room switch is refused
  // (403) without the account-level consent, and the refusal was a toast in the main window. So
  // the popup asks here, with the wording the consent is recorded against, and then watches what
  // the main window reports. See planOwnVoicePick / judgeOwnVoicePick.
  const consentT = useTranslations("voiceProfiles.consent");
  const { data: voiceConsent } = useVoiceConsent();
  const grantVoiceConsent = useGrantVoiceConsent();
  const [askingConsent, setAskingConsent] = useState(false);
  const [ownVoicePick, setOwnVoicePick] = useState<{ requestedAtMs: number; sawEnabled: boolean } | null>(
    null,
  );
  const [ownVoiceFailed, setOwnVoiceFailed] = useState(false);
  const cloneEnabledNow = voice?.voiceCloneEnabled ?? false;

  function sendOwnVoice(enabled: boolean) {
    setOwnVoiceFailed(false);
    setOwnVoicePick(enabled ? { requestedAtMs: Date.now(), sawEnabled: false } : null);
    relay.setVoiceCloneConsent(enabled);
  }

  function handleChangeOwnVoice(enabled: boolean) {
    if (planOwnVoicePick({ enabling: enabled, accountConsent: voiceConsent?.isGranted }) === "ask") {
      setOwnVoiceFailed(false);
      setAskingConsent(true);
      return;
    }
    sendOwnVoice(enabled);
  }

  async function handleAllowOwnVoice() {
    try {
      await grantVoiceConsent.mutateAsync();
    } catch {
      setAskingConsent(false);
      setOwnVoiceFailed(true);
      return;
    }
    setAskingConsent(false);
    sendOwnVoice(true);
  }

  useEffect(() => {
    if (!ownVoicePick) return;
    const judge = () => {
      const verdict = judgeOwnVoicePick({
        requestedAtMs: ownVoicePick.requestedAtMs,
        nowMs: Date.now(),
        sawEnabled: ownVoicePick.sawEnabled || cloneEnabledNow,
        enabled: cloneEnabledNow,
      });
      if (verdict === "pending") {
        if (cloneEnabledNow && !ownVoicePick.sawEnabled) {
          setOwnVoicePick({ ...ownVoicePick, sawEnabled: true });
        }
        return;
      }
      if (verdict === "failed") setOwnVoiceFailed(true);
      setOwnVoicePick(null);
    };
    judge();
    const remaining = ownVoicePick.requestedAtMs + OWN_VOICE_PICK_TIMEOUT_MS - Date.now();
    const timer = window.setTimeout(judge, Math.max(0, remaining) + 50);
    return () => window.clearTimeout(timer);
  }, [ownVoicePick, cloneEnabledNow]);

  if (!snapshot || !voice) {
    return (
      <p className="px-2.5 pb-2 pt-0.5 text-[12px] leading-snug text-ink-muted">
        {relay.view.status === "waiting"
          ? t("relay.waiting")
          : relay.view.status === "no-host"
            ? t("relay.noHost")
            : // Incompatible, or connected to a main window from before this panel: its snapshot
              // has no voice half, and every pick made here would be dropped there as unknown.
              t("relay.incompatible")}
      </p>
    );
  }

  return (
    <>
      {askingConsent ? (
        <div
          role="dialog"
          aria-labelledby="bridge-own-voice-consent-title"
          className="mx-2.5 mb-2 rounded-md border border-border bg-surface-2 px-2.5 py-2"
        >
          <p id="bridge-own-voice-consent-title" className="text-[12px] font-semibold leading-snug text-ink">
            {consentT("prompt.title")}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-ink-muted">{consentT("descriptionGranted")}</p>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => setAskingConsent(false)}>
              {consentT("prompt.later")}
            </Button>
            <Button
              size="sm"
              className="h-7 text-[12px]"
              disabled={grantVoiceConsent.isPending}
              onClick={() => void handleAllowOwnVoice()}
            >
              {consentT("prompt.allow")}
            </Button>
          </div>
        </div>
      ) : null}
      {ownVoiceFailed ? (
        <p
          role="alert"
          className="mx-2.5 mb-2 rounded-md bg-destructive/10 px-2.5 py-2 text-[11px] leading-snug text-destructive"
        >
          {consentT("prompt.failed")}
        </p>
      ) : null}
      <VoicePanel
        mode="bridge"
        voiceEnabled={snapshot.voiceEnabled}
        voicePreference={voice.voicePreference}
        voiceCatalog={voiceCatalog}
        onChangeVoicePreference={relay.setVoicePreference}
        voiceCloneEnabled={voice.voiceCloneEnabled}
        voiceCloneHasAudience={voice.voiceCloneHasAudience}
        onChangeVoiceCloneConsent={handleChangeOwnVoice}
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
    </>
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
