/**
 * Contracts for the platform audit log (`~/api/v1/admin/audit-log`, workspace service).
 *
 * One store every service records into: workspace lifecycle and admin-page actions directly, and
 * over gRPC from auth, billing, the language catalog, the plugin catalog, the global glossary and
 * announcements. Append-only: the API has reads and an export, nothing else.
 */

export type AdminAuditResult = "succeeded" | "failed";

export interface AdminAuditActor {
  id: string;
  /** Null when neither the entry nor the account directory can name the admin — never a guess. */
  name: string | null;
  email: string | null;
}

export interface AdminAuditEntity {
  /** See AdminAuditEntityTypes on the backend: "workspace", "user", "plan", "plugin", … */
  type: string;
  /** The subject's GUID, when it has one. */
  id: string | null;
  /** The subject's natural key when it has no GUID: a language code, a pricing key. */
  key: string | null;
  /** What the subject is called: recorded at the time, or resolved now for workspaces/accounts. */
  label: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceSlug: string | null;
}

export interface AdminAuditRequestInfo {
  /** The request id: X-Correlation-ID, or the service's trace id. */
  correlationId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AdminAuditLogEntryDto {
  id: string;
  performedAt: string;
  /** Which service performed the action. */
  sourceService: string;
  action: string;
  actor: AdminAuditActor;
  entity: AdminAuditEntity;
  /** Null when the admin gave none. */
  reason: string | null;
  result: AdminAuditResult | string;
  /** Why a failed entry failed, in the words the admin was shown. */
  errorMessage: string | null;
  request: AdminAuditRequestInfo;
  /**
   * Redacted at write time AND again on read. Null when the action had no before/after state.
   */
  beforeSummary: Record<string, string | null> | null;
  afterSummary: Record<string, string | null> | null;
}

export interface AdminAuditLogPage {
  items: AdminAuditLogEntryDto[];
  /** Pass back as `cursor` for the next page. Null on the last page. */
  nextCursor: string | null;
  hasMore: boolean;
}

/** Every filter is applied server-side. */
export interface AdminAuditLogQuery {
  cursor?: string;
  limit?: number;
  /** ISO 8601, inclusive. */
  from?: string;
  /** ISO 8601, exclusive. */
  to?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  /** A GUID matches the entity id; anything else the natural key. */
  entityId?: string;
  workspaceId?: string;
  sourceService?: string;
  result?: AdminAuditResult;
  q?: string;
}

export interface AdminAuditFacetValue {
  value: string;
  count: number;
}

export interface AdminAuditActorFacet {
  id: string;
  name: string | null;
  email: string | null;
  count: number;
}

export interface AdminAuditLogFacets {
  actions: AdminAuditFacetValue[];
  entityTypes: AdminAuditFacetValue[];
  sourceServices: AdminAuditFacetValue[];
  actors: AdminAuditActorFacet[];
}
