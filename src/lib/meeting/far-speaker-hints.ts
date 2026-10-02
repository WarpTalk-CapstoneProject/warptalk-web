/**
 * Live Google Meet speaker names for the far side of a bridge, from the capturer's desktop to the
 * hub (desktop #44 -> backend #499).
 *
 *   desktop main (UIA reads Meet's CC) --bridge:meet-caption--> hidden MAIN window renderer
 *     --hub ReportFarSpeakerHints(roomId, hints, clientNowMs)--> Redis
 *     meeting:{room}:far_speaker_hints --> stt_worker names the stand-in's lines
 *
 * This file is the pure half: turning a caption event into the hub's DTO and batching them. The
 * wiring (who streams, when, on which connection) is hooks/use-far-speaker-hints.
 *
 * THE CONTRACT (warptalk-backend gateway FarSpeakerHintIngest / TranslationRoomHub)
 *   - `FarSpeakerHintDto(Name, TStartMs, TEndMs, Confidence?, Stale?)`, camelCase over SignalR JSON;
 *     times on the CLIENT's Date.now() clock, `clientNowMs` lets the server align them.
 *   - At most 20 hints per call are read (the newest), hints whose end is older than 30 s are
 *     dropped, and a room gets 10 calls/s; the excess is dropped and answered with 0.
 *   - Repeating a block is harmless: the server keeps a per-name high-water mark, so an `update` of
 *     a block already sent only adds the points it did not have.
 *   - A caller that is not the capturer of a live bridge room gets a HubException.
 *
 * THE CLOCK. Caption times are on the desktop MAIN process's `alignedNow()` axis (performance.now
 * anchored to Date.now() once at load); `clientNowMs` is this renderer's Date.now(). If the wall
 * clock jumped after the desktop started (NTP, sleep/resume), the two differ by that jump and every
 * hint would land that far off. A desktop that stamps `sentAtMs` (alignedNow() when main sent the
 * event) lets the renderer rebase on receipt: `t + (Date.now() - sentAtMs)`. Without it (an older
 * desktop) the times are used as they come, as before.
 */

import type { MeetCaptionEvent } from "../desktop/bridge.ts";

/** One hint as `TranslationRoomHub.ReportFarSpeakerHints` takes it (FarSpeakerHintDto). */
export type FarSpeakerHint = {
  name: string;
  tStartMs: number;
  tEndMs: number;
  confidence: "live" | "batch";
  stale: boolean;
};

/** The hub method's name. */
export const REPORT_FAR_SPEAKER_HINTS = "ReportFarSpeakerHints";

/** FarSpeakerHintIngest.MaxHintsPerCall. */
export const MAX_HINTS_PER_CALL = 20;

/** FarSpeakerHintIngest.MaxHintAgeMs: an older hint is dropped by the server, so not kept here. */
export const MAX_HINT_AGE_MS = 30_000;

/** How often pending hints go out. 2.5 calls/s, well inside the room's 10/s. */
export const FLUSH_INTERVAL_MS = 400;

/** The longest wait between attempts after the hub refused or was down. */
export const MAX_RETRY_DELAY_MS = 5_000;

/**
 * How far to move a caption event's times to put them on this renderer's Date.now() axis:
 * `receivedAtMs - sentAtMs`, or 0 when the desktop did not stamp `sentAtMs` (older build) or the
 * receipt time is unknown.
 */
export function rendererClockOffsetMs(event: MeetCaptionEvent, receivedAtMs?: number): number {
  const sentAtMs = event.sentAtMs;
  if (typeof sentAtMs !== "number" || !Number.isFinite(sentAtMs) || sentAtMs <= 0) return 0;
  if (typeof receivedAtMs !== "number" || !Number.isFinite(receivedAtMs)) return 0;
  return receivedAtMs - sentAtMs;
}

/**
 * A caption event as a hint, or null when it cannot name anybody. `receivedAtMs` is this
 * renderer's Date.now() when the event arrived; with the desktop's `sentAtMs` it moves the times
 * onto this renderer's clock (see THE CLOCK above).
 */
export function captionEventToHint(event: MeetCaptionEvent, receivedAtMs?: number): FarSpeakerHint | null {
  const name = typeof event.speaker === "string" ? event.speaker.trim() : "";
  if (!name) return null;
  if (!Number.isFinite(event.tStartMs) || !Number.isFinite(event.tEndMs)) return null;
  if (event.tStartMs <= 0 || event.tEndMs < event.tStartMs) return null;
  const offset = rendererClockOffsetMs(event, receivedAtMs);
  return {
    name,
    tStartMs: Math.round(event.tStartMs + offset),
    tEndMs: Math.round(event.tEndMs + offset),
    confidence: event.tConfidence === "batch" ? "batch" : "live",
    stale: event.stale === true,
  };
}

export type FarSpeakerHintSender = (hints: FarSpeakerHint[], clientNowMs: number) => Promise<unknown>;

export type FarSpeakerHintBatcherOptions = {
  /** The meeting this batcher is for; events for another Meet code are ignored. */
  meetCode: string;
  /** Invokes the hub. Rejects when the hub is not connected or refused; the batch is then kept. */
  send: FarSpeakerHintSender;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  intervalMs?: number;
};

/**
 * Collects caption events and sends them every `intervalMs`, oldest first, at most
 * MAX_HINTS_PER_CALL a call. One block (blockId) is one pending hint: an `update` replaces it.
 *
 * A batch whose send failed is put back (unless a newer version of the same block arrived
 * meanwhile) and retried with a doubling delay; `flushNow()` — called on a hub (re)connect —
 * retries at once. Hints older than the server's age limit are dropped instead of resent.
 */
export class FarSpeakerHintBatcher {
  private readonly options: FarSpeakerHintBatcherOptions;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly intervalMs: number;
  /** blockId -> hint, in arrival order of each block's first sighting. */
  private pending = new Map<string, FarSpeakerHint>();
  private timer: unknown = null;
  private inFlight = false;
  private failures = 0;
  private disposed = false;

  constructor(options: FarSpeakerHintBatcherOptions) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.intervalMs = options.intervalMs ?? FLUSH_INTERVAL_MS;
  }

  /** How many blocks are waiting to go out. */
  get size(): number {
    return this.pending.size;
  }

  add(event: MeetCaptionEvent): void {
    if (this.disposed || event.meetCode !== this.options.meetCode) return;
    // Rebased on receipt: the offset is the clocks' difference NOW, not at flush time.
    const hint = captionEventToHint(event, this.now());
    if (!hint || !event.blockId) return;
    this.pending.set(event.blockId, hint);
    this.schedule(this.intervalMs);
  }

  /** Send what is pending now: the hub just (re)connected. */
  flushNow(): void {
    if (this.disposed) return;
    this.failures = 0;
    this.cancelTimer();
    void this.flush();
  }

  /** Stop the timer; a last best-effort send of what is pending when `finalFlush`. */
  async dispose({ finalFlush = false }: { finalFlush?: boolean } = {}): Promise<void> {
    if (this.disposed) return;
    this.cancelTimer();
    if (finalFlush && !this.inFlight) await this.flush();
    this.disposed = true;
    this.pending.clear();
  }

  private schedule(ms: number): void {
    if (this.timer !== null || this.inFlight || this.disposed) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.clearTimer(this.timer);
    this.timer = null;
  }

  private prune(nowMs: number): void {
    for (const [blockId, hint] of this.pending) {
      if (hint.tEndMs < nowMs - MAX_HINT_AGE_MS) this.pending.delete(blockId);
    }
  }

  private async flush(): Promise<void> {
    if (this.inFlight || this.disposed) return;
    const nowMs = this.now();
    this.prune(nowMs);
    if (this.pending.size === 0) return;

    // Oldest first: the server's high-water mark only moves forward, so a newer point sent before
    // an older one of the same name would shadow it.
    const batch = [...this.pending.entries()]
      .sort((a, b) => a[1].tEndMs - b[1].tEndMs)
      .slice(0, MAX_HINTS_PER_CALL);
    for (const [blockId] of batch) this.pending.delete(blockId);

    this.inFlight = true;
    let ok = true;
    try {
      await this.options.send(
        batch.map(([, hint]) => hint),
        nowMs,
      );
    } catch {
      ok = false;
    } finally {
      this.inFlight = false;
    }
    if (this.disposed) return;

    if (ok) {
      this.failures = 0;
    } else {
      this.failures += 1;
      // Put the batch back, unless the block was updated while the call was out.
      for (const [blockId, hint] of batch) {
        if (!this.pending.has(blockId)) this.pending.set(blockId, hint);
      }
    }
    if (this.pending.size > 0) {
      const delay = ok
        ? this.intervalMs
        : Math.min(this.intervalMs * 2 ** this.failures, MAX_RETRY_DELAY_MS);
      this.schedule(delay);
    }
  }
}
