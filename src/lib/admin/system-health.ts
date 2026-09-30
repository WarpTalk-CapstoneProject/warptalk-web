/**
 * The arithmetic and the Grafana contract behind the admin System Health page.
 *
 * Kept out of the page so it runs under `node --test` with no bundler (relative imports only),
 * and so the three facts that cross repositories are written down once:
 *
 *   1. The dashboard uids. The infrastructure chart provisions `warptalk-meetings`,
 *      `warptalk-platform` and `warptalk-pods` (deploy/k3s/chart/files/dashboards); a renamed uid
 *      there turns every tab here into Grafana's "Dashboard not found".
 *   2. The embed path comes from the backend (`grafanaEmbedPath`, Monitoring:GrafanaEmbedPath) and
 *      must be same-origin. Grafana sits behind a Traefik ForwardAuth that reads the admin's
 *      session cookie; only a same-origin frame sends that cookie, and the app's CSP allows
 *      `frame-src 'self'` and nothing else that could serve Grafana.
 *   3. Null means "not known", never zero. A success rate with nothing ended is null; a stage
 *      with no attempts is null. Rendering either as 0% would report an outage that did not
 *      happen.
 */

export type GrafanaDashboardKey = "meetings" | "platform" | "pods";

export interface GrafanaDashboard {
  key: GrafanaDashboardKey;
  uid: string;
  /** Initial time range; each dashboard is built around its own. */
  from: string;
}

export const GRAFANA_DASHBOARDS: readonly GrafanaDashboard[] = [
  { key: "meetings", uid: "warptalk-meetings", from: "now-24h" },
  { key: "platform", uid: "warptalk-platform", from: "now-6h" },
  { key: "pods", uid: "warptalk-pods", from: "now-6h" },
];

/**
 * A same-origin path the backend handed us, normalised, or null when it is anything else.
 *
 * The backend already refuses absolute URLs; this is the second lock, because the page is the one
 * that actually puts the value into an iframe `src`.
 */
export function normalizeEmbedPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim().replace(/\/+$/, "");
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.length < 2) return null;
  if (/[\s"'<>\\]/.test(trimmed)) return null;
  return trimmed;
}

/**
 * The URL of one dashboard in kiosk mode (no Grafana chrome), themed to match the portal.
 * Null when Grafana is not published in this environment.
 */
export function grafanaDashboardUrl(
  embedPath: string | null | undefined,
  dashboard: GrafanaDashboard,
  theme: "light" | "dark",
  options: { kiosk?: boolean } = {},
): string | null {
  const base = normalizeEmbedPath(embedPath);
  if (!base) return null;
  const params = new URLSearchParams({
    orgId: "1",
    theme,
    refresh: "30s",
    from: dashboard.from,
    to: "now",
  });
  // `kiosk` is a bare flag in Grafana; URLSearchParams would write "kiosk=".
  const kiosk = options.kiosk === false ? "" : "&kiosk";
  return `${base}/d/${encodeURIComponent(dashboard.uid)}/?${params.toString()}${kiosk}`;
}

/** 0.8123 → "81.2%"; null → "—". One decimal: 99.4% and 100% are different news. */
export function formatRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  const percent = Math.min(Math.max(rate, 0), 1) * 100;
  if (percent === 100) return "100%";
  return `${percent.toFixed(1)}%`;
}

export type RateTone = "good" | "warn" | "bad" | "unknown";

/**
 * The same bands the Grafana panels and the WarpTalkMeetingSuccessRateLow alert use: below 80% is
 * bad, below 95% worth a look.
 */
export function rateTone(rate: number | null | undefined): RateTone {
  if (rate == null || !Number.isFinite(rate)) return "unknown";
  if (rate < 0.8) return "bad";
  if (rate < 0.95) return "warn";
  return "good";
}

export interface StageOutcomeInput {
  stage: string;
  ok: number;
  failed: number;
  deadLettered: number;
  successRate: number | null;
}

export interface StageLatencyInput {
  stage: string;
  p95Ms: number | null;
}

export interface PipelineRow {
  stage: "stt" | "translation" | "tts";
  ok: number;
  failed: number;
  deadLettered: number;
  successRate: number | null;
  p95Ms: number | null;
}

const PIPELINE: readonly PipelineRow["stage"][] = ["stt", "translation", "tts"];

/**
 * One row per pipeline stage, always all three and always in pipeline order, joining the attempt
 * outcomes with the stage's p95. A stage that reported nothing is a row of nulls, so a missing
 * worker reads as "no data" in its own row rather than as a shorter table.
 */
export function pipelineRows(
  outcomes: readonly StageOutcomeInput[] | null | undefined,
  latencies: readonly StageLatencyInput[] | null | undefined,
): PipelineRow[] {
  return PIPELINE.map((stage) => {
    const outcome = outcomes?.find((o) => o.stage === stage);
    const latency = latencies?.find((l) => l.stage === stage);
    return {
      stage,
      ok: outcome?.ok ?? 0,
      failed: outcome?.failed ?? 0,
      deadLettered: outcome?.deadLettered ?? 0,
      successRate: outcome?.successRate ?? null,
      p95Ms: latency?.p95Ms ?? null,
    };
  });
}
