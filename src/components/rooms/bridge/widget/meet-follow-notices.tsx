"use client";

/**
 * What the popup says when the room follows its Google Meet call. WT-912 / WT-913.
 *
 * The user only operates Meet (PO, 2026-10-02). The main window follows Meet's own buttons
 * (lib/meeting/bridge-meet-follow) and normally the popup says NOTHING about it: unmute in Meet
 * and WarpTalk hears you, leave Meet and the room closes behind you. Two things are said here, and
 * only when they have to be:
 *
 *   1. "You left the Meet call. End the WarpTalk room?" with a countdown, for whoever may end the
 *      room. The main window ends it when the countdown runs out; "End now" does it at once and
 *      "Keep open" calls it off until the next time the user joins and leaves. Rejoining in Meet
 *      makes the question go away by itself. This is not an End button: it appears only after
 *      Meet was left, and the ending is the main window's native one (the popup only answers).
 *      After "Keep open", one quiet line says the room is open and WarpTalk is not listening,
 *      because it is not: this desktop stopped hearing Meet when the user left the call.
 *   2. A fallback chip, where Meet's mute button cannot be read (an older desktop, macOS, a button
 *      the sensor never saw): the WarpTalk mic would otherwise stay off for the whole meeting with
 *      no way to turn it on. One line, one press, validated by the main window. It stays while the
 *      mic is on by hand, so it can be turned off again. While the mic follows Meet: nothing.
 *
 * Both come from the main window's snapshot and draw nothing without one. Above the tabs and the
 * language step alike, in one strip each, so the dock row is left alone.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Microphone, MicrophoneSlash, SignOut } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { meetLeaveSecondsLeft } from "@/lib/meeting/bridge-meet-follow";
import { bridgeWidgetMeetLeave, bridgeWidgetMicChip } from "@/lib/meeting/bridge-widget-relay";

import { useBridgeWidget } from "./widget-context";

const STRIP = "shrink-0 border-b border-border px-3.5 py-2 text-[11px] leading-snug text-ink";

export function MeetFollowNotices() {
  const { ended } = useBridgeWidget();
  if (ended) return null;
  return (
    <>
      <MeetLeftPrompt />
      <MicFallbackChip />
    </>
  );
}

function MeetLeftPrompt() {
  const t = useTranslations("rooms.bridgeWidget.meetLeft");
  const { relay } = useBridgeWidget();
  const prompt = bridgeWidgetMeetLeave(relay.view);
  const endsAtMs = prompt?.state === "countdown" ? prompt.endsAtMs : null;

  // The clock for the countdown. Both windows are on one machine, so `endsAtMs` (the main
  // window's Date.now()) and this one agree.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAtMs === null) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [endsAtMs]);

  if (!prompt) return null;

  if (prompt.state === "kept") {
    return (
      <div data-bridge-meet-left-kept role="status" className={`${STRIP} bg-surface-2 text-ink-muted`}>
        {t("kept")}
      </div>
    );
  }

  return (
    <div data-bridge-meet-left role="alertdialog" aria-label={t("title")} className={`${STRIP} bg-status-waiting/15`}>
      <p className="flex items-start gap-1.5">
        <SignOut size={14} weight="bold" className="mt-px shrink-0 text-status-waiting" aria-hidden="true" />
        <span>
          <span className="font-semibold">{t("title")}</span>{" "}
          <span className="text-ink-muted" aria-live="off">
            {t("countdown", { seconds: meetLeaveSecondsLeft(prompt.endsAtMs, now) })}
          </span>
        </span>
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" className="h-7 text-[11px]" onClick={() => relay.answerMeetLeft(true)}>
          {t("endNow")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => relay.answerMeetLeft(false)}
        >
          {t("keepOpen")}
        </Button>
      </div>
    </div>
  );
}

function MicFallbackChip() {
  const t = useTranslations("rooms.bridgeWidget.micChip");
  const { relay } = useBridgeWidget();
  const chip = bridgeWidgetMicChip(relay.view);
  if (!chip) return null;

  const Icon = chip.enabled ? Microphone : MicrophoneSlash;
  return (
    <div
      data-bridge-mic-chip={chip.enabled ? "on" : "off"}
      role="status"
      title={t("hint")}
      className={`${STRIP} flex items-center gap-1.5 ${chip.enabled ? "bg-surface-2" : "bg-status-waiting/15"}`}
    >
      <Icon size={14} weight="fill" className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-semibold">{chip.enabled ? t("on") : t("off")}</span>
      <Button
        size="sm"
        variant={chip.enabled ? "outline" : "default"}
        className="h-6 shrink-0 px-2 text-[11px]"
        onClick={() => relay.setMicEnabled(!chip.enabled)}
      >
        {chip.enabled ? t("turnOff") : t("turnOn")}
      </Button>
    </div>
  );
}
