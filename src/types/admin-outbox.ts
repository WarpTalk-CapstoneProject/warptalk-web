/**
 * Contracts for the workspace service's outbox dead letters
 * (`WorkspaceOutboxAdminController`, `api/v1/workspaces/outbox`).
 *
 * The controller projects an anonymous object, so these names are its property names camelCased
 * by the default serializer — there is no DTO class on the server to drift from.
 */

export interface WorkspaceOutboxDeadLetterDto {
  id: string;
  eventType: string;
  schemaVersion: number;
  attemptCount: number;
  /** Always set on this list: the query filters on DeadLetteredAt != null. */
  deadLetteredAt: string;
  lastError: string | null;
  correlationId: string | null;
  workspaceId: string | null;
}

/** 202 Accepted body. The event is re-queued, not yet delivered. */
export interface WorkspaceOutboxReplayResultDto {
  eventId: string;
  status: string;
}
