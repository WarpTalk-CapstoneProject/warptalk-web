"use client";

/**
 * "You joined this meeting from another device or tab" — web #646's DisplacedSessionNotice, said on
 * the popup.
 *
 * The same account joined this meeting somewhere else, and the main window was the one evicted. It
 * then stops connecting on purpose: reconnecting would evict the other login, and the two would
 * evict each other forever. Taking the meeting back has to be a deliberate press. The main window
 * offered it on a card in its own bridge widget, which WT-868 removed — the bridge meeting runs
 * headless there now — so without this the session stays displaced with no way back.
 *
 * The press is a relay intent (`take-over-session`): the main window owns the meeting and runs its
 * own take-over, which reconnects it and evicts the other login (which then shows this notice).
 * Drawn only while a main window's snapshot says it was displaced; one that does not say never
 * gets the intent. Copy is DisplacedSessionNotice's, so the two surfaces say the same thing.
 */

import { Devices } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { useBridgeWidget } from "./widget-context";

const BANNER = "shrink-0 border-b border-border px-3.5 py-2 text-[11px] leading-snug text-ink";

export function SessionDisplacedNotice() {
  const t = useTranslations("meetingCallChrome.displaced");
  const { sessionDisplaced, relay } = useBridgeWidget();

  if (!sessionDisplaced) return null;

  return (
    <div
      data-bridge-session-displaced
      data-session-displaced
      role="alert"
      className={`${BANNER} bg-status-waiting/15`}
    >
      <p className="flex items-start gap-1.5 font-semibold">
        <Devices size={14} className="mt-px shrink-0" aria-hidden="true" />
        <span>{t("title")}</span>
      </p>
      <p className="mt-1 text-ink-muted">{t("description")}</p>
      <Button size="sm" className="mt-2 h-7 text-[11px]" onClick={() => relay.takeOverSession()}>
        {t("takeOver")}
      </Button>
    </div>
  );
}
