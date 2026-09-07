"use client";

/**
 * The voice-clone capture, drawn as the thing it actually is: a take.
 *
 * WHY A WAVEFORM AND NOT ONLY A BAR
 *   The bar this replaces filled from 0 to 100% and said "14s of 20s collected". That answers
 *   "how long until it stops" and nothing else — and the question people actually have while a
 *   clip is being cut from their voice is "was any of that any good?". A clip is refused for
 *   being too quiet, too sparse or clipped; a percentage cannot show any of those, so a refusal
 *   arrived as a surprise after twenty seconds of apparently perfect progress.
 *
 *   The strip shows the level of every second of the take, so the quiet stretch that will get the
 *   clip refused is visible WHILE it is happening, and the loud clean stretch is visible too:
 *
 *     "vừa là progress bar vừa có wave bar để user xác định đoạn nào mình nói rõ và tốt nhất"
 *
 * TWO MEASUREMENTS, DELIBERATELY NOT ONE
 *   The bars are the browser's own reading of your microphone. The thin track under them is the
 *   worker's `seconds / requiredSeconds`. They are independent on purpose: bars filling while the
 *   track stays put is a real and diagnosable state — your microphone is live and the pipeline is
 *   not counting it — and merging them into one drawing would hide exactly that case.
 */

// One scale for every reading of the local microphone — shared with the mic check, so the two
// strips can never learn to disagree about what "clear" means.
import { CLEAR_LEVEL, QUIET_LEVEL } from "@/lib/meeting/mic-check";

export function CloneCaptureMeter({
  levels,
  progress,
  tone,
  buckets = 36,
  ariaLabel,
}: {
  /** Peak level per time bucket, oldest first. Shorter than `buckets` while the take fills. */
  levels: number[];
  /** 0..1 from the worker, or null when there is no take in progress to measure. */
  progress: number | null;
  tone: "idle" | "working" | "done" | "blocked";
  buckets?: number;
  /** What the strip is a picture of — the mic check reuses this drawing for a live level. */
  ariaLabel?: string;
}) {
  const done = tone === "done";
  const slots = Array.from({ length: buckets }, (_, index) => levels[index] ?? null);
  const hasClearAudio = levels.some((level) => level >= CLEAR_LEVEL);

  return (
    <div className="mt-2">
      <div
        className="flex h-8 items-end gap-px"
        role="img"
        aria-label={
          ariaLabel
            ?? (progress === null
              ? "Microphone level over the reference clip"
              : `Reference clip ${Math.round(progress * 100)}% collected`)
        }
      >
        {slots.map((level, index) => (
          <span
            key={index}
            // An empty slot is a hairline rather than nothing: the strip has to read as a track
            // waiting to be filled, or a half-finished take looks like a broken meter.
            className={`flex-1 rounded-full transition-[height] duration-150 ${
              level === null
                ? "bg-surface-3/60"
                : level >= CLEAR_LEVEL
                  ? done
                    ? "bg-emerald-500"
                    : "bg-primary"
                  : level >= QUIET_LEVEL
                    ? "bg-primary/40"
                    : "bg-surface-3"
            }`}
            style={{ height: level === null ? 2 : `${Math.max(8, level * 100)}%` }}
          />
        ))}
      </div>

      {progress !== null ? (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              done ? "bg-emerald-500" : "bg-primary"
            }`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      ) : null}

      {/* Only while a take is running, and only until it has something to work with. Advice after
          the fact is a scolding; advice during is the whole point of drawing this. */}
      {tone === "working" && !hasClearAudio && levels.length > 2 ? (
        <p className="mt-1 text-[10px] leading-snug text-amber-600">
          Speak up — the tall bars are the parts clear enough to clone from.
        </p>
      ) : null}
    </div>
  );
}
