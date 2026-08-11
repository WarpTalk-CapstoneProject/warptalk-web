/**
 * Pure mapping rules for the post-meeting surface (Meeting history + Transcripts).
 *
 * Everything here is deliberately dependency-free and relative-import-only so it can be
 * unit tested directly with `node --experimental-strip-types` the way the rest of
 * `src/lib/*.test.ts` is. `src/services/roomHistory.service.ts` and the two pages are thin
 * wrappers over these functions — if a rule lives here it is covered by a test.
 */

// Statuses come off the API in more than one casing — see api-status.ts, which already
// carries that reasoning and is what every other surface compares through. This file used
// to fold them itself; a second convention for the same problem is how they drift apart.
// Relative with the extension, not the "@/" alias: this module is exercised by the node
// test runner, which does not resolve the alias, and these are VALUE imports so they
// survive to runtime (unlike the type-only "@/" imports elsewhere in src/lib).
import { apiStatusEquals, apiStatusIn } from "../api/api-status.ts";

export type HistoryRoomStatus = "ended" | "cancelled";

/** Cancelled meetings must be reachable under the Cancelled filter and must never be
 * labelled as completed, whatever casing the wire used. */
export function resolveHistoryStatus(status: string | null | undefined): HistoryRoomStatus {
  return apiStatusEquals(status, "cancelled") ? "cancelled" : "ended";
}

export type ArtifactStatus =
  | "ready"
  | "processing"
  | "expired"
  | "missing"
  | "failed"
  | "deleted";

const ARTIFACT_STATUSES: ArtifactStatus[] = [
  "ready",
  "processing",
  "expired",
  "missing",
  "failed",
  "deleted",
];

export function resolveArtifactStatus(status: string | null | undefined): ArtifactStatus {
  const known = ARTIFACT_STATUSES.find((candidate) => apiStatusEquals(status, candidate));
  if (known) {
    return known;
  }
  // Backend TranslationRoomArtifact.Status is set from ArtifactStatus/"COMPLETED" (see
  // ArtifactMapper.ToEntity), never "active" or "ready" directly — without this mapping
  // every finished artifact fell into the `processing` fallback below and never showed as
  // ready, leaving downloads (and the AI summary) stuck looking like they never finished.
  if (apiStatusIn(status, ["active", "completed"])) return "ready";
  return "processing";
}

/**
 * How long the meeting actually ran.
 *
 * `createdAt` is when the row was inserted, which for a meeting scheduled the night before
 * is many hours before anybody speaks — the demo-prep checklist tells the team to pre-create
 * meetings, so `createdAt` was reliably wrong by exactly the amount that is most visible.
 *
 * Preference order:
 *  1. `durationSeconds` from the server, when it is a positive number. NOTE: as of this
 *     change nothing in warptalk-backend ever assigns `TranslationRoom.DurationSeconds`
 *     (the column and the DTO field exist and are mapped, but there is no writer), so this
 *     branch is dormant today and is here so the client starts telling the truth for free
 *     the moment the backend fills it in.
 *  2. `startedAt` → `endedAt`. `StartedAt` is stamped on the first Start
 *     (TranslationRoomService.cs:628 `StartedAt ??= DateTime.UtcNow`) and `EndedAt` on End
 *     (:985), so this is the real wall-clock length of the meeting.
 *  3. 0 — a room that was cancelled before it ever started has no duration, and inventing
 *     one from `createdAt` is what produced "14h" for a 20-minute meeting.
 */
export function resolveMeetingDurationSeconds(input: {
  durationSeconds?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
}): number {
  const reported = input.durationSeconds;
  if (typeof reported === "number" && Number.isFinite(reported) && reported > 0) {
    return Math.floor(reported);
  }

  const startMs = input.startedAt ? Date.parse(input.startedAt) : Number.NaN;
  const endMs = input.endedAt ? Date.parse(input.endedAt) : Number.NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;

  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

/**
 * A meeting shorter than a minute is a real thing — it is what a live demo produces. The
 * old formatter floored to whole minutes and rendered "0m", which reads as broken.
 */
export function formatMeetingDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Retention.
 *
 * This used to be invented: a hardcoded `transcriptRetentionDays: 30` /
 * `recordingRetentionDays: 7` that matched no configuration anywhere, and an `expiresAt`
 * that fell back to the meeting's own END time — so every finished meeting rendered
 * "Retention ends <the moment it ended>", a date already in the past.
 *
 * The reality in the backend today:
 *  - `TranslationRoomArtifact.RetentionUntil` is only ever populated from
 *    `CreateArtifactRequest.RetentionUntil`, and `ArtifactsFinalizer` never passes it, so
 *    it is always null. The only code that reads it is a lazy expiry check on download
 *    (TranslationRoomArtifactService.cs:78). There is no purge job.
 *  - The workspace's `artifactRetentionDays` setting is real and editable, but it lives in
 *    WorkspaceService and `translation-room/` has no reader for it — nothing enforces it.
 *
 * So the honest answer is: retention is NOT implemented. This returns a concrete date only
 * when an artifact genuinely carries one, and otherwise says so. It starts telling the
 * truth automatically if the finalizer ever begins stamping `retentionUntil`.
 */
export type RetentionState =
  | { kind: "scheduled"; expiresAt: string }
  | { kind: "not_configured" };

export function resolveRetention(
  artifacts: Array<{ expiresAt?: string | null }>,
): RetentionState {
  const dates = artifacts
    .map((artifact) => artifact.expiresAt)
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)))
    .sort();

  const earliest = dates[0];
  return earliest ? { kind: "scheduled", expiresAt: earliest } : { kind: "not_configured" };
}

/**
 * The four states an AI summary can be in, kept distinct.
 *
 * Previously a single `isGenerating = !artifact && recentlyEnded` flag collapsed them, so
 * (a) an artifact that existed but was still `processing` rendered "This meeting ended
 * without a summary artifact" directly above its own Download button, and (b) once a
 * 10-minute wall-clock timer expired the same false sentence appeared for a summary that
 * had in fact landed. State is now read off the artifact, never off a clock.
 */
export type SummaryState = "ready" | "generating" | "failed" | "empty";

export function resolveSummaryState(input: {
  artifactStatus?: ArtifactStatus | null;
  hasStructuredContent: boolean;
  insufficientData?: boolean;
  /** Only used to decide whether a *missing* artifact is still plausibly on its way. */
  recentlyEnded?: boolean;
}): SummaryState {
  const { artifactStatus, hasStructuredContent, insufficientData, recentlyEnded } = input;

  if (hasStructuredContent) return "ready";
  if (artifactStatus === "processing") return "generating";
  if (artifactStatus === "failed" || artifactStatus === "missing") return "failed";
  if (artifactStatus === "expired" || artifactStatus === "deleted") return "failed";
  // The artifact is `ready` but carries nothing we could parse, or the assistant told us
  // there was nothing to summarise.
  if (artifactStatus === "ready") return "empty";
  if (insufficientData) return "empty";
  // No artifact at all. The finalizer runs after the room ends, so shortly after the end
  // "not here yet" is the truthful reading; long after, it genuinely never arrived.
  return recentlyEnded ? "generating" : "empty";
}

/**
 * Whether the post-meeting surface should keep polling.
 *
 * `use-room-history` had no `refetchInterval` at all and nothing else refetched, so the
 * summary that lands ~40s after the meeting ends was only ever visible after a manual
 * reload. Polling is driven by artifact state and STOPS once everything has resolved, so
 * an idle history tab does not sit on an unbounded interval.
 */
export function shouldPollRoomHistory(
  rooms: Array<{
    endedAt?: string | null;
    artifacts: Array<{ type: string; status: ArtifactStatus }>;
  }>,
  options: { nowMs?: number; windowMs?: number } = {},
): boolean {
  const nowMs = options.nowMs ?? Date.now();
  // Past this window after a meeting ended, a still-absent artifact is not "on its way",
  // it is never coming — and we stop asking.
  const windowMs = options.windowMs ?? 15 * 60 * 1000;

  return rooms.some((room) => {
    if (room.artifacts.some((artifact) => artifact.status === "processing")) return true;

    const endedMs = room.endedAt ? Date.parse(room.endedAt) : Number.NaN;
    if (!Number.isFinite(endedMs)) return false;
    if (nowMs - endedMs > windowMs) return false;
    if (nowMs < endedMs) return false;

    const hasSummary = room.artifacts.some((artifact) => artifact.type === "summary_export");
    const hasTranscript = room.artifacts.some(
      (artifact) => artifact.type === "transcript_export",
    );
    return !hasSummary || !hasTranscript;
  });
}

/** Server pagination arithmetic, shared by both paged views. */
export function totalPages(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  if (!Number.isFinite(pageSize) || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPage(page: number, total: number, pageSize: number): number {
  const max = totalPages(total, pageSize);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), max);
}

export function parsePageParam(raw: string | null | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
