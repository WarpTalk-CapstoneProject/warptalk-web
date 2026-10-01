"use client";

/**
 * What the main window knows about the meeting that the user must hear about, said on the popup.
 * WT-901 / WT-868.
 *
 * WT-868 takes the main window's bridge UI away (ExternalBridgeWidget), so these three notices —
 * which that widget used to carry — would otherwise be said nowhere a bridge host looks:
 *
 *   - translation stopped for credits (WT-699): a toast when it happens, and a line that stays for
 *     as long as it is true, worded by `translationSuspendedNotice` exactly as the meeting words it;
 *   - the meeting's own error, word for word what the main window holds;
 *   - the idle reaper let go ("Disconnected"), with "Rejoin meeting", ExternalBridgeWidget's copy.
 *     The rejoin is a relay intent: the main window owns the meeting and its rejoin handler.
 *
 * Every one of these comes from the main window's snapshot and draws nothing without one — a
 * popup with no main window has no meeting to report on, and must not invent a state for it.
 */

import { useEffect, useRef } from "react";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { translationRestoredNotice, translationSuspendedNotice } from "@/lib/billing/translation-credits-notice";

import { useBridgeWidget } from "./widget-context";

const BANNER = "shrink-0 border-b border-border px-3.5 py-2 text-[11px] leading-snug text-ink";

export function MeetingNotices() {
  const {
    relay,
    relayConnected,
    creditsSuspended,
    creditsSuspendedReason,
    meetingError,
    idleReaped,
  } = useBridgeWidget();

  /**
   * The last value a CONNECTED main window gave. Only a connected one moves it: a main window that
   * leaves clears the snapshot, and "no longer suspended because nobody is saying so" must not be
   * announced as "billing was restored".
   */
  const lastSuspendedRef = useRef(false);
  useEffect(() => {
    if (!relayConnected) return;
    const was = lastSuspendedRef.current;
    lastSuspendedRef.current = creditsSuspended;
    if (creditsSuspended && !was) {
      toast.error(translationSuspendedNotice(creditsSuspendedReason), { duration: 15_000 });
    } else if (!creditsSuspended && was) {
      toast.success(translationRestoredNotice());
    }
  }, [relayConnected, creditsSuspended, creditsSuspendedReason]);

  return (
    <>
      {creditsSuspended ? (
        <div data-bridge-credits-suspended role="alert" className={`${BANNER} bg-destructive/10`}>
          {translationSuspendedNotice(creditsSuspendedReason)}
        </div>
      ) : null}

      {meetingError ? (
        <div
          data-bridge-meeting-error
          role="alert"
          className={`${BANNER} flex items-start gap-1.5 bg-destructive/10`}
        >
          <WarningCircle size={14} weight="fill" className="mt-px shrink-0 text-destructive" aria-hidden="true" />
          <span>{meetingError}</span>
        </div>
      ) : null}

      {idleReaped ? (
        <div data-bridge-idle-disconnected role="status" className={`${BANNER} bg-status-waiting/15`}>
          <p>
            <span className="font-semibold">Disconnected.</span> No sign of the Google Meet call for
            15 minutes, so WarpTalk stopped using your meeting minutes. Nothing is being translated.
          </p>
          <Button size="sm" className="mt-2 h-7 text-[11px]" onClick={() => relay.rejoin()}>
            Rejoin meeting
          </Button>
        </div>
      ) : null}
    </>
  );
}
