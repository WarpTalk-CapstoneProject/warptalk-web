"use client";

/**
 * SLOT: the right end of the widget dock. Owner: WT-525 t4.
 *
 * CONTRACT
 *   `export function SettingsFlyout()` — no props; read from `useBridgeWidget()`.
 *   The gear (a `DockIconButton`, `hasPopup="dialog"`, `tooltipAlign="end"`) and the flyout it
 *   opens, drawn like MeetingControlBar's settings menu: rows of icon + label + value + chevron,
 *   and sub-panels with a back header. The shell renders this inside a right-aligned
 *   `flex items-center gap-1.5` group; the dock is `relative`, which is what the flyout is
 *   positioned against.
 *
 * WHAT IS HERE, AND WHAT IS NOT
 *   Mic noise filter ›   the caller's own STT denoising (settings/mic-noise-filter-panel.tsx)
 *   Voice ›              a slot for the shared VoicePanel (settings/voice-panel-slot.tsx)
 *   Flash mode           room speed; the host flips it, everyone else reads it
 *
 *   Not "Noise suppression": in a bridge room nobody hears the raw mic, so Krisp only affects
 *   recognition and would be a second row for what Mic noise filter already controls — see
 *   mic-noise-filter-panel.tsx. Not layout, blur, camera, copy link: Meet owns the call.
 *
 * WHY IT IS NOT PORTALLED LIKE THE MEETING'S FLYOUTS
 *   The meeting bar portals its menus because a scroll container clips them (see flyout.tsx).
 *   Nothing clips the dock, and this window is 460px wide and always on top: a flyout positioned
 *   inside it cannot land off-screen or behind Meet, and staying in the DOM subtree is what keeps
 *   the click-outside check a plain `contains`.
 */

import { useEffect, useId, useRef, useState } from "react";
import { GearSix, Lightning, Microphone, SpeakerHigh } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion } from "motion/react";

import { noiseReductionLabel } from "@/lib/meeting/noise-reduction";
import { cn } from "@/lib/utils";

import { DockIconButton } from "./dock-icon-button";
import { FlashModeRow } from "./settings/flash-mode-row";
import { MicNoiseFilterOptions, useMicNoiseFilterMode } from "./settings/mic-noise-filter-panel";
import { SettingsPanelHeader, SettingsRow } from "./settings/settings-rows";
import { VoicePanelSlot } from "./settings/voice-panel-slot";
import { useBridgeWidget } from "./widget-context";

type SettingsSection = "root" | "microphone" | "voice";

const FLYOUT_LABEL = "Voice & translation settings";

export function SettingsFlyout() {
  const { roomId, isHost } = useBridgeWidget();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>("root");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const flyoutId = useId();

  // Read here rather than inside the sub-panel so the root row can name the current mode.
  const noiseReductionMode = useMicNoiseFilterMode(roomId);

  function close({ returnFocus = false } = {}) {
    setOpen(false);
    // Reopening lands on the root, as the meeting menu's does.
    setSection("root");
    if (returnFocus) triggerRef.current?.focus();
  }

  // Esc and a press outside close it (WT-272's rule for every flyout: a panel you can only shut
  // by finding its trigger again is one people end up double-clicking into nothing).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSection("root");
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      // Esc in a sub-panel steps back first, like the back header; at the root it closes and
      // hands focus back to the gear rather than dropping it on the document.
      if (section !== "root") {
        setSection("root");
        return;
      }
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
  }, [open, section]);

  // A keyboard user who drilled into a panel lands on its way back out; one who came back out
  // lands on the flyout itself, because the back button they were on has just unmounted and focus
  // would otherwise fall to the document.
  const lastSectionRef = useRef<SettingsSection>("root");
  useEffect(() => {
    if (!open) {
      lastSectionRef.current = "root";
      return;
    }
    if (section !== "root") backRef.current?.focus();
    else if (lastSectionRef.current !== "root") dialogRef.current?.focus();
    lastSectionRef.current = section;
  }, [open, section]);

  return (
    <div
      ref={containerRef}
      // While the flyout is open, the gear's own hover tooltip would draw on top of the flyout's
      // bottom edge — the mouse is still on the gear right after the click — and it only repeats
      // the flyout's name. DockIconButton has no prop to hide it, and its file is not this task's,
      // so it is hidden from here by its shape (the aria-hidden span beside the button).
      // TODO(WT-525): replace with a `tooltipHidden` prop on DockIconButton.
      className={cn("flex items-center", open && "[&>span>span[aria-hidden=true]]:!opacity-0")}
    >
      <DockIconButton
        ref={triggerRef}
        label={FLYOUT_LABEL}
        icon={<GearSix size={17} />}
        onClick={() => (open ? close() : setOpen(true))}
        active={open}
        hasPopup="dialog"
        expanded={open}
        controls={flyoutId}
        tooltipAlign="end"
      />

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={dialogRef}
            id={flyoutId}
            role="dialog"
            aria-label={FLYOUT_LABEL}
            tabIndex={-1}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            // Upward from the dock's right edge. The height cap is the smaller of the design's
            // ~430px and what is left above the dock, so a window dragged down to its 240px
            // minimum still scrolls the flyout instead of pushing it out of the top.
            className="absolute bottom-full right-3 z-50 mb-2 max-h-[min(430px,calc(100dvh-4.5rem))] w-[264px] max-w-[calc(100%-1.5rem)] origin-bottom-right overflow-y-auto rounded-lg border border-border bg-surface-1 p-1 shadow-lg outline-none"
          >
            {section === "root" ? (
              <>
                <SettingsRow
                  label="Mic noise filter"
                  icon={<Microphone className="h-4 w-4" />}
                  value={noiseReductionLabel(noiseReductionMode)}
                  onClick={() => setSection("microphone")}
                  hasSubmenu
                />
                <SettingsRow
                  label="Voice"
                  icon={<SpeakerHigh className="h-4 w-4" />}
                  onClick={() => setSection("voice")}
                  hasSubmenu
                />
                {/* Apart from the rows above, with its own heading, as in the meeting: those are
                    about this user; this one changes the room for everybody in it. */}
                <div className="my-1 h-[1px] bg-surface-3" />
                <p className="flex items-center gap-1.5 px-2.5 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                  <Lightning className="h-3 w-3" weight="fill" aria-hidden="true" />
                  Room speed
                </p>
                <FlashModeRow roomId={roomId} isHost={isHost} />
              </>
            ) : null}

            {section === "microphone" ? (
              <>
                <SettingsPanelHeader
                  ref={backRef}
                  title="Mic noise filter"
                  onBack={() => setSection("root")}
                />
                <MicNoiseFilterOptions
                  roomId={roomId}
                  mode={noiseReductionMode}
                  onPicked={() => close({ returnFocus: true })}
                />
              </>
            ) : null}

            {section === "voice" ? (
              <>
                <SettingsPanelHeader ref={backRef} title="Voice" onBack={() => setSection("root")} />
                <VoicePanelSlot />
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
