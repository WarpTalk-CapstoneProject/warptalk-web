"use client";

/**
 * "Turn on captions (CC) in Google Meet." Live far-side speaker names come from Meet's own
 * captions (desktop #44), so with CC off the other side's lines carry no names.
 *
 * Said by the CAPTURER's main window (`meetCaptionsOff` on its snapshot, useFarSpeakerHints +
 * lib/meeting/meet-captions-off): the desktop could not turn CC on itself, or captions stayed
 * hidden on a readable Meet tab for more than 10 s. That window is hidden while bridging, so the
 * popup is where it has to be said. A main window that predates the field never sends it: nothing.
 *
 * Shaped like BridgeMeetMicNotice — a toast once when it starts (the user is looking at Meet, not
 * at this banner) and a banner for as long as it is true. The banner can be dismissed; it goes
 * away by itself once captions are visible, and a later "off" shows it again.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Subtitles } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { useBridgeWidget } from "./widget-context";

export function MeetCaptionsNotice() {
  const t = useTranslations("rooms.bridgeWidget");
  const { meetCaptionsOff } = useBridgeWidget();
  const [dismissed, setDismissed] = useState(false);
  // A dismissal lasts for one "off" spell: once captions are back, the next "off" is said again.
  // Adjusted while rendering (React's "storing information from previous renders"), not in an effect.
  if (!meetCaptionsOff && dismissed) setDismissed(false);

  const announcedRef = useRef(false);
  useEffect(() => {
    if (!meetCaptionsOff) {
      announcedRef.current = false;
      return;
    }
    if (announcedRef.current) return;
    announcedRef.current = true;
    toast.warning(t("meetCaptions.title"));
  }, [meetCaptionsOff, t]);

  if (!meetCaptionsOff || dismissed) return null;

  return (
    <div
      data-bridge-meet-captions-off
      role="status"
      className="shrink-0 border-b border-border bg-status-waiting/15 px-3.5 py-2 text-[11px] leading-snug text-ink"
    >
      <p className="flex items-start gap-1.5">
        <Subtitles size={14} weight="fill" className="mt-px shrink-0 text-status-waiting" aria-hidden="true" />
        <span>
          <span className="font-semibold">{t("meetCaptions.title")}</span> {t("meetCaptions.body")}
        </span>
      </p>
      <Button
        size="sm"
        variant="outline"
        className="mt-2 h-7 text-[11px]"
        onClick={() => setDismissed(true)}
      >
        {t("meetCaptions.dismiss")}
      </Button>
    </div>
  );
}
