"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Cpu,
  Heartbeat,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import { useAdminPlatformHealth } from "@/hooks/use-admin-platform-health";
import {
  GRAFANA_DASHBOARDS,
  formatRate,
  grafanaDashboardUrl,
  pipelineRows,
  rateTone,
  type GrafanaDashboardKey,
  type RateTone,
} from "@/lib/admin/system-health";
import { cn } from "@/lib/utils";
import type {
  AdminHealthAlertDto,
  AdminHealthMeetingOutcomesDto,
  AdminHealthOutboxDeadLettersDto,
  AdminHealthStreamGroupDto,
  AdminPlatformHealthDto,
} from "@/types/admin-platform-health";

const numberFormatter = new Intl.NumberFormat("en-US");

/** Lag above this is what the WarpTalkAiStreamLag rule already alerts on. */
const LAG_ALERT_THRESHOLD = 100;
/** And this is WarpTalkAiPendingStuck's. Same numbers, so the screen and the pager agree. */
const PENDING_ALERT_THRESHOLD = 50;

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatSince(value: string | null, justNow: string) {
  if (!value) return "—";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return justNow;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

function formatMs(value: number | null) {
  // Null is "not enough observations to place a quantile", which is not zero and not fast.
  if (value == null) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between gap-3">
      <h2 className="text-[13px] font-semibold text-ink">{children}</h2>
      {note ? <span className="text-[11px] text-ink-muted">{note}</span> : null}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-[12px] text-ink-muted">{children}</p>;
}

export default function AdminHealthPage() {
  const t = useTranslations("adminOps.health");
  const healthQuery = useAdminPlatformHealth();
  const health = healthQuery.data;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Heartbeat size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex items-center gap-3">
            {health ? (
              <span className="text-[12px] text-ink-muted">
                {t("asOf", { time: formatClock(health.observedAt) })}
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void healthQuery.refetch()}
              disabled={healthQuery.isFetching}
            >
              <ArrowsClockwise size={14} className={cn(healthQuery.isFetching && "animate-spin")} />
              {t("refresh")}
            </Button>
          </div>
        }
      />

      {healthQuery.isError ? (
        <AdminPanel className="mt-5">
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t("errorTitle")}</p>
              <p className="mt-1 text-ink-muted">{t("errorDescription")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void healthQuery.refetch()}
              >
                {t("tryAgain")}
              </Button>
            </div>
          </div>
        </AdminPanel>
      ) : healthQuery.isPending ? (
        <div className="mt-5 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      ) : !health ? null : !health.monitoringAvailable ? (
        <>
          <MonitoringUnavailable health={health} />
          {/* Both still work without Prometheus: the outbox is the service's own database, and
              Grafana is reached directly. */}
          <OutboxDeadLetters outbox={health.outboxDeadLetters} />
          <GrafanaSection embedPath={health.grafanaEmbedPath} />
        </>
      ) : (
        <HealthBody health={health} />
      )}
    </AdminPage>
  );
}

/**
 * The state that matters most to get right. Monitoring being unreadable is not the platform
 * being down, and a wall of zeroes would say the second thing.
 */
function MonitoringUnavailable({ health }: { health: AdminPlatformHealthDto }) {
  const t = useTranslations("adminOps.health");
  return (
    <AdminPanel className="mt-5 border-amber-500/30 bg-amber-500/5">
      <div className="flex items-start gap-3 px-4 py-8 text-sm">
        <Warning size={18} weight="duotone" className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="font-medium">{t("monitoringUnavailableTitle")}</p>
          <p className="mt-1 text-ink-muted">
            {health.monitoringUnavailableReason ?? t("monitoringUnavailableFallbackReason")}
          </p>
          <p className="mt-3 max-w-xl text-[12px] text-ink-muted">
            {t("monitoringUnavailableNote")}
          </p>
        </div>
      </div>
    </AdminPanel>
  );
}

function HealthBody({ health }: { health: AdminPlatformHealthDto }) {
  const t = useTranslations("adminOps.health");
  const missingWorkers = health.workers.filter((w) => w.replicas === 0);
  const busiestGroups = health.streamGroups.filter(
    (g) => g.lag >= LAG_ALERT_THRESHOLD || g.pending >= PENDING_ALERT_THRESHOLD,
  );
  const nonEmptyDeadLetters = health.deadLetters.filter((d) => d.length > 0);
  const outboxCount = health.outboxDeadLetters?.count ?? null;

  return (
    <>
      {health.warnings.length > 0 ? (
        <AdminPanel className="mt-5 border-amber-500/30 bg-amber-500/5">
          <div className="px-4 py-3 text-[12px]">
            <p className="font-medium text-ink">{t("partialReadTitle")}</p>
            <ul className="mt-1 list-inside list-disc text-ink-muted">
              {health.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </AdminPanel>
      ) : null}

      <MeetingHeadline meetings={health.meetings} />

      <PipelinePanel health={health} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryTile
          label={t("tileFiringAlerts")}
          value={health.alerts.length}
          bad={health.alerts.length > 0}
        />
        <SummaryTile
          label={t("tileWorkerClassesAtZero")}
          value={missingWorkers.length}
          total={health.workers.length}
          bad={missingWorkers.length > 0}
        />
        <SummaryTile
          label={t("tileBackedUpStreamGroups")}
          value={busiestGroups.length}
          total={health.streamGroups.length}
          bad={busiestGroups.length > 0}
        />
        <SummaryTile
          label={t("tileDeadLetterStreams")}
          value={nonEmptyDeadLetters.length}
          total={health.deadLetters.length}
          bad={nonEmptyDeadLetters.length > 0}
        />
        <SummaryTile
          label={t("tileOutboxDeadLetters")}
          value={outboxCount}
          bad={(outboxCount ?? 0) > 0}
          hint={
            health.outboxDeadLetters?.oldestAt
              ? t("oldestSince", { since: formatSince(health.outboxDeadLetters.oldestAt, t("justNow")) })
              : undefined
          }
        />
      </div>

      <SectionTitle note={t("activeCount", { count: health.alerts.length })}>
        {t("firingAlerts")}
      </SectionTitle>
      <AdminPanel>
        {health.alerts.length === 0 ? (
          <EmptyRow>{t("nothingFiring")}</EmptyRow>
        ) : (
          <ul>
            {health.alerts.map((alert) => (
              <li key={`${alert.name}-${alert.activeSince ?? ""}`}>
                <AlertRow alert={alert} />
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
      <p className="mt-1.5 text-[11px] text-ink-muted">{t("alertsSourceNote")}</p>

      <GrafanaSection embedPath={health.grafanaEmbedPath} />

      <SectionTitle note={t("liveHeartbeatKeys")}>{t("aiWorkers")}</SectionTitle>
      <AdminPanel>
        {health.workers.length === 0 ? (
          <EmptyRow>{t("noWorkers")}</EmptyRow>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3">
            {health.workers.map((worker) => (
              <li
                key={worker.worker}
                className="flex items-center gap-2 border-b border-hairline/60 px-4 py-2.5 text-[13px] last:border-b-0"
              >
                <Cpu
                  size={14}
                  weight="duotone"
                  className={worker.replicas === 0 ? "text-destructive" : "text-ink-subtle"}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                  {worker.worker}
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    worker.replicas === 0 ? "font-semibold text-destructive" : "text-ink-muted",
                  )}
                >
                  {worker.replicas}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <SectionTitle note={t("discoveredCount", { count: health.streamGroups.length })}>
        {t("redisStreamGroups")}
      </SectionTitle>
      <AdminPanel>
        {health.streamGroups.length === 0 ? (
          <EmptyRow>{t("noConsumerGroups")}</EmptyRow>
        ) : (
          <>
            <div className="hidden border-b border-hairline/60 px-4 py-2 text-[11px] font-medium text-ink-muted md:flex">
              <span className="flex-1">{t("columnStream")}</span>
              <span className="w-[190px]">{t("columnGroup")}</span>
              <span className="w-[80px] text-right">{t("columnLag")}</span>
              <span className="w-[80px] text-right">{t("columnPending")}</span>
              <span className="w-[90px] text-right">{t("columnConsumers")}</span>
            </div>
            <ul>
              {health.streamGroups.map((group) => (
                <li key={`${group.stream}::${group.group}`}>
                  <StreamGroupRow group={group} />
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle note={t("p95LastHour")}>{t("pipelineStageLatency")}</SectionTitle>
          <AdminPanel>
            {health.stageLatencies.length === 0 ? (
              <EmptyRow>{t("noStageLatency")}</EmptyRow>
            ) : (
              <ul>
                {health.stageLatencies.map((stage) => (
                  <li
                    key={stage.stage}
                    className="flex items-center justify-between border-b border-hairline/60 px-4 py-2.5 text-[13px] last:border-b-0"
                  >
                    <span className="font-mono text-[12px]">{stage.stage}</span>
                    <span
                      className={cn(
                        "tabular-nums",
                        stage.p95Ms == null ? "text-ink-subtle" : "text-ink-muted",
                      )}
                    >
                      {formatMs(stage.p95Ms)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>
        </div>

        <div>
          <SectionTitle>{t("deadLetterStreams")}</SectionTitle>
          <AdminPanel>
            {health.deadLetters.length === 0 ? (
              <EmptyRow>{t("noDeadLetterStream")}</EmptyRow>
            ) : (
              <ul>
                {health.deadLetters.map((deadLetter) => (
                  <li
                    key={deadLetter.stream}
                    className="flex items-center justify-between border-b border-hairline/60 px-4 py-2.5 text-[13px] last:border-b-0"
                  >
                    <span className="min-w-0 truncate font-mono text-[12px]">
                      {deadLetter.stream}
                    </span>
                    <span
                      className={cn(
                        "tabular-nums",
                        deadLetter.length > 0
                          ? "font-semibold text-destructive"
                          : "text-ink-muted",
                      )}
                    >
                      {numberFormatter.format(deadLetter.length)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>
        </div>
      </div>

      {/* The list stays for diagnosis; the "targets down" tile went, because a count that the
          kubeadm localhost targets held at 6 for days said nothing about the platform. */}
      <SectionTitle note={t("downFirst")}>{t("scrapeTargets")}</SectionTitle>
      <AdminPanel>
        {health.targets.length === 0 ? (
          <EmptyRow>{t("noTargets")}</EmptyRow>
        ) : (
          <ul className="grid sm:grid-cols-2">
            {health.targets.map((target) => (
              <li
                key={`${target.job}-${target.instance}`}
                className="flex items-center gap-2 border-b border-hairline/60 px-4 py-2.5 text-[13px] last:border-b-0 sm:odd:border-r"
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    target.isUp ? "bg-emerald-500" : "bg-destructive",
                  )}
                />
                <span className="min-w-0 flex-1 truncate font-medium">{target.job}</span>
                <span className="truncate font-mono text-[11px] text-ink-subtle">
                  {target.instance}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <p className="mt-5 text-[12px] text-ink-muted">{t("footerNote")}</p>
    </>
  );
}

const TONE_TEXT: Record<RateTone, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
  unknown: "text-ink-subtle",
};

/**
 * The headline: of the meetings that ended in the last 24 hours, how many reached live — two
 * people and a caption. Everything else on the page explains this number.
 */
function MeetingHeadline({ meetings }: { meetings: AdminHealthMeetingOutcomesDto | null }) {
  const t = useTranslations("adminOps.health");
  const tone = rateTone(meetings?.successRate);

  return (
    <>
      <SectionTitle note={t("last24h")}>{t("liveMeetings")}</SectionTitle>
      <AdminPanel>
        {meetings == null ? (
          <EmptyRow>{t("noMeetingSeries")}</EmptyRow>
        ) : (
          <div className="grid gap-0 md:grid-cols-[minmax(0,220px)_1fr]">
            <div className="border-b border-hairline/60 px-4 py-4 md:border-b-0 md:border-r">
              <p className="text-[11px] font-medium text-ink-muted">{t("successRate")}</p>
              <p className={cn("mt-1 text-[34px] font-semibold leading-none tabular-nums", TONE_TEXT[tone])}>
                {formatRate(meetings.successRate)}
              </p>
              <p className="mt-2 text-[11px] text-ink-muted">
                {t("successRateNote", { live: meetings.reachedLive, ended: meetings.ended })}
              </p>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              <Figure label={t("meetingsStarted")} value={meetings.started} />
              <Figure label={t("meetingsReachedLive")} value={meetings.reachedLive} />
              <Figure label={t("meetingsEndedNormally")} value={meetings.endedNormally} />
              <Figure label={t("meetingsAbandoned")} value={meetings.endedAbandoned} />
              <Figure label={t("meetingsFailed")} value={meetings.failed} bad={meetings.failed > 0} />
              <Figure
                label={t("liveRoomsNow")}
                value={meetings.liveRooms}
                hint={
                  meetings.occupiedRooms == null
                    ? undefined
                    : t("occupiedRooms", { count: meetings.occupiedRooms })
                }
              />
            </dl>
          </div>
        )}
      </AdminPanel>
    </>
  );
}

function Figure({
  label,
  value,
  bad = false,
  hint,
}: {
  label: string;
  value: number | null;
  bad?: boolean;
  hint?: string;
}) {
  return (
    <div className="border-b border-hairline/60 px-4 py-3 last:border-b-0 sm:border-r">
      <dt className="text-[11px] font-medium text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-[20px] font-semibold leading-none tabular-nums",
          bad ? "text-destructive" : value == null ? "text-ink-subtle" : "text-ink",
        )}
      >
        {value == null ? "—" : numberFormatter.format(value)}
      </dd>
      {hint ? <p className="mt-1 text-[11px] text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** STT → MT → TTS: attempt success over the last hour beside each stage's p95. */
function PipelinePanel({ health }: { health: AdminPlatformHealthDto }) {
  const t = useTranslations("adminOps.health");
  const rows = pipelineRows(health.stageOutcomes, health.stageLatencies);

  return (
    <>
      <SectionTitle note={t("lastHour")}>{t("pipeline")}</SectionTitle>
      <AdminPanel>
        <ul className="grid md:grid-cols-3">
          {rows.map((row) => {
            const tone = rateTone(row.successRate);
            return (
              <li
                key={row.stage}
                className="border-b border-hairline/60 px-4 py-3 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-medium text-ink">{t(`stage_${row.stage}`)}</span>
                  <span className="text-[11px] text-ink-muted">
                    {t("p95Value", { value: formatMs(row.p95Ms) })}
                  </span>
                </div>
                <p className={cn("mt-1 text-[22px] font-semibold leading-none tabular-nums", TONE_TEXT[tone])}>
                  {formatRate(row.successRate)}
                </p>
                <p className="mt-1.5 text-[11px] text-ink-muted">
                  {t("stageCounts", {
                    ok: numberFormatter.format(row.ok),
                    failed: numberFormatter.format(row.failed),
                    parked: numberFormatter.format(row.deadLettered),
                  })}
                </p>
              </li>
            );
          })}
        </ul>
      </AdminPanel>
    </>
  );
}

/**
 * Standalone because it is shown in both states: the outbox lives in the workspace database, so
 * it is still readable while Prometheus is not.
 */
function OutboxDeadLetters({ outbox }: { outbox: AdminHealthOutboxDeadLettersDto | null }) {
  const t = useTranslations("adminOps.health");
  if (outbox == null) return null;
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <SummaryTile
        label={t("tileOutboxDeadLetters")}
        value={outbox.count}
        bad={outbox.count > 0}
        hint={outbox.oldestAt ? t("oldestSince", { since: formatSince(outbox.oldestAt, t("justNow")) }) : undefined}
      />
    </div>
  );
}

/**
 * Live Grafana, same origin, behind the platform-admin ForwardAuth. The frame carries the admin's
 * session cookie; nobody without the admin role gets past Traefik, so there is no Grafana login.
 */
function GrafanaSection({ embedPath }: { embedPath: string | null }) {
  const t = useTranslations("adminOps.health");
  const { resolvedTheme } = useTheme();
  const [active, setActive] = useState<GrafanaDashboardKey>("meetings");
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const dashboard = GRAFANA_DASHBOARDS.find((d) => d.key === active) ?? GRAFANA_DASHBOARDS[0];
  const src = grafanaDashboardUrl(embedPath, dashboard, theme);
  const openHref = grafanaDashboardUrl(embedPath, dashboard, theme, { kiosk: false });

  return (
    <>
      <SectionTitle note={t("grafanaNote")}>{t("grafanaTitle")}</SectionTitle>
      <AdminPanel>
        {src == null ? (
          <EmptyRow>{t("grafanaUnavailable")}</EmptyRow>
        ) : (
          <>
            <div className="px-4">
              <AdminFilterTabs
                label={t("grafanaTitle")}
                tabs={GRAFANA_DASHBOARDS.map((d) => ({ value: d.key, label: t(`grafana_${d.key}`) }))}
                value={active}
                onChange={setActive}
                trailing={
                  openHref ? (
                    <a
                      href={openHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink"
                    >
                      {t("openInGrafana")}
                      <ArrowSquareOut size={12} />
                    </a>
                  ) : null
                }
              />
            </div>
            <iframe
              key={src}
              src={src}
              title={t(`grafana_${dashboard.key}`)}
              className="block h-[900px] w-full border-0 bg-surface-1"
              loading="lazy"
              referrerPolicy="same-origin"
            />
          </>
        )}
      </AdminPanel>
    </>
  );
}

function SummaryTile({
  label,
  value,
  total,
  bad,
  hint,
}: {
  label: string;
  value: number | null;
  total?: number;
  bad: boolean;
  hint?: string;
}) {
  const t = useTranslations("adminOps.health");
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        bad ? "border-destructive/30 bg-destructive/5" : "border-border bg-surface-1",
      )}
    >
      <p className="text-[11px] font-medium text-ink-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-[26px] font-semibold leading-none tabular-nums",
            bad ? "text-destructive" : value == null ? "text-ink-subtle" : "text-ink",
          )}
        >
          {value == null ? "—" : numberFormatter.format(value)}
        </span>
        {/* The denominator is what stops "0" reading as "nothing is monitored". */}
        {total != null ? (
          <span className="text-[12px] text-ink-subtle">{t("ofTotal", { total })}</span>
        ) : null}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function AlertRow({ alert }: { alert: AdminHealthAlertDto }) {
  const t = useTranslations("adminOps.health");
  const critical = alert.severity.toLowerCase() === "critical";

  return (
    <div className="flex flex-col gap-1.5 border-b border-hairline/60 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:gap-0">
      <div className="w-[90px] shrink-0">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            critical
              ? "border-destructive/20 bg-destructive/10 text-destructive"
              : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          )}
        >
          {alert.severity}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{alert.name}</p>
        {alert.summary ? (
          <p className="truncate text-[12px] text-ink-muted">{alert.summary}</p>
        ) : null}
      </div>
      {/* "pending" means the rule matched but has not held for its `for:` duration yet. Showing
          it as firing would put a page-worthy label on something that may clear by itself. */}
      <div className="w-[80px] shrink-0 text-[12px] text-ink-muted">{alert.state}</div>
      <div className="w-[80px] shrink-0 text-[12px] text-ink-muted md:text-right">
        {formatSince(alert.activeSince, t("justNow"))}
      </div>
    </div>
  );
}

function StreamGroupRow({ group }: { group: AdminHealthStreamGroupDto }) {
  const t = useTranslations("adminOps.health");
  const lagging = group.lag >= LAG_ALERT_THRESHOLD;
  const stuck = group.pending >= PENDING_ALERT_THRESHOLD;

  return (
    <div className="flex flex-col gap-1 border-b border-hairline/60 px-4 py-2.5 text-[13px] last:border-b-0 md:flex-row md:items-center md:gap-0">
      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{group.stream}</span>
      <span className="w-[190px] shrink-0 truncate font-mono text-[12px] text-ink-muted">
        {group.group}
      </span>
      <span
        className={cn(
          "w-[80px] shrink-0 tabular-nums md:text-right",
          lagging ? "font-semibold text-destructive" : "text-ink-muted",
        )}
      >
        {numberFormatter.format(group.lag)}
      </span>
      <span
        className={cn(
          "w-[80px] shrink-0 tabular-nums md:text-right",
          stuck ? "font-semibold text-destructive" : "text-ink-muted",
        )}
      >
        {numberFormatter.format(group.pending)}
      </span>
      {/* Zero here means nothing was ever wired to read this group — Redis keeps a consumer
          registered after its process exits, so this cannot report a worker that died. */}
      <Tooltip content={group.consumers === 0 ? t("noConsumerTooltip") : t("consumerSeenTooltip")}>
        <span
          className={cn(
            "w-[90px] shrink-0 tabular-nums md:text-right",
            group.consumers === 0 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-ink-muted",
          )}
        >
          {group.consumers}
        </span>
      </Tooltip>
    </div>
  );
}
