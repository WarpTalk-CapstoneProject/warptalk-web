/**
 * Contracts for the workspace audit log (`~/api/v1/workspaces/{workspaceId}/audit-log`).
 *
 * A tenant-facing projection of the platform audit log. The store only records actions taken by
 * WarpTalk staff, so the backend redacts the actor to "WarpTalk staff" and withholds the staff
 * member's id, the internal reason, and the trace id — there is no field for them here.
 */

export interface WorkspaceAuditLogEntryDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  /** "staff" for every row today. */
  actorType: string;
  /** Always "WarpTalk staff". */
  actorDisplayName: string;
  performedAt: string;
  beforeSummary: Record<string, string | null> | null;
  afterSummary: Record<string, string | null> | null;
}

export interface WorkspaceAuditLogQuery {
  page?: number;
  pageSize?: number;
  action?: string;
  entityType?: string;
  /** ISO-8601, inclusive. */
  from?: string;
  /** ISO-8601, exclusive. */
  to?: string;
}
