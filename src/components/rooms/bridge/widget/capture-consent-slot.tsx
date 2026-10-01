"use client";

/**
 * SLOT: the loopback consent question, between the header and the tabs.
 *
 * WHY IT SITS IN THE SHELL RATHER THAN IN A TAB
 *   It is not transcript and it is not WarpBot: it is the reason the transcript has only one side
 *   in it. A host reading the far side's silence on the Transcript tab has to see the question that
 *   explains it without going looking, so it renders above both tabs and survives switching them.
 *
 * WHY A SLOT AND NOT THE PANEL ITSELF
 *   The shell passes its slots no props (see widget-context.tsx), and the panel is also mountable
 *   outside this window — it takes the room it is asking about. This is the one line that turns the
 *   widget's own room into that argument.
 *
 * It draws nothing at all unless the main window says the question is open, so in a plain browser
 * tab, and on a machine that cannot listen to the browser, the widget looks as it did.
 *
 * WT-900: on a machine with Hi-Fi Cable the question is open while the cable stands in, and the
 * panel shrinks to one line ("Switch" / "Keep cable") once the cable demonstrably carries Meet.
 * The slot's padding is tightened to match, so the compact ask costs one row of the strip.
 */

import { BridgeCaptureConsentPanel } from "../bridge-capture-consent-panel";

import { useBridgeWidget } from "./widget-context";

export function CaptureConsentSlot() {
  const { roomId } = useBridgeWidget();

  return (
    <div className="shrink-0 border-b border-border px-3.5 py-1.5 empty:hidden empty:border-0 empty:p-0">
      <BridgeCaptureConsentPanel roomId={roomId} />
    </div>
  );
}
