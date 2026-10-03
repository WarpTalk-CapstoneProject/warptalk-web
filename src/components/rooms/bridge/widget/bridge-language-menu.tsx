"use client";

/**
 * The popup's ONE language flow (PO, 2026-10-01): the meeting's own "My language" picker.
 *
 * Header "My language — What you speak, and what everyone else is translated into for you", the
 * room's languages with a check on the one in use, and an "Another language" disclosure. Drawn with
 * the native row renderer (components/rooms/live/language-column.tsx) and the native copy
 * (`meetingControlBar.languagePicker.*`), so the popup and the meeting cannot drift apart. Used in
 * two places: the language step that opens a never-started room (start-step.tsx) and the dock's
 * pill once live (dock-language-pill.tsx).
 *
 * A PICK GOES TO THE MAIN WINDOW, NOT TO THE HUB
 *   This window's hub could invoke SetSpeakLanguage / SetListenLanguage, and the change would not
 *   stick: the main window holds the language in its own state and re-sends it on every hub
 *   reconnect. So a pick is relayed (`set-language`, lib/meeting/bridge-widget-relay) and the main
 *   window applies it exactly as its own picker would (`applyRelayedLanguagePick`: both halves,
 *   then the remembered profile). The popup asks the main window to carry the room when nobody
 *   answers (use-bridge-widget-state.ts), so "no main window" is the rare case, not the normal one.
 *
 * THE HIERARCHY: see lib/meeting/bridge-language-options.ts. Members pick within the room's
 * languages; "Another language" (the workspace's) is offered only to the host or the capturer —
 * and only once the workspace policy has actually loaded. Until then (loading, no room code yet,
 * or the read failed) a short hint stands where it would be, never the full hard-coded list.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";

import { LanguageColumn } from "@/components/rooms/live/language-column";
import { useJoinLanguagePolicy } from "@/hooks/use-translationRooms";
import { normalizeLanguageCode } from "@/lib/language/languages";
import {
  bridgeLanguageOptions,
  bridgeLanguagePolicyStatus,
  type BridgeLanguageOptions,
  type BridgeLanguagePolicyStatus,
} from "@/lib/meeting/bridge-language-options";
import {
  bridgeWidgetReaderLanguage,
  bridgeWidgetShownLanguage,
  canRelayLanguagePick,
  type BridgeWidgetRelayStatus,
} from "@/lib/meeting/bridge-widget-relay";

import { useBridgeWidget } from "./widget-context";

export type BridgeLanguagePick = {
  /** A main window is connected, so a pick reaches the meeting. */
  enabled: boolean;
  status: BridgeWidgetRelayStatus;
  /** The one language shown as selected ("" when unset). */
  shownLanguage: string;
  options: BridgeLanguageOptions;
  /** Relay the pick. False (and nothing sent) without a connected main window. */
  pick: (language: string) => boolean;
};

/**
 * The workspace's language policy for THIS room, and whether it has actually been read (WT-910).
 *
 * The public per-room read, which is persistent-meeting-session's primary source too (it is about
 * the room's workspace rather than whichever one is selected). Its list alone cannot be trusted to
 * mean anything: null/empty is "unrestricted", and so was "not answered yet" — the query is off
 * until the room (and its code) is known, it takes a moment, and it can fail. `policyStatus` keeps
 * those apart so that only a loaded policy unlocks languages beyond the room's own; see
 * lib/meeting/bridge-language-options.ts. Shared with the dock's far-side pill, so both pickers
 * hold back the same way.
 */
export function useBridgeLanguagePolicy(): {
  allowedTargetLanguages: string[] | null | undefined;
  policyStatus: BridgeLanguagePolicyStatus;
} {
  const { room } = useBridgeWidget();
  const { data, isPlaceholderData, isError } = useJoinLanguagePolicy(room?.translationRoomCode ?? "");
  const policyStatus = bridgeLanguagePolicyStatus({ hasData: data !== undefined, isPlaceholderData, isError });
  return {
    allowedTargetLanguages: policyStatus === "known" ? data?.allowedTargetLanguages : undefined,
    policyStatus,
  };
}

export function useBridgeLanguagePick(): BridgeLanguagePick {
  const { room, relay, readerLanguage, setReaderLanguage, canControl } = useBridgeWidget();
  const { view, pickLanguage } = relay;
  const enabled = canRelayLanguagePick(view);
  const shownLanguage = bridgeWidgetShownLanguage(view, readerLanguage);

  // The main window's reader language wins over this window's own guess. Only when the relay has
  // one: with no main window, the context's own resolution is all there is.
  const relayedReaderLanguage = bridgeWidgetReaderLanguage(view);
  useEffect(() => {
    if (relayedReaderLanguage && relayedReaderLanguage !== readerLanguage) {
      setReaderLanguage(relayedReaderLanguage);
    }
  }, [relayedReaderLanguage, readerLanguage, setReaderLanguage]);

  const { allowedTargetLanguages, policyStatus } = useBridgeLanguagePolicy();

  const options = useMemo(
    () =>
      bridgeLanguageOptions({
        sourceLanguage: room?.sourceLanguage,
        targetLanguages: room?.targetLanguages,
        current: shownLanguage,
        allowedTargetLanguages,
        policyStatus,
        canAddLanguages: canControl,
      }),
    [room?.sourceLanguage, room?.targetLanguages, shownLanguage, allowedTargetLanguages, policyStatus, canControl],
  );

  function pick(language: string): boolean {
    const code = normalizeLanguageCode(language);
    if (!enabled || !code) return false;
    pickLanguage(code);
    // At once: the transcript should switch with the picker, not a round trip later.
    setReaderLanguage(code);
    return true;
  }

  return { enabled, status: view.status, shownLanguage, options, pick };
}

/** The native picker's body: "My language", then "Another language" behind a disclosure. */
export function BridgeLanguageMenu({
  shownLanguage,
  options,
  onPick,
}: {
  shownLanguage: string;
  options: BridgeLanguageOptions;
  onPick: (language: string) => void;
}) {
  const t = useTranslations("meetingControlBar");
  const tPolicy = useTranslations("rooms.bridgeWidget.languagePolicy");
  const [showOtherLanguages, setShowOtherLanguages] = useState(false);
  // Somebody already on an off-room language must see the section that holds their selection.
  const onAnOffMenuLanguage =
    shownLanguage.length > 0 && options.otherLanguages.includes(shownLanguage);
  const otherLanguagesVisible = showOtherLanguages || onAnOffMenuLanguage;

  return (
    <>
      <LanguageColumn
        title={t("languagePicker.myLanguage.title")}
        hint={t("languagePicker.myLanguage.hint")}
        options={options.roomLanguages}
        selected={shownLanguage || undefined}
        onSelect={onPick}
      />

      {options.otherLanguages.length > 0 ? (
        <>
          <div className="my-1 h-[1px] bg-border" />
          {otherLanguagesVisible ? (
            <LanguageColumn
              title={t("languagePicker.otherLanguages.title")}
              hint={t("languagePicker.otherLanguages.hint")}
              options={options.otherLanguages}
              selected={shownLanguage || undefined}
              onSelect={onPick}
            />
          ) : (
            <button
              type="button"
              aria-expanded={false}
              onClick={() => setShowOtherLanguages(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <CaretRight className="h-3 w-3" weight="bold" />
              <span>{t("languagePicker.otherLanguages.disclosure")}</span>
            </button>
          )}
        </>
      ) : options.otherLanguagesWithheld ? (
        // Where "Another language" would be, for the host/capturer, while the workspace policy is
        // not known: one compact line instead of the full hard-coded list (WT-910).
        <>
          <div className="my-1 h-[1px] bg-border" />
          <p
            role={options.otherLanguagesWithheld === "error" ? "alert" : "status"}
            data-slot="bridge-language-policy-hint"
            className="px-2.5 py-1.5 text-[11px] leading-snug text-ink-muted"
          >
            {options.otherLanguagesWithheld === "error"
              ? tPolicy("error")
              : tPolicy("loading")}
          </p>
        </>
      ) : null}
    </>
  );
}
