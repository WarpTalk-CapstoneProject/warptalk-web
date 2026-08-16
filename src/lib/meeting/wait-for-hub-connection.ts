/**
 * WT-434 — waiting for the hub before sending, without sending stale state.
 *
 * Four in-meeting effects share this shape: something changed (listen language, speak
 * language, voice preference), the hub may still be mid-handshake, so retry briefly rather
 * than drop the change. Each effect's cleanup sets a `cancelled` flag so a superseded value
 * stops sending.
 *
 * The inlined loops all checked that flag BEFORE the sleep and never after it:
 *
 *   for (const delay of [0, 300, 800, 1500]) {
 *     if (cancelled) return;
 *     if (delay) await sleep(delay);      // cancellation lands HERE...
 *     if (connected) { invoke(...); }     // ...and this still fires
 *   }
 *
 * A closure cancelled DURING its sleep still sent. In production that played out in 300ms
 * flat: the mount-time closures captured the join screen's languages and went to sleep
 * (hub not connected yet); ~170ms in, the remembered-profile auto-apply superseded them and
 * sent the user's real languages; at mount+300ms the cancelled closures woke, skipped no
 * check, found the hub connected, and wrote the join-screen values back over the top. Last
 * write wins, so the participant row kept speak=en for a Vietnamese speaker — whose STT,
 * hinted "en", then hallucinated "Hello." over their speech. Gateway log, one pick:
 *
 *   03:53:27.203  (mount)
 *   03:53:27.375  listen=en ┐ the profile, applied
 *   03:53:27.378  speak =vi ┘
 *   03:53:27.503  listen=vi ┐ the cancelled closures, waking exactly 300ms after mount
 *   03:53:27.508  speak =en ┘
 *
 * Extracted so the cancellation contract is one tested function instead of four inlined
 * loops that can each drift. Dependency-free on purpose: the caller supplies the readiness
 * test, so this file never imports SignalR and the node test runner can drive it with fakes.
 */

export const HUB_RETRY_DELAYS_MS = [0, 300, 800, 1500] as const;

export async function waitForReadyConnection<TConnection>({
  getConnection,
  isReady,
  isCancelled,
  delaysMs = HUB_RETRY_DELAYS_MS,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: {
  /** Read the CURRENT connection each attempt — it is created after the first attempts run. */
  getConnection: () => TConnection | null | undefined;
  isReady: (connection: TConnection) => boolean;
  /** Read live, not captured: the whole point is noticing a cancellation that arrived mid-wait. */
  isCancelled: () => boolean;
  delaysMs?: readonly number[];
  wait?: (ms: number) => Promise<unknown>;
}): Promise<TConnection | null> {
  for (const delayMs of delaysMs) {
    if (isCancelled()) return null;
    if (delayMs) await wait(delayMs);
    // The line the inlined loops were missing. The sleep is exactly where a supersede lands —
    // it is the only place this function spends real time.
    if (isCancelled()) return null;

    const connection = getConnection();
    if (connection && isReady(connection)) return connection;
  }

  return null;
}
