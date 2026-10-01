"use client";

/**
 * W4b: the popup's word on a main window that is NOT running this room — the only place the old
 * "Open the WarpTalk window to change language" dead end survives, and no longer a dead end.
 *
 * The popup asks the main window to carry its room as soon as nobody answers
 * (use-bridge-widget-state.ts). While that is in flight this says so; if it could not be done — no
 * desktop shell to ask, a native meeting running there that the shell will not replace, or no
 * answer — it says so and offers "Show WarpTalk" (`showDesktopMainWindow`), which brings up the one
 * window that can sort it out. Nothing while a main window is connected or still being asked for
 * the first time ("waiting").
 */

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { showDesktopMainWindow } from "@/lib/desktop/bridge";

import { useBridgeWidget } from "./widget-context";

const BANNER = "shrink-0 border-b border-border px-3.5 py-2 text-[11px] leading-snug text-ink";

export function RelayCarryNotice() {
  const t = useTranslations("rooms.bridgeWidget");
  const {
    relay: { view },
    carry,
  } = useBridgeWidget();

  if (view.status === "connected" || view.status === "waiting") return null;

  if (view.status === "incompatible") {
    return (
      <div data-bridge-relay-incompatible role="status" className={`${BANNER} bg-status-waiting/15`}>
        {t("carry.incompatible")}
      </div>
    );
  }

  if (carry === "asking") {
    return (
      <div data-bridge-relay-carrying role="status" className={`${BANNER} bg-surface-2`}>
        {t("carry.asking")}
      </div>
    );
  }

  return (
    <div data-bridge-relay-no-host role="status" className={`${BANNER} bg-status-waiting/15`}>
      <p>{t("carry.failed")}</p>
      <Button
        size="sm"
        variant="outline"
        className="mt-2 h-7 text-[11px]"
        onClick={() => void showDesktopMainWindow()}
      >
        {t("carry.show")}
      </Button>
    </div>
  );
}
