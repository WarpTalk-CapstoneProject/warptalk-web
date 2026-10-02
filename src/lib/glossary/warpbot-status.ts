/**
 * PO 2026-10-02 — "Loading into WarpBot knowledgebase…" for a glossary, from REAL state.
 *
 * Every imported / added / edited term is sent to WarpBot's index (embedding:index_requests) and
 * the TranscriptService counts the results per glossary; `GET /glossaries/{id}/warpbot-status`
 * answers idle | loading | stalled | failed | ready with counts. This module only decides what the
 * page shows for that answer and when a completion deserves a notification. No timers, no guesses:
 * an unknown or idle status shows nothing rather than a claim.
 *
 * Pure, so the node:test contract can pin it.
 */

export interface GlossaryWarpBotStatus {
  /** idle | loading | stalled | failed | ready (server); anything else is treated as idle. */
  state: string;
  requested: number;
  indexed: number;
  /** Terms whose latest index result was a failure. */
  failed: number;
  blocked: number;
  /** Index requests still waiting for a result. */
  pending: number;
  updatedAt?: string | null;
}

/** What the page shows. `hidden` = make no claim. */
export type WarpBotStatusView =
  | { kind: "hidden" }
  | { kind: "loading"; done: number; total: number }
  | { kind: "ready" }
  /** `count` terms did not load; `unconfirmed` = WarpBot never answered (stalled) rather than refused. */
  | { kind: "failed"; count: number; unconfirmed: boolean };

export function warpBotStatusView(status: GlossaryWarpBotStatus | null | undefined): WarpBotStatusView {
  if (!status) return { kind: "hidden" };
  switch ((status.state ?? "").toLowerCase()) {
    case "loading":
      return {
        kind: "loading",
        done: Math.max(0, status.requested - status.pending),
        total: Math.max(0, status.requested),
      };
    case "ready":
      return { kind: "ready" };
    case "failed":
      return { kind: "failed", count: Math.max(1, status.failed), unconfirmed: false };
    case "stalled":
      return { kind: "failed", count: Math.max(1, status.pending), unconfirmed: true };
    default:
      return { kind: "hidden" };
  }
}

/** Poll only while something is in flight. */
export function isWarpBotLoading(status: GlossaryWarpBotStatus | null | undefined): boolean {
  return (status?.state ?? "").toLowerCase() === "loading";
}

/**
 * Whether moving from `previous` to `next` is a completion worth one notification.
 *
 * Announced when a load the reader could see in progress settles, or when new requests were sent
 * and had already settled by the time the page looked (a small import can finish before the first
 * poll). Never on the first read of a glossary — opening the page is not an event.
 */
export function warpBotAnnouncement(
  previous: GlossaryWarpBotStatus | null | undefined,
  next: GlossaryWarpBotStatus | null | undefined,
): "ready" | "failed" | null {
  if (!previous || !next) return null;
  const view = warpBotStatusView(next);
  if (view.kind !== "ready" && view.kind !== "failed") return null;

  const wasLoading = isWarpBotLoading(previous);
  const sentMore = next.requested > previous.requested;
  const wasSettledTheSame = warpBotStatusView(previous).kind === view.kind && !sentMore;
  if (wasSettledTheSame || (!wasLoading && !sentMore)) return null;
  return view.kind;
}
