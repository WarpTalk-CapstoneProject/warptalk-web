/**
 * The API client's way of saying "the gateway is in maintenance mode" to the banner.
 *
 * While `general.maintenance.enabled` is on, the gateway answers every non-exempt call from a
 * caller outside the allowlist with 503 `{ errorCode: "MAINTENANCE", message }`. Without this, each
 * of those surfaced as whatever the feature's own error said ("Could not load your workspaces"),
 * while the real reason — planned maintenance, back shortly — only reached people once the
 * status poll next ran. The interceptor records the answer here; `PlatformStatusBanner` shows it
 * immediately and asks the status endpoint again.
 *
 * A module-level store rather than React state: the axios interceptor lives outside the tree.
 */

export const MAINTENANCE_ERROR_CODE = "MAINTENANCE";

export interface MaintenanceSignal {
  message: string | null;
  at: number;
}

let current: MaintenanceSignal | null = null;
const listeners = new Set<() => void>();

/** Whether a failed response body is the gateway's maintenance answer. */
export function isMaintenanceBody(status: number | undefined, body: unknown): boolean {
  if (status !== 503 || typeof body !== "object" || body === null) return false;
  const record = body as Record<string, unknown>;
  return record.errorCode === MAINTENANCE_ERROR_CODE || record.code === MAINTENANCE_ERROR_CODE;
}

export function maintenanceMessageOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : null;
  return message && message.trim() ? message.trim() : null;
}

export function reportMaintenance(message: string | null, now: number = Date.now()): void {
  // Re-announcing the same message on every refused poll would re-render the banner for nothing.
  if (current && current.message === message && now - current.at < 5_000) return;
  current = { message, at: now };
  for (const listener of listeners) listener();
}

/** The status endpoint said maintenance is over: drop what the interceptor saw. */
export function clearMaintenanceSignal(): void {
  if (!current) return;
  current = null;
  for (const listener of listeners) listener();
}

export function getMaintenanceSignal(): MaintenanceSignal | null {
  return current;
}

export function subscribeMaintenance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
