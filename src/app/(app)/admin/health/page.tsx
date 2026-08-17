"use client";

import {
  ArrowsClockwise,
  Cpu,
  Heartbeat,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { useAdminPlatformHealth } from "@/hooks/use-admin-platform-health";
import { cn } from "@/lib/utils";
import type {
  AdminHealthAlertDto,
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

function formatSince(value: string | null) {
  if (!value) return "—";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
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
  const healthQuery = useAdminPlatformHealth();
  const health = healthQuery.data;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Operations"
        eyebrowIcon={<Heartbeat size={14} weight="fill" />}
        title="System health"
        description="Read back out of the metrics store, not asked of each service. A service that has lost its Redis consumer group answers its own health check with a 200."
        actions={
          <div className="flex items-center gap-3">
            {health ? (
              <span className="text-[12px] text-ink-muted">
                as of {formatClock(health.observedAt)}
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void healthQuery.refetch()}
              disabled={healthQuery.isFetching}
            >
              <ArrowsClockwise size={14} className={cn(healthQuery.isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      {healthQuery.isError ? (
        <AdminPanel className="mt-5">
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">System health could not be loaded.</p>
              <p className="mt-1 text-ink-muted">
                Check the workspace service and that your session still holds the platform admin
                role.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void healthQuery.refetch()}
              >
                Try again
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
        <MonitoringUnavailable health={health} />
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
  return (
    <AdminPanel className="mt-5 border-amber-500/30 bg-amber-500/5">
      <div className="flex items-start gap-3 px-4 py-8 text-sm">
        <Warning size={18} weight="duotone" className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="font-medium">Monitoring is unreadable right now.</p>
          <p className="mt-1 text-ink-muted">
            {health.monitoringUnavailableReason ?? "The metrics store did not answer."}
          </p>
          <p className="mt-3 max-w-xl text-[12px] text-ink-muted">
            This screen is reporting that it cannot see, not that the platform is down. Nothing
            below is being shown as zero, because zero would be a claim. Prometheus runs on the
            infra host; if it is restarting, this clears on its own.
          </p>
        </div>
      </div>
    </AdminPanel>
  );
}

function HealthBody({ health }: { health: AdminPlatformHealthDto }) {
  const downTargets = health.targets.filter((t) => !t.isUp);
  const missingWorkers = health.workers.filter((w) => w.replicas === 0);
  const busiestGroups = health.streamGroups.filter(
    (g) => g.lag >= LAG_ALERT_THRESHOLD || g.pending >= PENDING_ALERT_THRESHOLD,
  );
  const nonEmptyDeadLetters = health.deadLetters.filter((d) => d.length > 0);

  return (
    <>
      {health.warnings.length > 0 ? (
        <AdminPanel className="mt-5 border-amber-500/30 bg-amber-500/5">
          <div className="px-4 py-3 text-[12px]">
            <p className="font-medium text-ink">Part of this screen could not be read.</p>
            <ul className="mt-1 list-inside list-disc text-ink-muted">
              {health.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </AdminPanel>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label="Scrape targets down"
          value={downTargets.length}
          total={health.targets.length}
          bad={downTargets.length > 0}
        />
        <SummaryTile
          label="Worker classes at zero"
          value={missingWorkers.length}
          total={health.workers.length}
          bad={missingWorkers.length > 0}
        />
        <SummaryTile
          label="Backed-up stream groups"
          value={busiestGroups.length}
          total={health.streamGroups.length}
          bad={busiestGroups.length > 0}
        />
        <SummaryTile
          label="Dead-letter streams"
          value={nonEmptyDeadLetters.length}
          total={health.deadLetters.length}
          bad={nonEmptyDeadLetters.length > 0}
        />
      </div>

      <SectionTitle note={`${health.alerts.length} active`}>Firing alerts</SectionTitle>
      <AdminPanel>
        {health.alerts.length === 0 ? (
          <EmptyRow>Nothing is firing.</EmptyRow>
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

      <SectionTitle note="down first">Scrape targets</SectionTitle>
      <AdminPanel>
        {health.targets.length === 0 ? (
          <EmptyRow>The metrics store reported no targets.</EmptyRow>
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

      <SectionTitle note="live heartbeat keys">AI workers</SectionTitle>
      <AdminPanel>
        {health.workers.length === 0 ? (
          <EmptyRow>No worker heartbeats are being reported.</EmptyRow>
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

      <SectionTitle note={`${health.streamGroups.length} discovered`}>
        Redis stream groups
      </SectionTitle>
      <AdminPanel>
        {health.streamGroups.length === 0 ? (
          <EmptyRow>No consumer groups were reported.</EmptyRow>
        ) : (
          <>
            <div className="hidden border-b border-hairline/60 px-4 py-2 text-[11px] font-medium text-ink-muted md:flex">
              <span className="flex-1">Stream</span>
              <span className="w-[190px]">Group</span>
              <span className="w-[80px] text-right">Lag</span>
              <span className="w-[80px] text-right">Pending</span>
              <span className="w-[90px] text-right">Consumers</span>
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
          <SectionTitle note="p95 over the last hour">Pipeline stage latency</SectionTitle>
          <AdminPanel>
            {health.stageLatencies.length === 0 ? (
              <EmptyRow>No stage has reported a latency observation.</EmptyRow>
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
          <SectionTitle>Dead-letter streams</SectionTitle>
          <AdminPanel>
            {health.deadLetters.length === 0 ? (
              <EmptyRow>No dead-letter stream exists.</EmptyRow>
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

      <p className="mt-5 text-[12px] text-ink-muted">
        Read-only. There is no restart, no scale and no alert silencing here — this screen reports
        what the platform is doing, and acting on it belongs on the host.
      </p>
    </>
  );
}

function SummaryTile({
  label,
  value,
  total,
  bad,
}: {
  label: string;
  value: number;
  total: number;
  bad: boolean;
}) {
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
            bad ? "text-destructive" : "text-ink",
          )}
        >
          {value}
        </span>
        {/* The denominator is what stops "0" reading as "nothing is monitored". */}
        <span className="text-[12px] text-ink-subtle">of {total}</span>
      </p>
    </div>
  );
}

function AlertRow({ alert }: { alert: AdminHealthAlertDto }) {
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
        {formatSince(alert.activeSince)}
      </div>
    </div>
  );
}

function StreamGroupRow({ group }: { group: AdminHealthStreamGroupDto }) {
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
      <span
        className={cn(
          "w-[90px] shrink-0 tabular-nums md:text-right",
          group.consumers === 0 ? "font-semibold text-amber-600" : "text-ink-muted",
        )}
        title={
          group.consumers === 0
            ? "No consumer has ever read this group"
            : "Consumer names Redis has seen, not readers attached now"
        }
      >
        {group.consumers}
      </span>
    </div>
  );
}
