"use client";

/**
 * W4b: "Capture audio on this device" — a member's way to keep the far side translated when the
 * desktop that was capturing it has gone (its app closed, its machine slept).
 *
 * Shown only when the main window says this desktop is a MEMBER and the capturer is not connected
 * (`canOfferTakeover`). The press is a relay intent: the main window owns the lease, so it calls
 * `/bridge/capturer/takeover`, becomes the capturer, starts the heartbeat and opens the far side's
 * legs. The server decides — while the old capturer's lease is still live (up to 45 s after it
 * stopped renewing) it answers 409, and the popup says so when the role does not flip.
 */

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { useRelayedSwitch } from "./use-relayed-switch";
import { useBridgeWidget } from "./widget-context";

const BANNER = "shrink-0 border-b border-border px-3.5 py-2 text-[11px] leading-snug text-ink";

export function CaptureTakeoverNotice() {
  const t = useTranslations("rooms.bridgeWidget");
  const { canOfferTakeover, bridgeRole, relay } = useBridgeWidget();
  const relayed = useRelayedSwitch(bridgeRole === "capturer", {
    onConfirmed: (capturer) => {
      if (capturer) toast.success(t("takeover.done"));
    },
    onTimeout: () => {
      toast.error(t("takeover.failed"), { description: t("takeover.failedDescription") });
    },
  });

  if (!canOfferTakeover && !relayed.waiting) return null;

  return (
    <div data-bridge-capture-takeover role="status" className={`${BANNER} bg-status-waiting/15`}>
      <p>{t("takeover.notice")}</p>
      <Button
        size="sm"
        className="mt-2 h-7 text-[11px]"
        disabled={relayed.waiting}
        onClick={() => {
          if (relay.takeOverCapture()) relayed.expect(true);
        }}
      >
        {t("takeover.action")}
      </Button>
    </div>
  );
}
