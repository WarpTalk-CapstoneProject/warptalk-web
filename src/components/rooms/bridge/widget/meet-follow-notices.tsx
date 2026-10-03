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
 *      Closing the Meet TAB is the same leave (PO, 2026-10-03) and only the words differ: "The
 *      Google Meet tab was closed" (`cause: "tab-closed"`), because "You left the Meet call" reads
 *      as wrong to someone who only closed a tab. And when the End already failed (a backend hang)
 *      the countdown is the wait for the next try, and says so instead of "Ends automatically".
 *   2. The WarpTalk mic, always, while the user is in the call. It used to appear only where Meet's
 *      mute button cannot be read (an older desktop, macOS, a button the sensor never saw); while
 *      the mic followed Meet the popup said nothing — and on 2026-10-03 the desktop misread Meet's
 *      button as muted, the mic went off, and WarpTalk heard nothing of the host with nothing on
 *      screen. Now one line says on or off (off in the warning colour) and who decides it, and one
 *      press turns it the other way: applied directly where Meet cannot be read, an override while
 *      following Meet, held until Meet's button next changes (lib/meeting/bridge-meet-follow).
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
      <WarpTalkMicStrip />
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

  const tabClosed = prompt.cause === "tab-closed";

  if (prompt.state === "kept") {
    return (
      <div data-bridge-meet-left-kept role="status" className={`${STRIP} bg-surface-2 text-ink-muted`}>
        {tabClosed ? t("keptTabClosed") : t("kept")}
      </div>
    );
  }

  const title = tabClosed ? t("titleTabClosed") : t("title");
  const seconds = meetLeaveSecondsLeft(prompt.endsAtMs, now);
  return (
    <div
      data-bridge-meet-left={prompt.cause ?? "left-call"}
      data-bridge-meet-left-retrying={prompt.retrying ? "" : undefined}
      role="alertdialog"
      aria-label={title}
      className={`${STRIP} bg-status-waiting/15`}
    >
      <p className="flex items-start gap-1.5">
        <SignOut size={14} weight="bold" className="mt-px shrink-0 text-status-waiting" aria-hidden="true" />
        <span>
          <span className="font-semibold">{title}</span>{" "}
          <span className="text-ink-muted" aria-live="off">
            {prompt.retrying ? t("retrying", { seconds }) : t("countdown", { seconds })}
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

function WarpTalkMicStrip() {
  const t = useTranslations("rooms.bridgeWidget.micChip");
  const { relay } = useBridgeWidget();
  const chip = bridgeWidgetMicChip(relay.view);
  if (!chip) return null;

  const Icon = chip.enabled ? Microphone : MicrophoneSlash;
  const who = chip.control === "meet" ? (chip.override ? t("overridden") : t("followsMeet")) : null;
  return (
    <div
      data-bridge-mic-chip={chip.enabled ? "on" : "off"}
      data-bridge-mic-control={chip.control}
      role="status"
      title={chip.control === "meet" ? t("meetHint") : t("hint")}
      className={`${STRIP} flex items-center gap-1.5 ${chip.enabled ? "bg-surface-2" : "bg-status-waiting/15"}`}
    >
      <Icon size={14} weight="fill" className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{chip.enabled ? t("on") : t("off")}</span>
        {who ? <span className="text-ink-muted"> · {who}</span> : null}
      </span>
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
