/**
 * GET /workspaces/{id}/entitlements — the resolved entitlement snapshot billing replicates into
 * the workspace service. Values are wire strings ("true", "20"); `source` is published verbatim
 * (`platform_default`, `plan:<slug>`, `contract_override`, `workspace_override`).
 */
export type WorkspaceEntitlementKind = "flag" | "limit" | "text";

export interface WorkspaceEntitlementDto {
  key: string;
  kind: WorkspaceEntitlementKind;
  value: string;
  source: string;
  /** Only for `workspace_override`: the plan/contract value the owner tightened against. */
  ceiling: string | null;
  ceilingSource: string | null;
}

export interface WorkspaceEntitlementsDto {
  /** False until the first snapshot arrives. Never render defaults in its place. */
  isKnown: boolean;
  planSlug: string | null;
  hasActiveSubscription: boolean;
  resolvedAt: string | null;
  entitlements: WorkspaceEntitlementDto[];
}
