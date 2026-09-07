"use client";

/**
 * The mic check — Discord's "Chặn Tiếng Ồn" card, for this product.
 *
 * WHY IT EXISTS
 *   Noise suppression was a switch with no evidence. It flipped, a toast sometimes appeared, and
 *   nothing anywhere showed whether the microphone actually got quieter — so "chống ồn chưa từng
 *   hoạt động" was unanswerable either way, for the user and for us. Discord's card is the model
 *   the report literally pointed at: a wave you can talk at, next to the switch it proves.
 *
 * WHAT THE STRIP SHOWS
 *   The PUBLISHED signal — after Krisp when it is attached (use-local-mic-levels reads the
 *   processor's output), so this is what other people hear. Speak and the bars jump; stay quiet
 *   and the floor line under the strip says what your microphone sends into the room when you
 *   are not talking. That floor is the whole verdict on suppression: with it working, a fan or a
 *   street stays "silent"; without it, the same room reads "noticeable" — which is exactly the
 *   noise everyone else gets.
 *
 *   Reuses the clone meter's strip and thresholds (lib/meeting/mic-check.ts), so the two
 *   drawings of one microphone can never learn to disagree.
 */

import { useLocalMicLevels } from "@/hooks/use-local-mic-levels";
import { describeMicBackground, type MicBackgroundLabel } from "@/lib/meeting/mic-check";
import { CloneCaptureMeter } from "./clone-capture-meter";

/** Short on purpose — this is a live check, not a recording; ~9s covers "say a sentence". */
const MIC_CHECK_WINDOW_SECONDS = 9;

const BACKGROUND_COPY: Record<MicBackgroundLabel, { text: string; tone: "good" | "warn" }> = {
  silent: { text: "Background: silent — suppression is holding.", tone: "good" },
  low: { text: "Background: low.", tone: "good" },
  noticeable: { text: "Background: noticeable — others can hear your room.", tone: "warn" },
  loud: { text: "Background: loud — check what your microphone is next to.", tone: "warn" },
};

export function MicCheck({
  enabled,
  suppressionActive,
  microphoneOn,
}: {
  /** Sample only while the panel showing this is open — nothing may hold an AudioContext idle. */
  enabled: boolean;
  /** Whether the Krisp processor is currently carrying the load (the toggle's real state). */
  suppressionActive: boolean;
  /** A muted microphone publishes silence; the strip must say that rather than look broken. */
  microphoneOn: boolean;
}) {
  const levels = useLocalMicLevels({
    enabled: enabled && microphoneOn,
    windowSeconds: MIC_CHECK_WINDOW_SECONDS,
  });
  const background = microphoneOn ? describeMicBackground(levels) : null;
  const copy = background ? BACKGROUND_COPY[background.label] : null;

  return (
    <div className="px-2.5 pb-2 pt-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink-muted">Mic check</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            suppressionActive ? "bg-primary/10 text-primary" : "bg-surface-3 text-ink-subtle"
          }`}
        >
          {suppressionActive ? "Krisp" : "Browser"}
        </span>
      </div>

      {microphoneOn ? (
        <>
          <CloneCaptureMeter
            levels={levels}
            progress={null}
            tone="idle"
            ariaLabel="Live microphone level, as others hear it"
          />
          <p
            className={`mt-1 text-[10px] leading-snug ${
              copy?.tone === "warn" ? "text-amber-600" : "text-ink-subtle"
            }`}
          >
            {copy ? copy.text : "Say something — the bars are what others hear."}
          </p>
        </>
      ) : (
        <p className="mt-1 text-[10px] leading-snug text-ink-subtle">
          Your microphone is off — unmute to check it.
        </p>
      )}
    </div>
  );
}
