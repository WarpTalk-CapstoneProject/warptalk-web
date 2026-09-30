/**
 * Contracts for the system-admin System Health screen (`~/api/v1/admin/platform-health`).
 *
 * Everything here is read back out of the metrics store. Nothing on this screen asks a service
 * whether it feels well: a service that has lost its Redis consumer group answers its own health
 * check with a 200 and did exactly that in production (WT-402).
 */

export interface AdminPlatformHealthDto {
  /**
   * FALSE means monitoring could not be read — NOT that the platform is down. Rendering the two
   * the same way turns every monitoring restart into a reported outage.
   */
  monitoringAvailable: boolean;
  monitoringUnavailableReason: string | null;
  observedAt: string;
  targets: AdminHealthTargetDto[];
  workers: AdminHealthWorkerDto[];
  streamGroups: AdminHealthStreamGroupDto[];
  deadLetters: AdminHealthDeadLetterDto[];
  stageLatencies: AdminHealthStageLatencyDto[];
  alerts: AdminHealthAlertDto[];
  /** Sections that failed while the store itself answered. Empty means the data is complete. */
  warnings: string[];
  /**
   * The headline: meeting outcomes over the last 24h. Null when the counters have no series yet,
   * which is not the same as zero meetings.
   */
  meetings: AdminHealthMeetingOutcomesDto | null;
  /** STT, MT and TTS attempt outcomes over the last hour. */
  stageOutcomes: AdminHealthStageOutcomeDto[];
  /** Workspace outbox events that exhausted their retries; null when it could not be read. */
  outboxDeadLetters: AdminHealthOutboxDeadLettersDto | null;
  /** Same-origin path of the admin-only Grafana (e.g. "/grafana"); null where none is published. */
  grafanaEmbedPath: string | null;
}

/**
 * "Reached live" = at least two people joined AND a caption was delivered to the room. A meeting
 * that ended without both is counted as failed.
 */
export interface AdminHealthMeetingOutcomesDto {
  window: string;
  started: number;
  ended: number;
  reachedLive: number;
  /** Reached live and a host ended it. */
  endedNormally: number;
  /** Reached live, then everyone left and the sweep ended it. */
  endedAbandoned: number;
  /** Ended without ever reaching live. */
  failed: number;
  /** reachedLive / ended, 0..1; null when nothing ended in the window. */
  successRate: number | null;
  /** Rooms in a live status at the last sweep (at most ~12 min old); null when unknown. */
  liveRooms: number | null;
  occupiedRooms: number | null;
}

export interface AdminHealthStageOutcomeDto {
  stage: string;
  ok: number;
  /** error + timeout + vendor_error attempts. */
  failed: number;
  deadLettered: number;
  /** ok / (ok + failed); null with no attempts in the window. */
  successRate: number | null;
}

export interface AdminHealthOutboxDeadLettersDto {
  count: number;
  oldestAt: string | null;
}

export interface AdminHealthTargetDto {
  job: string;
  instance: string;
  isUp: boolean;
}

export interface AdminHealthWorkerDto {
  worker: string;
  replicas: number;
}

export interface AdminHealthStreamGroupDto {
  stream: string;
  group: string;
  lag: number;
  pending: number;
  /**
   * Consumer names Redis has ever seen, not readers attached right now — Redis keeps a consumer
   * registered after its process exits. Zero is the meaningful value.
   */
  consumers: number;
}

export interface AdminHealthDeadLetterDto {
  stream: string;
  length: number;
}

export interface AdminHealthStageLatencyDto {
  stage: string;
  /** Null when the window holds too few observations to place a quantile. Not the same as fast. */
  p95Ms: number | null;
}

export interface AdminHealthAlertDto {
  name: string;
  severity: string;
  state: string;
  summary: string | null;
  activeSince: string | null;
}
