"use client";

/**
 * SLOT: "They speak" — what the other side of the Google Meet call speaks. Beside the host's own
 * language pill in the widget dock, plus the notice above the dock when the pair cannot translate.
 *
 * WHY IT EXISTS
 *   A bridge room is the host plus one "External Meeting" stand-in for everyone on the far side.
 *   The stand-in's language is what the host is translated INTO and what the far side is
 *   translated FROM; the host's pill beside this one could only ever set the host's half. With no
 *   way to say what the other side speaks, a room created with the wrong guess stayed wrong for the
 *   whole call — and the guess used to be the host's own language, which translates nothing.
 *
 * A PICK GOES STRAIGHT TO THE HUB, UNLIKE THE HOST'S PILL
 *   dock-language-pill.tsx relays through the main window because the main window re-sends the
 *   HOST's language on every reconnect and would undo a change made here. Nobody re-sends the
 *   stand-in's: it never connects to the hub. So `SetExternalMeetingLanguage` is invoked from this
 *   window's own connection. The gateway checks that the caller hosts this bridge room, writes the
 *   stand-in's STT hint, tells the room (the main window picks the dub it sends into Meet from the
 *   stand-in's language), and publishes the change that TranslationRoomService persists and
 *   re-routes the audio mesh from.
 *
 * Host only. The gateway refuses anybody else, so offering the control would be a guaranteed error
 * over someone's live call.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CaretDown, CheckCircle, UsersThree, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { useJoinLanguagePolicy } from "@/hooks/use-translationRooms";
import {
  getLanguageCode,
  getLanguageName,
  meetingLanguagesForPolicy,
  normalizeLanguageCode,
} from "@/lib/language/languages";
import { farSideLanguageProblem } from "@/lib/meeting/bridge-far-side-language";
import { isExternalBridge } from "@/lib/meeting/meeting-types";
import { cn } from "@/lib/utils";

import { useBridgeWidget } from "./widget-context";

/** The gateway's HubException text, without SignalR's "An unexpected error occurred invoking…". */
function hubRefusal(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const marker = "HubException: ";
  const at = message.indexOf(marker);
  return at === -1 ? null : message.slice(at + marker.length).trim() || null;
}

function useFarSideLanguagePolicy() {
  const { room } = useBridgeWidget();
  // The same public per-room read the host's pill uses: it is about the ROOM's workspace.
  const { data: languagePolicy } = useJoinLanguagePolicy(room?.translationRoomCode ?? "");
  return languagePolicy?.allowedTargetLanguages;
}

export function DockFarSideLanguagePill() {
  const t = useTranslations("rooms.bridgeFarSide");
  const {
    roomId,
    room,
    isHost,
    hub,
    connectionState,
    readerLanguage,
    farSideLanguage,
    setFarSideLanguage,
  } = useBridgeWidget();
  const allowedTargetLanguages = useFarSideLanguagePolicy();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const hintId = useId();

  const enabled = Boolean(hub) && connectionState === "live" && !pending;
  const menuOpen = open && enabled;

  // Every meeting language the workspace allows. The current one stays even if the policy has
  // since dropped it: removing the selected option from its own menu leaves no way to move off it.
  const options = useMemo(() => {
    const codes = meetingLanguagesForPolicy(allowedTargetLanguages).map((language) => language.code);
    if (farSideLanguage && !codes.includes(farSideLanguage)) codes.unshift(farSideLanguage);
    return codes;
  }, [allowedTargetLanguages, farSideLanguage]);

  const problem = farSideLanguageProblem({
    hostLanguage: readerLanguage,
    farSideLanguage,
    allowedLanguages: allowedTargetLanguages,
  });

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

  if (!isHost || (room && !isExternalBridge(room.translationRoomType))) return null;

  function pick(language: string) {
    if (!enabled || !hub) return;
    setOpen(false);
    triggerRef.current?.focus();
    const code = normalizeLanguageCode(language);
    if (!code || code === farSideLanguage) return;

    const previous = farSideLanguage;
    // At once, like the host's pill: the dock should agree with the choice, not a round trip later.
    setFarSideLanguage(code);
    setPending(true);
    hub
      .invoke("SetExternalMeetingLanguage", roomId, code)
      .catch((error: unknown) => {
        if (previous) setFarSideLanguage(previous);
        toast.error(t("failed"), { description: hubRefusal(error) ?? undefined });
      })
      .finally(() => setPending(false));
  }

  const hint = connectionState === "live" ? t("hint") : t("connecting");
  const shown = farSideLanguage ? getLanguageCode(farSideLanguage) : t("notSet");

  return (
    <div ref={containerRef} className="flex min-w-0 shrink-0">
      <span className="group/farside relative inline-flex min-w-0">
        <button
          ref={triggerRef}
          type="button"
          aria-disabled={!enabled}
          aria-describedby={hintId}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-busy={pending || connectionState === "connecting"}
          aria-label={
            farSideLanguage
              ? t("ariaLabel", { language: getLanguageName(farSideLanguage) })
              : t("label")
          }
          onClick={() => {
            if (enabled) setOpen((current) => !current);
          }}
          className={cn(
            "flex h-[34px] min-w-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[13px] font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
            problem
              ? "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/15"
              : "border-border bg-surface-1 text-ink hover:bg-surface-3",
            !enabled && "cursor-not-allowed opacity-50 hover:bg-surface-1",
          )}
        >
          <UsersThree className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{shown}</span>
          <CaretDown
            className={cn("h-3 w-3 shrink-0 transition-transform", menuOpen && "rotate-180")}
            weight="bold"
          />
        </button>
        <span
          id={hintId}
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute bottom-[calc(100%+7px)] left-0 z-50 whitespace-nowrap rounded-[5px] bg-ink px-2 py-1 text-[11px] font-medium leading-tight text-canvas opacity-0 shadow-sm transition-opacity duration-100",
            !menuOpen && "group-hover/farside:opacity-100 group-has-[:focus-visible]/farside:opacity-100",
          )}
        >
          {hint}
        </span>
      </span>

      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("label")}
          className="absolute bottom-full left-3 z-50 mb-2 max-h-[min(24rem,calc(100dvh-4.5rem))] w-64 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl border border-border bg-surface-1 p-1.5 shadow-lg"
        >
          <div role="group" aria-label={t("label")}>
            <p className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              {t("label")}
            </p>
            <p className="px-2.5 pb-1 text-[11px] leading-snug text-ink-muted">{t("menuHint")}</p>
            <div className="max-h-48 overflow-y-auto">
              {options.map((language) => {
                const active = farSideLanguage === language;
                return (
                  <button
                    key={language}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => pick(language)}
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
        </div>
      ) : null}
    </div>
  );
}

/**
 * The sentence above the dock when this room cannot translate: both seats are on one language.
 * Shown to the host only — the one person who can act on it, with the picker beside it or by
 * asking a workspace admin for a second language. Silent while either language is unknown.
 */
export function FarSideLanguageNotice() {
  const t = useTranslations("rooms.bridgeFarSide");
  const { room, isHost, readerLanguage, farSideLanguage } = useBridgeWidget();
  const allowedTargetLanguages = useFarSideLanguagePolicy();

  if (!isHost || (room && !isExternalBridge(room.translationRoomType))) return null;

  const problem = farSideLanguageProblem({
    hostLanguage: readerLanguage,
    farSideLanguage,
    allowedLanguages: allowedTargetLanguages,
  });
  if (!problem || !farSideLanguage) return null;

  const language = getLanguageName(farSideLanguage);
  return (
    <div
      role="status"
      data-slot="bridge-far-side-language-notice"
      className="flex shrink-0 items-start gap-2 border-t border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-snug text-amber-600"
    >
      <WarningCircle className="mt-px h-4 w-4 shrink-0" weight="fill" />
      <span>
        {problem === "single-language-workspace"
          ? t("singleLanguageWorkspace", { language })
          : t("sameLanguage", { language })}
      </span>
    </div>
  );
}
