"use client";

/**
 * SLOT: the language pill in the widget dock, after the separator. Owner: WT-525 t4.
 *
 * CONTRACT
 *   `export function DockLanguagePill()` — no props; read from `useBridgeWidget()`.
 *   One language — what this user speaks, and what everyone else is translated into for them —
 *   picked the way the meeting's `LanguagePairPicker` (meeting-control-bar.tsx) picks it: a pill
 *   with the Translate icon, the language and a caret; a "My language" menu of the room's
 *   languages; an "Another language" disclosure for the ones the workspace allows and the room
 *   does not offer. The pill may shrink (`min-w-0`, ellipsis) — it is the one flexible item in the
 *   dock row. The menu opens upward, positioned against the dock (`relative`).
 *
 * A PICK GOES TO THE MAIN WINDOW, NOT TO THE HUB
 *   This window's hub connection could invoke SetSpeakLanguage / SetListenLanguage, and the change
 *   would not stick: the main window holds the language in its own state and re-sends it on every
 *   hub reconnect. So a pick is relayed (lib/meeting/bridge-widget-relay) and the main window
 *   applies it exactly as its own picker would — both halves, then the remembered profile — and
 *   the pill shows what the main window then reports back.
 *
 *   When no main window is running this room's meeting — nobody answers within
 *   BRIDGE_WIDGET_HOST_ANSWER_TIMEOUT_MS, or it left — the pill is disabled and says to open it.
 *   Falling back to the hub then would make a change the next meeting window silently undoes.
 *
 * The widget context's `readerLanguage` follows the language the main window reports this user
 * HEARS, so the transcript pane reads the same language the dub speaks. A pick also sets it at
 * once, before the main window confirms.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CaretDown, CaretRight, CheckCircle, Translate } from "@phosphor-icons/react/dist/ssr";

import { useJoinLanguagePolicy } from "@/hooks/use-translationRooms";
import {
  getLanguageCode,
  getLanguageName,
  isLanguageAllowedByPolicy,
  meetingLanguageSet,
  meetingLanguagesForPolicy,
  normalizeLanguageCode,
} from "@/lib/language/languages";
import {
  bridgeWidgetReaderLanguage,
  bridgeWidgetShownLanguage,
  canRelayLanguagePick,
  type BridgeWidgetRelayStatus,
} from "@/lib/meeting/bridge-widget-relay";
import { cn } from "@/lib/utils";

import { useBridgeWidgetRelayClient } from "./settings/use-bridge-widget-relay-client";
import { useBridgeWidget } from "./widget-context";

/** What the pill's tooltip says, by what the relay knows about the main window. */
const PILL_HINT: Record<BridgeWidgetRelayStatus, string> = {
  waiting: "Connecting to the WarpTalk window…",
  connected: "Choose your language",
  "no-host": "Open the WarpTalk window to change language",
  incompatible: "WarpTalk was updated. Reload it to change language here.",
};

export function DockLanguagePill() {
  const { roomId, room, translationStarted, readerLanguage, setReaderLanguage } = useBridgeWidget();
  const { view, pickLanguage } = useBridgeWidgetRelayClient(roomId);
  const [open, setOpen] = useState(false);
  const [showOtherLanguages, setShowOtherLanguages] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const hintId = useId();

  const enabled = canRelayLanguagePick(view);
  // Derived, not synced: a main window that leaves while the menu is open must take the menu with
  // it, and an effect closing it would render it once more pointing at nobody.
  const menuOpen = open && enabled;
  const shownLanguage = bridgeWidgetShownLanguage(view, readerLanguage);

  // The main window's reader language wins over this window's own guess. Only when the relay
  // has one: with no main window, the context's own resolution is all there is.
  const relayedReaderLanguage = bridgeWidgetReaderLanguage(view);
  useEffect(() => {
    if (relayedReaderLanguage && relayedReaderLanguage !== readerLanguage) {
      setReaderLanguage(relayedReaderLanguage);
    }
  }, [relayedReaderLanguage, readerLanguage, setReaderLanguage]);

  // The workspace's language policy for THIS room — the public per-room read, which is
  // persistent-meeting-session's primary source too (it answers for guests, and is about the
  // room's workspace rather than whichever one is selected).
  const { data: languagePolicy } = useJoinLanguagePolicy(room?.translationRoomCode ?? "");
  const allowedTargetLanguages = languagePolicy?.allowedTargetLanguages;

  // The room's languages, as `availableListenLanguages` in persistent-meeting-session builds
  // them: the room's set plus the language this user is on now, narrowed by the workspace policy
  // — except the current one, which stays even if the policy has since dropped it, because
  // removing the selected option from its own menu leaves no way to move off it.
  const roomLanguages = useMemo(() => {
    const codes = new Set<string>();
    for (const language of meetingLanguageSet(room?.sourceLanguage, room?.targetLanguages)) {
      codes.add(normalizeLanguageCode(language));
    }
    if (shownLanguage) codes.add(shownLanguage);
    return Array.from(codes).filter(
      (code) =>
        Boolean(code) &&
        (code === shownLanguage || isLanguageAllowedByPolicy(code, allowedTargetLanguages)),
    );
  }, [room?.sourceLanguage, room?.targetLanguages, shownLanguage, allowedTargetLanguages]);

  // The meeting bar's `languagesNotAlreadyOffered`, which is module-private there: every meeting
  // language the WORKSPACE permits (WT-497 — never "every language WarpTalk knows"), minus the
  // ones the room already offers. `meetingLanguagesForPolicy` keeps an empty policy meaning
  // "unrestricted", so a policy still loading leaves this at full width rather than empty.
  const otherLanguages = useMemo(
    () =>
      meetingLanguagesForPolicy(allowedTargetLanguages)
        .map((language) => language.code)
        .filter((code) => !roomLanguages.includes(code)),
    [allowedTargetLanguages, roomLanguages],
  );

  function pick(language: string) {
    if (!enabled) return;
    pickLanguage(language);
    // At once: the transcript should switch with the pill, not a round trip later.
    setReaderLanguage(language);
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // Rings the pill while translation runs and nothing has been chosen — the one moment the choice
  // is urgent. Same condition as the meeting bar's `highlight`.
  const highlight = enabled && translationStarted && !shownLanguage;
  const hint = PILL_HINT[view.status];

  return (
    // Not `relative`: the menu is positioned against the dock, so it can use the dock's full width
    // in a window as narrow as 320px instead of starting wherever the pill happens to sit.
    <div ref={containerRef} className="flex min-w-0">
      <span className="group/pill relative inline-flex min-w-0">
        <button
          ref={triggerRef}
          type="button"
          // aria-disabled rather than disabled: a disabled button cannot take focus, and then a
          // keyboard user never hears WHY they cannot change their language.
          aria-disabled={!enabled}
          aria-describedby={hintId}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-busy={view.status === "waiting"}
          onClick={() => {
            if (enabled) setOpen((current) => !current);
          }}
          className={cn(
            "flex h-[34px] min-w-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[13px] font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
            highlight
              ? "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/15"
              : "border-border bg-surface-1 text-ink hover:bg-surface-3",
            !enabled && "cursor-not-allowed opacity-50 hover:bg-surface-1",
          )}
        >
          <Translate className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">
            {shownLanguage ? getLanguageName(shownLanguage) : "Set language"}
          </span>
          <CaretDown
            className={cn("h-3 w-3 shrink-0 transition-transform", menuOpen && "rotate-180")}
            weight="bold"
          />
        </button>
        {/* The CSS tooltip DockIconButton uses, for the same reasons (no Tooltip component, and
            one that cannot escape a 460px always-on-top window). Hidden from the accessibility
            tree and referenced by aria-describedby, so it is announced once. Suppressed while
            the menu is open: it would sit on top of it. */}
        <span
          id={hintId}
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute bottom-[calc(100%+7px)] left-0 z-50 whitespace-nowrap rounded-[5px] bg-ink px-2 py-1 text-[11px] font-medium leading-tight text-canvas opacity-0 shadow-sm transition-opacity duration-100",
            !menuOpen && "group-hover/pill:opacity-100 group-has-[:focus-visible]/pill:opacity-100",
          )}
        >
          {hint}
        </span>
      </span>

      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label="My language"
          className="absolute bottom-full left-3 z-50 mb-2 max-h-[min(24rem,calc(100dvh-4.5rem))] w-64 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl border border-border bg-surface-1 p-1.5 shadow-lg"
        >
          <LanguageColumn
            title="My language"
            hint="What you speak, and what everyone else is translated into for you."
            options={roomLanguages}
            selected={shownLanguage || undefined}
            onSelect={pick}
          />

          {/* The room's languages are what is OFFERED, not what a person is limited to — somebody
              who speaks Korean in a Vietnamese/Japanese room can still say so. Behind a
              disclosure because the room's set is the right answer for almost everybody. */}
          {otherLanguages.length > 0 ? (
            <>
              <div className="my-1 h-[1px] bg-border" />
              {showOtherLanguages ? (
                <LanguageColumn
                  title="Other languages"
                  hint="Not offered by this room, but still translated for you."
                  options={otherLanguages}
                  selected={shownLanguage || undefined}
                  onSelect={pick}
                />
              ) : (
                <button
                  type="button"
                  aria-expanded={false}
                  onClick={() => setShowOtherLanguages(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <CaretRight className="h-3 w-3" weight="bold" />
                  <span>Another language</span>
                </button>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One section of the menu, drawn as the meeting picker's `LanguageColumn` (module-private there):
 * a title, a one-line hint, then code + name + a filled check on the one in use.
 */
function LanguageColumn({
  title,
  hint,
  options,
  selected,
  onSelect,
}: {
  title: string;
  hint: string;
  options: string[];
  selected?: string;
  onSelect: (language: string) => void;
}) {
  return (
    <div role="group" aria-label={title}>
      <p className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
        {title}
      </p>
      <p className="px-2.5 pb-1 text-[11px] leading-snug text-ink-muted">{hint}</p>
      <div className="max-h-40 overflow-y-auto">
        {options.map((language) => {
          const active = selected === language;
          return (
            <button
              key={language}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onClick={() => onSelect(language)}
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
    </div>
  );
}
