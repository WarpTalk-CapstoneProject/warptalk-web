/**
 * Keeps one bridge track (the Meet window, the Meet audio) on the wire. The React-free half of
 * useSupervisedPublish, so its loop can be tested with a fake clock.
 *
 * WHAT IT GUARANTEES
 *   - While started, there is always exactly one next check scheduled or one attempt in flight:
 *     a publish that REJECTS (an AudioContext constructor throwing, a track processor on an ended
 *     track) is caught, counted as a failure, and rescheduled. Uncaught, it used to throw out of the
 *     loop before the next timer was set, and the supervisor was dead for the rest of the recording.
 *   - A kick only brings the next check forward. It never resets the failure count, the back-off or
 *     the warn-once state (it used to restart the whole loop on every flip), and a kick during an
 *     attempt in flight runs one more check right after it instead of a second concurrent one.
 *   - stop() is final for that run: an attempt still in flight from it never schedules anything.
 *     start() begins a new run with a fresh failure count (a new recording).
 *
 * Relative imports with the extension: the unit tests run under the plain node test runner.
 */

import { nextSupervisedPublishDelayMs, supervisedPublishSucceeded } from "./bridge-recording.ts";

export interface PublishSupervisorClock {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface PublishSupervisorLog {
  info: (message: string) => void;
  warn: (message: string) => void;
}

export interface PublishSupervisor {
  start: () => void;
  stop: () => void;
  kick: () => void;
  /** Consecutive failed attempts in this run. */
  readonly failures: number;
}

export function createPublishSupervisor(options: {
  /** Null when there is no publisher (not mounted yet): a failure, so it backs off. */
  publish: () => Promise<string> | null;
  label: string;
  clock?: PublishSupervisorClock;
  log?: PublishSupervisorLog;
}): PublishSupervisor {
  const clock: PublishSupervisorClock = options.clock ?? {
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const log: PublishSupervisorLog = options.log ?? {
    info: (message) => console.info(message),
    warn: (message) => console.warn(message),
  };
  let run = 0;
  let running = false;
  let timer: unknown = null;
  let inFlight = false;
  let kickedDuringFlight = false;
  let failures = 0;
  let lastFailure: string | null = null;

  const schedule = (delayMs: number) => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = clock.setTimeout(() => {
      timer = null;
      void check();
    }, delayMs);
  };

  const check = async () => {
    if (!running || inFlight) return;
    const thisRun = run;
    inFlight = true;
    let result: string;
    try {
      const attempt = options.publish();
      result = attempt ? await attempt : "no-publisher";
    } catch (error) {
      result = `the publish threw: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      inFlight = false;
    }
    if (!running || thisRun !== run) return;
    if (supervisedPublishSucceeded(result)) {
      if (failures > 0) log.info(`[bridge] ${options.label} is back on the recording after ${failures} failed attempt(s).`);
      failures = 0;
      lastFailure = null;
    } else {
      failures += 1;
      // Once per reason, not once per attempt: this can repeat for the length of a meeting.
      if (result !== lastFailure) log.warn(`[bridge] ${options.label} still off the recording: ${result}.`);
      lastFailure = result;
    }
    const kicked = kickedDuringFlight;
    kickedDuringFlight = false;
    schedule(kicked ? 0 : nextSupervisedPublishDelayMs(failures));
  };

  return {
    start: () => {
      if (running) return;
      running = true;
      run += 1;
      failures = 0;
      lastFailure = null;
      kickedDuringFlight = false;
      schedule(nextSupervisedPublishDelayMs(0));
    },
    stop: () => {
      running = false;
      run += 1;
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
    },
    kick: () => {
      if (!running) return;
      if (inFlight) {
        kickedDuringFlight = true;
        return;
      }
      schedule(0);
    },
    get failures() {
      return failures;
    },
  };
}
