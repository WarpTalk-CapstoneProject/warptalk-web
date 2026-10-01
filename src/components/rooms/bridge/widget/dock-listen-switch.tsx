"use client";

/**
 * The dock's Text | Voice switch. WT-525.
 *
 * What the HOST HEARS, and nothing else:
 *   Text   read the translation; hear the call as it is.
 *   Voice  hear the other side translated, with their original voice quieter underneath.
 * The translated voice the host sends INTO Meet is not this switch's business — it keeps playing in
 * both positions (#481 separated the two). Text is the default, as it is everywhere a bridge
 * meeting starts.
 *
 * Two words rather than an icon toggle: the window floats over a call bar full of icon buttons, and
 * which of two listening modes is on has to be readable without hovering.
 *
 * The choice lives in the main window (voiceEnabled in persistent-meeting-session), so a press is
 * relayed and the switch shows what the main window then reports. With no main window to ask, the
 * switch is disabled and says why, like the language pill beside it — and the popup has already
 * asked the main window to carry the room (W4b, use-bridge-widget-state.ts).
 */

import { useId } from "react";
import { useTranslations } from "next-intl";
import { SpeakerHigh, TextAa } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

import { useBridgeWidget } from "./widget-context";

const OPTIONS = [
  { voice: false, key: "text", icon: TextAa },
  { voice: true, key: "voice", icon: SpeakerHigh },
] as const;

export function DockListenSwitch() {
  const t = useTranslations("rooms.bridgeWidget");
  const {
    relay: { view, setVoiceEnabled },
  } = useBridgeWidget();
  const hintId = useId();

  const connected = view.status === "connected" && view.snapshot !== null;
  const voiceEnabled = view.snapshot?.voiceEnabled ?? false;
  const hint =
    view.status === "waiting"
      ? t("relay.waiting")
      : view.status === "no-host"
        ? t("relay.noHost")
        : view.status === "incompatible"
          ? t("relay.incompatible")
          : voiceEnabled
            ? t("listen.voiceHint")
            : t("listen.textHint");

  return (
    <span className="group/listen relative inline-flex shrink-0">
      <span
        role="radiogroup"
        aria-label={t("listen.label")}
        aria-describedby={hintId}
        aria-disabled={!connected}
        className={cn(
          "flex h-[34px] items-center gap-0.5 rounded-[9px] border border-border bg-surface-1 p-0.5",
          !connected && "opacity-50",
        )}
      >
        {OPTIONS.map((option) => {
          const selected = connected && option.voice === voiceEnabled;
          const Icon = option.icon;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!connected}
              onClick={() => {
                if (!selected) setVoiceEnabled(option.voice);
              }}
              className={cn(
                "flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                "disabled:cursor-not-allowed",
                selected ? "bg-primary/10 text-primary" : "text-ink-muted hover:text-ink",
              )}
            >
              <Icon size={14} weight={selected ? "bold" : "regular"} aria-hidden="true" />
              {t(`listen.${option.key}`)}
            </button>
          );
        })}
      </span>
      {/* The dock's CSS tooltip, right-aligned so it stays inside the window. */}
      <span
        id={hintId}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute bottom-[calc(100%+7px)] right-0 z-50 w-max max-w-[240px] rounded-[5px] bg-ink px-2 py-1 text-[11px] font-medium leading-snug text-canvas opacity-0 shadow-sm transition-opacity duration-100",
          "group-hover/listen:opacity-100 group-has-[:focus-visible]/listen:opacity-100",
        )}
      >
        {hint}
      </span>
    </span>
  );
}
