"use client";

/**
 * The popup's first screen for a room that has never been started (PO, 2026-10-01, W4b).
 *
 * When the host enters the Google Meet call and the popup opens on a room whose translation has
 * never run, it shows the meeting's own "My language" picker as one compact step with one Start —
 * no three-field form.
 *
 * WT-909: WHAT THE OTHERS IN THE CALL SPEAK IS SHOWN HERE, BEFORE START
 *   The claim always names one (bridge-far-side-language.ts: the first offered language that is
 *   not the host's, as a native pre-join picks `options[0]`), and the only way to see or correct it
 *   used to be the dock's far-side pill once live. Now it is on this screen, pre-selected like a
 *   native pre-join. The list is the pill's own (`useFarSideLanguagePick`) minus the host's
 *   language, and a pick goes to the hub at once, exactly as the pill's does. A room whose far
 *   side still sits on the host's own language (claimed before this, or the host has since changed
 *   theirs to it) is snapped to the first option once — the pre-join's seed-or-snap rule.
 *
 *   - The pick goes through the relay (`set-language`) like the dock's pill: the same hook and the
 *     same menu (bridge-language-menu.tsx), so the step and the dock cannot disagree.
 *   - Start is the dock's Start (`useStartBridgeTranslation`): activate, open, /resume. Offered to
 *     the host or the capturer (`canControl`); disabled until a language is shown.
 *   - A member cannot start; they pick their language and "Continue" to the transcript.
 *
 * Once translation has run, the step never comes back for the room: the dock's pill is where the
 * language changes from then on.
 *
 * TEXT-ONLY BRIDGE (PO, 2026-10-01): "How Meet hears you" sits under the language — Translated voice
 * (VB-CABLE) or Your own voice (real mic, text only). Chosen HERE, before Start, where both
 * directions are free; once live only voice → text remains (settings). Any participant chooses their
 * own. The default is the machine's: the claim already started a cable-less machine in text, and a
 * room that is still on voice on such a machine is moved to text once, here (voice cannot run there).
 */

import { useTranslations } from "next-intl";
import { CheckCircle, Play, SpinnerGap } from "@phosphor-icons/react/dist/ssr";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

import { getLanguageCode, getLanguageName, normalizeLanguageCode } from "@/lib/language/languages";
import { cn } from "@/lib/utils";

import { BridgeAudioModeChoice, BridgeMeetMicNotice } from "./audio-mode-choice";
import { BridgeLanguageMenu, useBridgeLanguagePick } from "./bridge-language-menu";
import { CaptureTakeoverNotice } from "./capture-takeover-notice";
import { FarSideLanguageNotice, useFarSideLanguagePick } from "./dock-far-side-language-pill";
import { SessionDisplacedNotice } from "./session-displaced-notice";
import { useStartBridgeTranslation } from "./dock-session-controls";
import { RelayCarryNotice } from "./relay-carry-notice";
import { useBridgeWidget } from "./widget-context";

export function BridgeStartStep({ onContinue }: { onContinue: () => void }) {
  const t = useTranslations("rooms.bridgeWidget");
  const tPicker = useTranslations("meetingControlBar");
  const { room, canControl, roomId, audioMode, canSwitchAudioMode, modeSupport, translationStarted, relay } =
    useBridgeWidget();
  const { enabled, shownLanguage, options, pick } = useBridgeLanguagePick();
  const farSide = useFarSideLanguagePick();
  const starter = useStartBridgeTranslation();

  // The host's own language is not a choice for the others: it is what a claim that named no far
  // side falls back to, so a far side still on it has not been chosen yet.
  const ownLanguage = normalizeLanguageCode(shownLanguage ?? undefined);
  const farSideOptions = farSide.options.filter((language) => language !== ownLanguage);
  const farSideChosen = Boolean(farSide.farSideLanguage) && farSide.farSideLanguage !== ownLanguage;

  // Always one language picked, as on a native pre-join: snap an unset far side to the first
  // option, once per room. Only for whoever may change it, and only once the hub is live.
  const snappedRef = useRef<string | null>(null);
  const firstFarSideOption = farSideOptions[0];
  const { enabled: farSideEnabled, pick: pickFarSide } = farSide;
  useEffect(() => {
    if (!canControl || translationStarted || farSideChosen || !farSideEnabled || !firstFarSideOption) return;
    if (snappedRef.current === roomId) return;
    snappedRef.current = roomId;
    pickFarSide(firstFarSideOption);
  }, [canControl, translationStarted, farSideChosen, farSideEnabled, pickFarSide, firstFarSideOption, roomId]);

  // Voice cannot run on a machine without the cable: move such a room to text once, before Start.
  const defaultedRef = useRef<string | null>(null);
  useEffect(() => {
    if (defaultedRef.current === roomId || !canSwitchAudioMode || translationStarted) return;
    if (audioMode !== "voice" || !modeSupport || modeSupport.voice || !modeSupport.text) return;
    defaultedRef.current = roomId;
    relay.setAudioMode("text");
  }, [roomId, canSwitchAudioMode, translationStarted, audioMode, modeSupport, relay]);

  const canStart = canControl && Boolean(room) && Boolean(shownLanguage) && !farSide.pending && !starter.pending;

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
      <SessionDisplacedNotice />
      <CaptureTakeoverNotice />
      <BridgeMeetMicNotice />

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

        {/* WT-909: what the others in the call speak. Only for whoever may start — the same people
            the dock's pill is shown to. */}
        {canControl ? (
          <div
            role="group"
            aria-labelledby="bridge-start-step-far-side-title"
            data-slot="bridge-start-step-far-side"
            className={cn("mt-2 border-t border-border pt-2", !farSide.enabled && "pointer-events-none opacity-50")}
          >
            <p id="bridge-start-step-far-side-title" className="px-2.5 pt-1 text-[12px] font-semibold text-ink">
              {t("startStep.farSideTitle")}
            </p>
            <p className="px-2.5 pb-1 text-[11px] leading-snug text-ink-muted">{t("startStep.farSideHint")}</p>
            {farSideOptions.map((language) => {
              const active = farSideChosen && farSide.farSideLanguage === language;
              return (
                <button
                  key={language}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => farSide.pick(language)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                    active ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <span>{getLanguageCode(language)}</span>
                  <span className="flex-1 truncate">{getLanguageName(language)}</span>
                  {active ? <CheckCircle className="h-3.5 w-3.5 shrink-0" weight="fill" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Only the one-language workspace: "both on the same language" is just "not picked yet"
          on this screen, and the picker above already says so. */}
      {farSide.problem === "single-language-workspace" ? <FarSideLanguageNotice /> : null}

      {audioMode ? (
        <div className="shrink-0 border-t border-border bg-surface-1 px-3 py-2.5">
          <BridgeAudioModeChoice />
        </div>
      ) : null}

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
