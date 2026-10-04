"use client";

/**
 * Two popup notices about the bridge's audio devices (2026-10-03): BridgeRawMicNotice (below) and
 * BridgeMeetSpeakerNotice (at the end). Both draw nothing unless their reading says so.
 *
 * "People in Meet hear your own voice, untranslated."
 *
 * In voice mode Meet's microphone is the cable, and WarpTalk plays the host's dub into it; while
 * there is no dub it plays the host's raw microphone instead (lib/meeting/room-audio-routing). The
 * first sentence of every session goes out raw on purpose, so that alone is normal. Raw for long
 * (`showsRawMicNotice`, lib/meeting/bridge-mic-device) means the translation of the host is not
 * arriving — in the field, a microphone that was no longer on the wire — and the people in the call
 * were hearing the untranslated voice with nothing on the host's screen saying so.
 *
 * Re-evaluated on a timer, because the condition is "for long enough" and nothing else changes when
 * it becomes true. Draws nothing against a main window too old to send `outbound`.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { normalizeLanguageCode } from "@/lib/language/languages";
import { RAW_MIC_NOTICE_AFTER_MS, showsRawMicNotice } from "@/lib/meeting/bridge-mic-device";

import { useBridgeWidget } from "./widget-context";

export function BridgeRawMicNotice() {
  const t = useTranslations("rooms.bridgeWidget.rawMic");
  const { relay, audioMode, translationStarted, readerLanguage, farSideLanguage } = useBridgeWidget();
  const snapshot = relay.view.status === "connected" ? relay.view.snapshot : null;
  const outbound = snapshot?.outbound;
  const reader = readerLanguage ? normalizeLanguageCode(readerLanguage) : null;
  const farSide = farSideLanguage ? normalizeLanguageCode(farSideLanguage) : null;
  const sameLanguage = Boolean(reader && farSide && reader === farSide);

  // The clock, only while Meet is on the raw microphone: the notice is "raw for long enough".
  const [now, setNow] = useState(() => Date.now());
  const rawSince = outbound?.leg === "raw-mic" ? outbound.sinceMs : null;
  useEffect(() => {
    if (rawSince === null) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, Math.min(5_000, RAW_MIC_NOTICE_AFTER_MS));
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [rawSince]);

  const shown = showsRawMicNotice({
    audioMode,
    translationStarted,
    leg: outbound?.leg,
    legSinceMs: outbound?.sinceMs,
    sameLanguage,
    nowMs: now,
  });
  if (!shown) return null;

  return (
    <div
      data-bridge-raw-mic-notice
      role="status"
      className="shrink-0 border-b border-border bg-status-waiting/15 px-3.5 py-2 text-[11px] leading-snug text-ink"
    >
      <p className="flex items-start gap-1.5">
        <WarningCircle size={14} weight="fill" className="mt-px shrink-0 text-status-waiting" aria-hidden="true" />
        <span>
          <span className="font-semibold">{t("title")}</span> {t("body")}
        </span>
      </p>
    </div>
  );
}

/**
 * "Meet's speaker is set to CABLE Input." (desktop reading, 2026-10-03.)
 *
 * In the field Meet's speaker had been set to the cable's input. The far side then plays into the
 * cable, comes back out of "CABLE Output" — Meet's own microphone in a voice bridge — and the user
 * hears nothing of the call. The desktop reads where the Meet browser plays (`MeetMicState.speaker`,
 * optional); an older desktop never says, and this draws nothing. Any mode: a speaker on the cable
 * is wrong in text mode too.
 */
export function BridgeMeetSpeakerNotice() {
  const t = useTranslations("rooms.bridgeWidget.meetSpeaker");
  const { meetSpeaker } = useBridgeWidget();
  if (meetSpeaker !== "cable") return null;

  return (
    <div
      data-bridge-meet-speaker-on-cable
      role="alert"
      className="shrink-0 border-b border-border bg-status-waiting/15 px-3.5 py-2 text-[11px] leading-snug text-ink"
    >
      <p className="flex items-start gap-1.5">
        <WarningCircle size={14} weight="fill" className="mt-px shrink-0 text-status-waiting" aria-hidden="true" />
        <span>
          <span className="font-semibold">{t("title")}</span> {t("body")}
        </span>
      </p>
    </div>
  );
}
