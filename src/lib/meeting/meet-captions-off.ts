/**
 * Whether to ask the bridge's capturer to turn Google Meet's captions (CC) on.
 *
 * Live far-side speaker names come from Meet's own captions (desktop #44, far-speaker-hints): with
 * CC off there is nothing to read, and the far side's lines carry no names. The desktop tries to
 * press Meet's CC button itself (`ensureMeetCaptions`), but that can fail — CC tucked inside "More
 * options" in a narrow window, an unknown Meet language — and the user can turn CC off again at
 * any time. Either way the fix is one click in Meet, so we say so.
 *
 * Said ("off") when either:
 *   - `ensureMeetCaptions` answered ok:false for a reason the user can fix in Meet (not when the
 *     feature is disabled or the platform unsupported — turning CC on would change nothing);
 *   - the stream is running, the Meet tab is readable (`state` live or stale) and
 *     `captionsVisible` stayed false for more than `graceMs` (10 s). Only a readable tab counts:
 *     while the tab is switched away or minimized the desktop cannot see the captions at all, so
 *     "not visible" says nothing about CC.
 * Cleared as soon as any status says captions are visible, or the stream stops.
 *
 * Pure apart from the injected timer, so it is unit-tested without React.
 */

import type { EnsureMeetCaptionsResult, MeetCaptionStatus } from "../desktop/bridge.ts";

/** How long captions may stay hidden on a readable Meet tab before we ask. */
export const MEET_CAPTIONS_OFF_GRACE_MS = 10_000;

/** `ensureMeetCaptions` reasons where turning CC on in Meet would not help: say nothing. */
const NOT_ACTIONABLE_REASONS = new Set(["disabled", "unsupported-platform", "invalid-meet-code"]);

export function ensureFailureIsActionable(result: EnsureMeetCaptionsResult | null | undefined): boolean {
  if (!result || result.ok) return false;
  return !NOT_ACTIONABLE_REASONS.has(result.reason ?? "");
}

export type MeetCaptionsOffWatchOptions = {
  onChange: (off: boolean) => void;
  graceMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export class MeetCaptionsOffWatch {
  private readonly onChange: (off: boolean) => void;
  private readonly graceMs: number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private ensureFailed = false;
  private hiddenTooLong = false;
  private timer: unknown = null;
  private current = false;
  private disposed = false;

  constructor(options: MeetCaptionsOffWatchOptions) {
    this.onChange = options.onChange;
    this.graceMs = options.graceMs ?? MEET_CAPTIONS_OFF_GRACE_MS;
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  get off(): boolean {
    return this.current;
  }

  /** What `ensureMeetCaptions` answered. A later visible caption still clears it. */
  ensureResult(result: EnsureMeetCaptionsResult | null | undefined): void {
    if (this.disposed || !result) return;
    if (result.ok) this.ensureFailed = false;
    else if (ensureFailureIsActionable(result)) this.ensureFailed = true;
    this.emit();
  }

  status(status: MeetCaptionStatus): void {
    if (this.disposed) return;
    if (!status.running) {
      this.ensureFailed = false;
      this.resetHidden();
    } else if (status.captionsVisible) {
      this.ensureFailed = false;
      this.resetHidden();
    } else if (status.state === "live" || status.state === "stale") {
      // Readable, and no captions: start (or keep) the grace clock.
      if (this.timer === null && !this.hiddenTooLong) {
        this.timer = this.setTimer(() => {
          this.timer = null;
          if (this.disposed) return;
          this.hiddenTooLong = true;
          this.emit();
        }, this.graceMs);
      }
    } else {
      // Tab switched away or minimized: we cannot tell whether CC is on. Keep what was already
      // said, but do not let the time spent unreadable count toward the grace period.
      this.cancelTimer();
    }
    this.emit();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
  }

  private resetHidden(): void {
    this.cancelTimer();
    this.hiddenTooLong = false;
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.clearTimer(this.timer);
    this.timer = null;
  }

  private emit(): void {
    const off = this.ensureFailed || this.hiddenTooLong;
    if (off === this.current) return;
    this.current = off;
    this.onChange(off);
  }
}
