"use client";

/**
 * Text-only bridge mode in the popup (PO, 2026-10-01): "How Meet hears you".
 *
 *   Translated voice  Meet's microphone is VB-CABLE; WarpTalk plays your translation into it.
 *   Your own voice    Meet keeps your real mic and speakers; nothing is played into a cable. You
 *                     still get the transcript and the translations as text (text-only mode).
 *
 * WHERE
 *   - the start step, before Start (both directions free);
 *   - Settings → "Meet hears you" once live, where only Translated voice → Your own voice is
 *     offered: the server refuses the other way while translation runs (409
 *     BRIDGE_AUDIO_MODE_LOCKED), and the option is greyed out with the reason instead.
 *
 * A PICK IS A RELAY INTENT (`set-audio-mode`). The main window owns the mode: it re-checks the
 * one-way rule, calls PUT .../bridge/audio-mode, stops routing into the cable, and says the new mode
 * on its next snapshot — which is what the chooser waits for (useRelayedSwitch), so a refused switch
 * is said here rather than in a window parked behind Google Meet.
 *
 * `BridgeMeetMicNotice` is the other half: the desktop reads which microphone Meet records from
 * (desktop #45) and the popup says when it disagrees with the mode.
 */

import { useTranslations } from "next-intl";
import { Headphones, Microphone, Subtitles, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  bridgeMeetMicMismatch,
  canChooseBridgeAudioMode,
  type BridgeAudioMode,
} from "@/lib/meeting/bridge-audio-mode";
import { cn } from "@/lib/utils";

import { useRelayedSwitch } from "./use-relayed-switch";
import { useBridgeWidget } from "./widget-context";

export type BridgeAudioModeSwitch = {
  /** The mode in force, or null while nobody has said. */
  mode: BridgeAudioMode | null;
  /** A switch was sent and the main window has not confirmed it yet. */
  waiting: boolean;
  /** Whether `mode` may be picked now, and if not, why (an i18n key under `audioMode`). */
  availability: (mode: BridgeAudioMode) => { allowed: boolean; reason: string | null };
  choose: (mode: BridgeAudioMode) => void;
};

export function useBridgeAudioModeSwitch(): BridgeAudioModeSwitch {
  const t = useTranslations("rooms.bridgeWidget");
  const { audioMode, canSwitchAudioMode, translationStarted, modeSupport, relay } = useBridgeWidget();
  const relayed = useRelayedSwitch(audioMode === "text", {
    onConfirmed: (text) => {
      if (text) toast.success(t("audioMode.nowText"));
      else toast.success(t("audioMode.nowVoice"));
    },
    onTimeout: (wantedText) => {
      // Asked for voice and still text while translating: the server's lock, said in its terms.
      if (!wantedText && translationStarted) {
        toast.error(t("audioMode.locked"), { description: t("audioMode.lockedDescription") });
      } else {
        toast.error(t("audioMode.failed"), { description: t("audioMode.failedDescription") });
      }
    },
  });

  const availability = (next: BridgeAudioMode) => {
    if (!canSwitchAudioMode || !audioMode) return { allowed: next === audioMode, reason: "noHost" };
    const allowed = canChooseBridgeAudioMode({
      current: audioMode,
      next,
      translationActive: translationStarted,
      support: modeSupport,
    });
    if (allowed) return { allowed, reason: null };
    if (next === "voice" && translationStarted && audioMode === "text") return { allowed, reason: "lockedHint" };
    return { allowed, reason: next === "voice" ? "voiceNeedsCable" : "textUnavailable" };
  };

  const choose = (next: BridgeAudioMode) => {
    if (!audioMode || next === audioMode || relayed.waiting) return;
    if (!availability(next).allowed) return;
    if (relay.setAudioMode(next)) relayed.expect(next === "text");
  };

  return { mode: audioMode, waiting: relayed.waiting, availability, choose };
}

const OPTIONS: { mode: BridgeAudioMode; icon: typeof Microphone }[] = [
  { mode: "voice", icon: Microphone },
  { mode: "text", icon: Subtitles },
];

/**
 * The chooser itself: two compact options, the hint of the one selected, and the headphones advice
 * in text mode. `compact` drops the heading for the settings sub-panel, whose header already says it.
 */
export function BridgeAudioModeChoice({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("rooms.bridgeWidget");
  const modeSwitch = useBridgeAudioModeSwitch();
  const { mode, waiting } = modeSwitch;
  const reasons = OPTIONS.map((option) => ({ option, ...modeSwitch.availability(option.mode) }));
  const shownReason = reasons.find((entry) => !entry.allowed && entry.option.mode !== mode)?.reason ?? null;

  return (
    <div data-bridge-audio-mode className={cn(compact ? "px-1.5 py-1" : "")}>
      {compact ? null : (
        <p id="bridge-audio-mode-label" className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
          {t("audioMode.label")}
        </p>
      )}
      <div
        role="radiogroup"
        aria-label={t("audioMode.label")}
        aria-busy={waiting || undefined}
        className="grid grid-cols-2 gap-1.5"
      >
        {reasons.map(({ option, allowed }) => {
          const selected = mode === option.mode;
          const Icon = option.icon;
          return (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              data-bridge-audio-mode-option={option.mode}
              disabled={waiting || (!selected && !allowed)}
              onClick={() => modeSwitch.choose(option.mode)}
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[12px] font-medium transition-colors",
                selected
                  ? "border-primary bg-primary/10 text-ink"
                  : "border-border bg-surface-1 text-ink-muted hover:bg-surface-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <Icon size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{t(`audioMode.${option.mode}`)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">
        {mode ? t(`audioMode.${mode}Hint`) : t("audioMode.unknown")}
      </p>
      {shownReason && shownReason !== "noHost" ? (
        <p data-bridge-audio-mode-reason className="mt-1 text-[11px] leading-snug text-ink-subtle">
          {t(`audioMode.${shownReason}`)}
        </p>
      ) : null}
      {mode === "text" ? (
        <p data-bridge-headphones-hint className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-ink-muted">
          <Headphones size={13} className="mt-px shrink-0" aria-hidden="true" />
          <span>{t("audioMode.headphones")}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * The Meet-microphone check (desktop #45): said when what Meet records from disagrees with the mode.
 *
 *   text + Meet on the cable   nothing is played into the cable any more: the call hears silence.
 *                              Offer translated voice back only where it is allowed (not while
 *                              translating, and with the cable installed). Where translation
 *                              running is what forbids it, say so and say the two ways out (real
 *                              mic in Meet, or Stop → Translated voice → Start): a greyed-out
 *                              option in a settings panel nobody opens is not an answer.
 *   voice + Meet on real mic   the call hears this user untranslated. Voice → text is always
 *                              allowed, so "Use my own voice" is always offered.
 *
 * `unknown` and `ambiguous` say nothing: a muted Meet records from no microphone at all.
 *
 * The banner alone, no toast: a toast is drawn in this same popup, so it reached nobody the banner
 * did not, said the title twice and covered the popup's header (PO, 2026-10-02). The copy names what
 * the people in the call hear, which setting causes it, and the one thing to click in Meet; it never
 * says "this mode", because the popup's own Text / Voice switch is a different setting.
 */
export function BridgeMeetMicNotice() {
  const t = useTranslations("rooms.bridgeWidget");
  const { meetMic, audioMode } = useBridgeWidget();
  const modeSwitch = useBridgeAudioModeSwitch();
  const mismatch = bridgeMeetMicMismatch({ audioMode, meetMic });

  if (!mismatch) return null;
  const key = mismatch === "text-on-cable" ? "textOnCable" : "voiceOnReal";
  const target: BridgeAudioMode = mismatch === "text-on-cable" ? "voice" : "text";
  const availability = modeSwitch.availability(target);
  const canSwitch = availability.allowed;
  const lockedByTranslation = mismatch === "text-on-cable" && availability.reason === "lockedHint";

  return (
    <div
      data-bridge-meet-mic-mismatch={mismatch}
      role="alert"
      className="shrink-0 border-b border-border bg-status-waiting/15 px-3.5 py-2 text-[11px] leading-snug text-ink"
    >
      <p className="flex items-start gap-1.5">
        <WarningCircle size={14} weight="fill" className="mt-px shrink-0 text-status-waiting" aria-hidden="true" />
        <span>
          <span className="font-semibold">{t(`meetMic.${key}.title`)}</span> {t(`meetMic.${key}.body`)}
        </span>
      </p>
      {lockedByTranslation ? (
        <p data-bridge-meet-mic-locked className="mt-1 pl-5 text-ink-muted">
          {t("meetMic.textOnCable.locked")}
        </p>
      ) : null}
      {canSwitch ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7 text-[11px]"
          disabled={modeSwitch.waiting}
          onClick={() => modeSwitch.choose(target)}
        >
          {t(`meetMic.${key}.action`)}
        </Button>
      ) : null}
    </div>
  );
}
