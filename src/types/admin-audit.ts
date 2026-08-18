/**
 * Contracts for the platform audit log (`~/api/v1/admin/audit-log`).
 *
 * The controller has existed since WT-210 and nothing has ever rendered it — the "Audit activity"
 * tile on the Overview has been counting rows no one could read.
 */

export interface AdminAuditLogEntryDto {
  id: string;
  /** Which service performed the action — audit is written from all of them. */
  sourceService: string;
  action: string;
  entityType: string;
  entityId: string | null;
  workspaceId: string | null;
  actorId: string;
  /** Required at write time on every mutating admin endpoint. */
  reason: string;
  /** "succeeded" or "failed". A failed attempt is still a recorded action. */
  result: string;
  performedAt: string;
  correlationId: string | null;
  /**
   * Redacted at write time AND again on read, so a row written before a redaction rule existed
   * still cannot leak. Null when the action had no before/after state worth recording.
   */
  beforeSummary: Record<string, string | null> | null;
  afterSummary: Record<string, string | null> | null;
}

export interface AdminAuditLogQuery {
  page?: number;
  pageSize?: number;
  actorId?: string;
  action?: string;
  entityType?: string;
  workspaceId?: string;
  sourceService?: string;
  result?: string;
  from?: string;
  to?: string;
}
