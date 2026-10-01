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
 *   W4b: the popup asks the main window to carry its room when nobody answers
 *   (use-bridge-widget-state.ts), so a pill with nobody behind it is the rare case. Then the pill
 *   is dimmed and says why, and the notice above the panes offers "Show WarpTalk". Falling back to
 *   the hub would make a change the next meeting window silently undoes.
 *
 *   The menu itself is bridge-language-menu.tsx — the native picker, shared with the language step
 *   that opens a never-started room.
 *
 * The widget context's `readerLanguage` follows the language the main window reports this user
 * HEARS, so the transcript pane reads the same language the dub speaks. A pick also sets it at
 * once, before the main window confirms.
 */

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CaretDown, Translate } from "@phosphor-icons/react/dist/ssr";

import { getLanguageName } from "@/lib/language/languages";
import { cn } from "@/lib/utils";

import { BridgeLanguageMenu, useBridgeLanguagePick } from "./bridge-language-menu";
import { useBridgeWidget } from "./widget-context";

export function DockLanguagePill() {
  const t = useTranslations("rooms.bridgeWidget");
  const tPicker = useTranslations("meetingControlBar");
  const { translationStarted } = useBridgeWidget();
  const { enabled, status, shownLanguage, options, pick } = useBridgeLanguagePick();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const hintId = useId();

  // Derived, not synced: a main window that leaves while the menu is open must take the menu with
  // it, and an effect closing it would render it once more pointing at nobody.
  const menuOpen = open && enabled;

  function onPick(language: string) {
    if (!pick(language)) return;
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
  // What the tooltip says, by what the relay knows about the main window. The no-main-window case
  // also has a notice with "Show WarpTalk" above the panes (relay-carry-notice.tsx); this only says
  // why the pill is dimmed.
  const hint =
    status === "connected"
      ? t("language.connected")
      : status === "waiting"
        ? t("relay.waiting")
        : status === "incompatible"
          ? t("relay.incompatible")
          : t("relay.noHost");

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
          aria-busy={status === "waiting"}
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
            {shownLanguage ? getLanguageName(shownLanguage) : tPicker("languagePicker.setLanguage")}
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
          aria-label={tPicker("languagePicker.myLanguage.title")}
          className="absolute bottom-full left-3 z-50 mb-2 max-h-[min(24rem,calc(100dvh-4.5rem))] w-64 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl border border-border bg-surface-1 p-1.5 shadow-lg"
        >
          <BridgeLanguageMenu shownLanguage={shownLanguage} options={options} onPick={onPick} />
        </div>
      ) : null}
    </div>
  );
}
