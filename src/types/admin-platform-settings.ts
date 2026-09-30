/**
 * The platform settings console (/admin/settings), as the workspace service serves it under
 * `/api/v1/admin/settings` (AdminPlatformSettingsController, DTOs in PlatformSettingsDtos.cs).
 *
 * The registry is code on the server (WarpTalk.Shared.PlatformSettings.PlatformSettingsCatalog):
 * every key, its type, bounds, category and owning service come from there. The web never invents
 * a setting; it renders what the server lists and validates edits with the same rules the server
 * applies (src/lib/admin/platform-settings.ts), for feedback only — the server's answer counts.
 *
 * `scripts/check-admin-platform-settings-contract.mjs` holds the two unions below to the backend's
 * SettingValueType / SettingCategories when the backend checkout is available.
 */

/** SettingValueType on the wire (PlatformSettingsAdminService.TypeName). */
export const PLATFORM_SETTING_TYPES = [
  "boolean",
  "integer",
  "decimal",
  "string",
  "enum",
  "string_list",
  "feature_flag",
] as const;
export type PlatformSettingType = (typeof PLATFORM_SETTING_TYPES)[number];

/** SettingCategories.Ordered — the console's left navigation, in order. */
export const PLATFORM_SETTING_CATEGORIES = [
  "general",
  "security",
  "meetings",
  "billing",
  "notifications",
  "limits",
  "retention",
  "integrations",
  "feature_flags",
] as const;
export type PlatformSettingCategory = (typeof PLATFORM_SETTING_CATEGORIES)[number];

export const PLATFORM_SETTING_SCOPES = ["platform", "plan", "workspace"] as const;
export type PlatformSettingScope = (typeof PLATFORM_SETTING_SCOPES)[number];

/** Any JSON value a setting can hold. */
export type SettingJson = null | boolean | number | string | SettingJson[] | { [key: string]: SettingJson };

/** The value of a `feature_flag` setting (FeatureFlagValue.cs). Absent lists mean empty. */
export interface FeatureFlagValue {
  enabled: boolean;
  rolloutPercent?: number;
  allowPlans?: string[];
  allowWorkspaces?: string[];
  denyWorkspaces?: string[];
}

export interface PlatformSettingActorDto {
  id: string;
  name: string | null;
  email: string | null;
}

/** One stored value at one plan or workspace scope. */
export interface PlatformSettingScopedValueDto {
  scopeType: PlatformSettingScope;
  scopeId: string;
  value: SettingJson;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface PlatformSettingDto {
  key: string;
  category: PlatformSettingCategory | string;
  type: PlatformSettingType;
  label: string;
  description: string;
  owningService: string;
  scopes: PlatformSettingScope[];
  unit: string | null;
  min: number | null;
  max: number | null;
  allowedValues: string[] | null;
  /** Maximum string length, or maximum list length for a list. */
  maxLength: number | null;
  /** A .NET regular expression every string (or list item) must match. */
  pattern: string | null;
  requiresRestart: boolean;
  risky: boolean;
  sensitive: boolean;
  requiresSecurityPermission: boolean;
  defaultValue: SettingJson;
  /** The platform value; null when not set (the owning service keeps its deploy-time value). */
  value: SettingJson | null;
  /** 0 when not set. Sent back as `expectedVersion`; a mismatch is 409. */
  version: number;
  isSet: boolean;
  overrides: PlatformSettingScopedValueDto[];
  lastChangedAt: string | null;
  lastChangedBy: PlatformSettingActorDto | null;
  /** The server's verdict: settings.manage, plus settings.security for the Security category. */
  canEdit: boolean;
}

export interface PlatformSettingCategoryDto {
  key: PlatformSettingCategory | string;
  count: number;
  changedCount: number;
}

export interface PlatformSettingsPublishStatusDto {
  version: number;
  publishedAt: string | null;
  healthy: boolean;
  error: string | null;
}

export interface PlatformSettingsConsoleDto {
  categories: PlatformSettingCategoryDto[];
  settings: PlatformSettingDto[];
  publish: PlatformSettingsPublishStatusDto;
  canManage: boolean;
  canManageSecurity: boolean;
}

export type PlatformSettingChangeAction = "set" | "reset" | "revert" | "import";

export interface PlatformSettingChangeDto {
  id: string;
  key: string;
  scopeType: PlatformSettingScope;
  scopeId: string;
  action: PlatformSettingChangeAction | string;
  oldValue: SettingJson | null;
  newValue: SettingJson | null;
  version: number;
  reason: string | null;
  changedBy: PlatformSettingActorDto;
  changedAt: string;
  revertOf: string | null;
  /** A sensitive setting: both values are withheld. */
  redacted: boolean;
}

export interface PlatformSettingWriteRequest {
  value: SettingJson;
  scopeType?: PlatformSettingScope;
  scopeId?: string;
  /** REQUIRED: the version the editor read (0 when not set). */
  expectedVersion: number;
  /** Required (≥ 10 characters) when the setting is risky. */
  reason?: string;
}

export interface PlatformSettingResetRequest {
  scopeType?: PlatformSettingScope;
  scopeId?: string;
  expectedVersion?: number;
  reason?: string;
}

export interface PlatformSettingsExportEntryDto {
  key: string;
  scopeType: PlatformSettingScope | string;
  scopeId: string;
  value: SettingJson;
}

export const PLATFORM_SETTINGS_EXPORT_FORMAT = "warptalk.platform-settings/v1";

export interface PlatformSettingsExportDto {
  format: string;
  exportedAt: string;
  settings: PlatformSettingsExportEntryDto[];
  /** Sensitive keys the server left out. */
  excluded: string[];
}

export interface PlatformSettingsImportRequest {
  settings: PlatformSettingsExportEntryDto[];
  dryRun: boolean;
  /** Required (≥ 10 characters) when dryRun is false. */
  reason?: string;
}

export type PlatformSettingsImportOutcome = "create" | "update" | "unchanged" | "rejected";

export interface PlatformSettingsImportLineDto {
  key: string;
  scopeType: string;
  scopeId: string;
  outcome: PlatformSettingsImportOutcome | string;
  oldValue: SettingJson | null;
  newValue: SettingJson | null;
  error: string | null;
}

export interface PlatformSettingsImportResultDto {
  applied: boolean;
  changed: number;
  unchanged: number;
  rejected: number;
  lines: PlatformSettingsImportLineDto[];
}

// ── Integrations (read-only status; secrets never leave deploy configuration) ─────────────────

export interface PlatformIntegrationServiceReportDto {
  service: string;
  configured: boolean;
  detail: string | null;
  reportedAt: string | null;
}

export interface PlatformIntegrationCheckDto {
  ok: boolean;
  at: string;
  latencyMs: number | null;
  detail: string | null;
}

export interface PlatformIntegrationDto {
  key: string;
  name: string;
  /** null = no service has reported on it. */
  configured: boolean | null;
  services: PlatformIntegrationServiceReportDto[];
  lastCheck: PlatformIntegrationCheckDto | null;
  testable: boolean;
  href: string | null;
}

export interface PlatformDeployConfigDto {
  key: string;
  label: string;
  service: string;
  value: string | string[] | null;
  configured: boolean;
}

export interface PlatformIntegrationsDto {
  integrations: PlatformIntegrationDto[];
  deployConfig: PlatformDeployConfigDto[];
}

export interface PlatformIntegrationTestResultDto {
  key: string;
  ok: boolean;
  latencyMs: number | null;
  detail: string | null;
  checkedAt: string;
}

// ── Public platform status (anonymous) ────────────────────────────────────────────────────────

export interface PlatformStatusDto {
  maintenance: { enabled: boolean; message: string | null };
  supportEmail: string;
  googleSignInEnabled: boolean;
}
