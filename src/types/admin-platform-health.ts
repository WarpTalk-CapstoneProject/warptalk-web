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
