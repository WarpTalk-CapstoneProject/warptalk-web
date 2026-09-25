import type { PresenceState } from "../../types/presence.ts";

/**
 * Most ids one QueryPresence call carries. The Gateway answers at most this many
 * (PresenceQueryService.MaxUsersPerQuery) and silently drops the rest, so a larger request is
 * split here rather than half-answered there.
 */
export const PRESENCE_IDS_PER_CALL = 500;

export type PresenceStates = Record<string, PresenceState>;

export interface PresenceBatcherOptions {
  /** One round trip for up to PRESENCE_IDS_PER_CALL ids. */
  invoke: (userIds: string[]) => Promise<PresenceStates>;
  /** Where answers go. Called once per successful call, whoever is still waiting for it. */
  onStates: (states: PresenceStates) => void;
  /** When queued ids are sent. Defaults to the end of the current tick. */
  schedule?: (flush: () => void) => void;
}

export interface PresenceBatcher {
  /**
   * Asks for these ids. Resolves once every one of them has been answered (the answers go to
   * `onStates`, not to the caller), and rejects with the error of the call that carried one that
   * could not be.
   */
  request(userIds: readonly string[]): Promise<void>;
}

interface Waiter {
  id: string;
  resolve: () => void;
  reject: (error: unknown) => void;
}

/**
 * Coalesces presence lookups.
 *
 * A members page mounts several consumers in one commit — the list, the sidebar panel, a picker,
 * each dot — and each asks for its own ids from its own effect. Every id asked for in the same tick
 * goes out in ONE call, and an id already queued or in flight is not asked for twice: the second
 * asker just waits for the first answer.
 *
 * Pure on purpose (no hub, no store, no React), so the node contract tests can drive it.
 */
export function createPresenceBatcher({
  invoke,
  onStates,
  schedule = queueMicrotask,
}: PresenceBatcherOptions): PresenceBatcher {
  /** id -> settles when that id has been answered. Queued or in flight; removed once settled. */
  const known = new Map<string, Promise<void>>();
  let queue: Waiter[] = [];
  let flushScheduled = false;

  const settle = (waiters: Waiter[], error?: unknown) => {
    for (const waiter of waiters) {
      known.delete(waiter.id);
      if (error === undefined) waiter.resolve();
      else waiter.reject(error);
    }
  };

  const flush = () => {
    flushScheduled = false;
    const batch = queue;
    queue = [];

    for (let start = 0; start < batch.length; start += PRESENCE_IDS_PER_CALL) {
      const chunk = batch.slice(start, start + PRESENCE_IDS_PER_CALL);
      new Promise<PresenceStates>((resolve) => resolve(invoke(chunk.map((w) => w.id))))
        .then((states) => onStates(states ?? {}))
        .then(
          () => settle(chunk),
          (error: unknown) => settle(chunk, error ?? new Error("Presence query failed")),
        );
    }
  };

  return {
    request(userIds) {
      const waits = Array.from(new Set(userIds)).map((id) => {
        const existing = known.get(id);
        if (existing) return existing;

        const answered = new Promise<void>((resolve, reject) => {
          queue.push({ id, resolve, reject });
        });
        // Every waiter is awaited through Promise.all below; this only stops a rejection nobody
        // is still waiting for from surfacing as "unhandled".
        answered.catch(() => {});
        known.set(id, answered);

        if (!flushScheduled) {
          flushScheduled = true;
          schedule(flush);
        }
        return answered;
      });

      return Promise.all(waits).then(() => undefined);
    },
  };
}
