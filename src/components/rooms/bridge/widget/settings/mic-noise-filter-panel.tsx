"use client";

/**
 * "Mic noise filter" — how much the STT provider denoises this user's own microphone before it is
 * transcribed (WT-427). The widget's copy of the meeting settings menu's panel. WT-525 t4.
 *
 * Called straight from this window, not relayed: it is a per-user, per-room value in Redis behind
 * a REST endpoint (useNoiseReduction / useSetNoiseReduction), not something the main window holds
 * in React state, so there is nothing there for a change made here to be overwritten by. No host
 * gate either, as in the meeting — it is the caller's own microphone.
 *
 * WHY THERE IS NO "NOISE SUPPRESSION" ROW BESIDE IT
 *   In the meeting that row is Krisp, and it changes what other people HEAR. In a bridge room
 *   nobody hears the raw microphone — the far side hears Meet, and WarpTalk only transcribes — so
 *   Krisp's one remaining effect is on recognition, which is exactly what this row controls. Two
 *   rows for one effect is the confusion the meeting menu spends a paragraph preventing; Krisp
 *   stays on silently.
 */

import { Check } from "@phosphor-icons/react/dist/ssr";

import { useNoiseReduction, useSetNoiseReduction } from "@/hooks/use-translationRooms";
import {
  NOISE_REDUCTION_MODES,
  noiseReductionDescription,
  noiseReductionLabel,
  type NoiseReductionMode,
} from "@/lib/meeting/noise-reduction";
import { cn } from "@/lib/utils";

/**
 * The mode as persistent-meeting-session reads it: the query, with "off" while it has not
 * answered (the hook's initialData, and what the STT worker does with no value).
 */
export function useMicNoiseFilterMode(roomId: string): NoiseReductionMode {
  const { data = "off" } = useNoiseReduction(roomId);
  return data;
}

export function MicNoiseFilterOptions({
  roomId,
  mode,
  onPicked,
}: {
  roomId: string;
  mode: NoiseReductionMode;
  /** Closes the flyout after a pick, as the meeting menu does. */
  onPicked: () => void;
}) {
  const setNoiseReduction = useSetNoiseReduction(roomId);

  return (
    <>
      {/* The native wording, verbatim: it says which layer this is, and this window has even more
          reason to say it — there is no call audio of the user's own here to compare against. */}
      <p className="px-2.5 pb-1 pt-0.5 text-[11px] leading-snug text-ink-muted">
        Filters your microphone before it is transcribed. Changes how accurately your words are
        recognised — not what other people hear.
      </p>
      <div role="radiogroup" aria-label="Mic noise filter">
        {NOISE_REDUCTION_MODES.map((option) => {
          const selected = mode === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              // Read-only while a change is in flight: the value shown is the one the SERVER
              // accepted (useSetNoiseReduction seeds the cache from its reply), so a second pick
              // racing the first could leave the row naming a mode the pipeline never took.
              disabled={setNoiseReduction.isPending}
              onClick={() => {
                setNoiseReduction.mutate(option);
                onPicked();
              }}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors disabled:opacity-60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                selected ? "bg-primary/10 text-primary" : "text-ink hover:bg-canvas",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{noiseReductionLabel(option)}</span>
                <span className="block text-[11px] leading-snug text-ink-subtle">
                  {noiseReductionDescription(option)}
                </span>
              </span>
              {selected ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </>
  );
}
