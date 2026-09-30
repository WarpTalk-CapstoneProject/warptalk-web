/**
 * Contracts for the admin Providers page (`~/api/v1/admin/providers`, billing-service
 * AdminProvidersController). Every figure is nullable on purpose: null is "not measured / not
 * tracked", which the page says in words — never a 0.
 */

export type ProviderKey = "openai" | "cartesia" | "livekit" | "stripe";

export type ProviderStatus = "operational" | "degraded" | "partial_outage" | "major_outage" | "unknown";

export type ProviderDayStatus = Exclude<ProviderStatus, "unknown"> | "no_data";

export type ProviderUsageUnit = "credits" | "providerCredits" | "participantMinutes" | "payments";

export type ProviderMetricUnit = "count" | "credits" | "providerCredits" | "usd" | "vnd" | "percent" | "ms" | "minutes";

export type ProviderMetricKey =
  | "usage"
  | "billedCredits"
  | "costUsd"
  | "costVnd"
  | "calls"
  | "failures"
  | "errorRate"
  | "p50Ms"
  | "p95Ms"
  | "roomMinutes"
  | "recordings"
  | "failedPayments"
  | "volumeVnd";

export interface AdminProviderStatusPageDto {
  url: string;
  indicator: string | null;
  description: string | null;
  checkedAt: string | null;
  error: string | null;
}

export interface AdminProviderConfigItemDto {
  key: string;
  label: string;
  value: string;
  /** yes | no | info — whether something is set, never what it is. */
  state: "yes" | "no" | "info";
}

export interface AdminProviderSummaryDto {
  key: ProviderKey;
  name: string;
  category: "ai" | "media" | "payments";
  services: string[];
  status: ProviderStatus;
  statusSource: "calls" | "statusPage" | "both" | "none";
  statusNote: string | null;
  statusPage: AdminProviderStatusPageDto | null;
  today: {
    usageUnit: ProviderUsageUnit;
    usage: number | null;
    costUsd: number | null;
    costVnd: number | null;
    usageNote: string | null;
    costNote: string | null;
  };
  live: {
    calls: number | null;
    failures: number | null;
    successRate: number | null;
    errorRate: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
    callsLastHour: number | null;
    note: string | null;
  };
  uptime: {
    percent: number | null;
    basis: "calls" | "statusPage" | "none";
    trackedSince: string | null;
    days: number;
  };
  config: AdminProviderConfigItemDto[];
}

export interface AdminProvidersOverviewDto {
  generatedAt: string;
  timeZone: string;
  providers: AdminProviderSummaryDto[];
}

export interface AdminProviderBucketDto {
  key: string;
  start: string;
  end: string;
  future: boolean;
}

export interface AdminProviderMetricSeriesDto {
  key: ProviderMetricKey;
  unit: ProviderMetricUnit;
  values: (number | null)[];
  note: string | null;
}

export interface AdminProviderTotalDto {
  key: string;
  unit: ProviderMetricUnit;
  value: number | null;
  note: string | null;
}

export interface AdminProviderSeriesDto {
  provider: ProviderKey;
  range: { from: string; to: string };
  granularity: "day" | "hour";
  timeZone: string;
  buckets: AdminProviderBucketDto[];
  metrics: AdminProviderMetricSeriesDto[];
  totals: AdminProviderTotalDto[];
}

export type ProviderBreakdownBy = "workspace" | "service" | "model" | "operation" | "errorClass";

export interface AdminProviderBreakdownItemDto {
  key: string;
  label: string;
  value: number;
  share: number | null;
  costUsd: number | null;
  costVnd: number | null;
  calls: number | null;
  failures: number | null;
}

export interface AdminProviderBreakdownDto {
  provider: ProviderKey;
  by: ProviderBreakdownBy;
  range: { from: string; to: string };
  unit: ProviderMetricUnit;
  available: boolean;
  total: number;
  items: AdminProviderBreakdownItemDto[];
  note: string | null;
}

export interface AdminProviderIncidentDto {
  name: string;
  impact: string;
  status: string;
  startedAt: string;
  resolvedAt: string | null;
  url: string | null;
}

export interface AdminProviderUptimeDayDto {
  date: string;
  status: ProviderDayStatus;
  tracked: boolean;
  calls: number;
  failures: number;
  successRate: number | null;
  p95Ms: number | null;
  failuresByClass: Record<string, number>;
  incidents: AdminProviderIncidentDto[];
}

export interface AdminProviderUptimeDto {
  provider: ProviderKey;
  timeZone: string;
  days: AdminProviderUptimeDayDto[];
  uptimePercent: number | null;
  basis: "calls" | "statusPage" | "none";
  trackedSince: string | null;
  statusPage: AdminProviderStatusPageDto | null;
  recentIncidents: AdminProviderIncidentDto[];
  note: string | null;
}
