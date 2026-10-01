"use client";

/**
 * The popup's first screen for a room that has never been started (PO, 2026-10-01, W4b).
 *
 * When the host enters the Google Meet call and the popup opens on a room whose translation has
 * never run, it shows the meeting's own "My language" picker as one compact step with one Start —
 * no three-field form, no separate "I speak / Meet speaks" selects. What the far side speaks has a
 * planned default (the claim sends it) and the dock's "They speak" changes it once live.
 *
 *   - The pick goes through the relay (`set-language`) like the dock's pill: the same hook and the
 *     same menu (bridge-language-menu.tsx), so the step and the dock cannot disagree.
 *   - Start is the dock's Start (`useStartBridgeTranslation`): activate, open, /resume. Offered to
 *     the host or the capturer (`canControl`); disabled until a language is shown.
 *   - A member cannot start; they pick their language and "Continue" to the transcript.
 *
 * Once translation has run, the step never comes back for the room: the dock's pill is where the
 * language changes from then on.
 */

import { useTranslations } from "next-intl";
import { Play, SpinnerGap } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";

import { BridgeLanguageMenu, useBridgeLanguagePick } from "./bridge-language-menu";
import { CaptureTakeoverNotice } from "./capture-takeover-notice";
import { useStartBridgeTranslation } from "./dock-session-controls";
import { RelayCarryNotice } from "./relay-carry-notice";
import { useBridgeWidget } from "./widget-context";

export function BridgeStartStep({ onContinue }: { onContinue: () => void }) {
  const t = useTranslations("rooms.bridgeWidget");
  const tPicker = useTranslations("meetingControlBar");
  const { room, canControl } = useBridgeWidget();
  const { enabled, shownLanguage, options, pick } = useBridgeLanguagePick();
  const starter = useStartBridgeTranslation();

  const canStart = canControl && Boolean(room) && Boolean(shownLanguage) && !starter.pending;

  return (
    <section
      data-slot="bridge-start-step"
      aria-labelledby="bridge-start-step-title"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="shrink-0 border-b border-border bg-surface-1 px-3.5 py-3">
        <h1 id="bridge-start-step-title" className="text-[14px] font-semibold text-ink">
          {t("startStep.title")}
        </h1>
        <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{t("startStep.intro")}</p>
      </div>

      <RelayCarryNotice />
      <CaptureTakeoverNotice />

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {/* The native picker's body. A menu of radio items, as in the meeting; dimmed while no main
            window is there to apply a pick (the notice above says why and what to do). */}
        <div
          role="menu"
          aria-label={tPicker("languagePicker.myLanguage.title")}
          aria-disabled={!enabled}
          className={enabled ? undefined : "pointer-events-none opacity-50"}
        >
          <BridgeLanguageMenu shownLanguage={shownLanguage} options={options} onPick={(code) => void pick(code)} />
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-surface-2 px-3 py-2.5">
        {canControl ? (
          <Button
            className="w-full"
            disabled={!canStart}
            title={shownLanguage ? undefined : t("startStep.pickFirst")}
            onClick={() => void starter.start()}
          >
            {starter.pending ? (
              <SpinnerGap size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Play size={16} weight="fill" aria-hidden="true" />
            )}
            {t("startStep.start")}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[11px] leading-snug text-ink-muted">
              {t("startStep.waitingForHost")}
            </p>
            <Button size="sm" variant="outline" onClick={onContinue}>
              {t("startStep.continue")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
