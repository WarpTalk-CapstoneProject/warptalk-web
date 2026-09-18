"use client";

/**
 * The Usage page's surface: every cell of the ruled grid, laid out from data it is handed.
 *
 * Split from ./usage/page.tsx, which owns the queries, the clock and the role gate, so the whole
 * layout can be rendered against fixtures at /dev/usage-preview in both themes — the billing
 * service is not reachable from a laptop, and a page nobody can look at before it deploys is how
 * the previous one shipped with labels that truncated in every row. Why the page is shaped like
 * this is written at the top of ./usage/page.tsx; the numbers come from lib/billing/usage-overview.
 */

import { CalendarBlank, CaretDown, DownloadSimple, ArrowClockwise, Spinner } from "@phosphor-icons/react";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { summariseCycleActivity } from "@/lib/billing/cycle-activity";
import { summariseCycleBurnUp } from "@/lib/billing/cycle-burnup";
import {
  attributeMeetings,
  buildServiceCards,
  buildUsageCsvRows,
  creditMovements,
  cycleElapsedFraction,
  filterByMember,
  memberDirectory,
  memberLabelOf,
  movementLabel,
  rankMeetings,
  rankMembers,
  serviceColorSlots,
  summariseSpendByService,
  toCsv,
  type BreakdownRowLike,
  type MeetingWindowLike,
  type OverviewBucketSize,
  type RankedRow,
  type ServiceCard,
  type UsageMemberLike,
} from "@/lib/billing/usage-overview";
import { formatAmount } from "@/lib/format/currency";
import { downloadBlob } from "@/lib/ui/download-blob";
import { cn } from "@/lib/utils";
import { roomDetailPath } from "@/lib/workspace/workspace-routes";
import type { CreditBalanceDto, CreditTransactionDto } from "@/types/billing";

import { MiniBars, serviceColor, UsageSpendChart } from "./usage-spend-chart";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Above this many days a cycle is bucketed by week by default — `cycle-activity`'s threshold. */
const MAX_DAILY_BUCKETS = 62;

const ALL_MEMBERS = "__all__";

export interface UsageOverviewProps {
  balance: CreditBalanceDto | undefined;
  /** The cycle's credit transactions, every page of them (WT-430). Undefined while loading. */
  ledger: CreditTransactionDto[] | undefined;
  /** `/usages/workspace/{id}/breakdown` over the days since the cycle began. */
  serviceUsage: readonly BreakdownRowLike[] | undefined;
  /** The member directory that names the ledger's user ids. */
  members: readonly UsageMemberLike[];
  /** Rooms that ran this cycle, for matching charges to meetings. */
  rooms: readonly MeetingWindowLike[];
  /** The page's one clock. */
  now: number;
  isLoading: boolean;
  workspaceSlug: string;
  onRefresh: () => void;
}

export function UsageOverview({
  balance,
  ledger,
  serviceUsage,
  members,
  rooms,
  now,
  isLoading,
  workspaceSlug,
  onRefresh,
}: UsageOverviewProps) {
  const t = useTranslations("settingsBillingUsage");
  const [memberKey, setMemberKey] = useState<string | null>(null);
  const [bucketChoice, setBucketChoice] = useState<OverviewBucketSize | null>(null);
  const [leftTab, setLeftTab] = useState<"services" | "movements">("services");
  const [rightTab, setRightTab] = useState<"members" | "meetings">("members");

  const cycleStart = balance?.currentPeriodStart;
  const cycleDaysElapsed = cycleStart
    ? Math.max(1, Math.ceil((now - new Date(cycleStart).getTime()) / MS_PER_DAY))
    : 30;

  const cycleDays = balance
    ? Math.max(
        1,
        Math.round(
          (new Date(balance.currentPeriodEnd).getTime() -
            new Date(balance.currentPeriodStart).getTime()) /
            MS_PER_DAY,
        ),
      )
    : 30;
  const defaultBucket: OverviewBucketSize = cycleDays > MAX_DAILY_BUCKETS ? "week" : "day";
  const bucketSize = bucketChoice ?? defaultBucket;

  const allTransactions = useMemo(() => ledger ?? [], [ledger]);
  const roomWindows = useMemo(() => rooms, [rooms]);
  const directory = useMemo(() => memberDirectory(members), [members]);

  const attribution = useMemo(
    () => attributeMeetings(allTransactions, roomWindows, now),
    [allTransactions, roomWindows, now],
  );

  const memberOptions = useMemo(
    () => rankMembers(allTransactions, directory),
    [allTransactions, directory],
  );

  const transactions = useMemo(
    () => filterByMember(allTransactions, memberKey),
    [allTransactions, memberKey],
  );

  const periodInput = useCallback(
    (items: CreditTransactionDto[]) =>
      balance
        ? {
            transactions: items,
            currentPeriodStart: balance.currentPeriodStart,
            currentPeriodEnd: balance.currentPeriodEnd,
          }
        : null,
    [balance],
  );

  /** Unfiltered and ranked once, so a service keeps its colour when a member is picked. */
  const workspaceSpend = useMemo(() => {
    const input = periodInput(allTransactions);
    return input ? summariseSpendByService(input, now, defaultBucket, attribution) : null;
  }, [periodInput, allTransactions, now, defaultBucket, attribution]);

  const slots = useMemo(
    () => serviceColorSlots(workspaceSpend?.services ?? []),
    [workspaceSpend],
  );

  const spend = useMemo(() => {
    const input = periodInput(transactions);
    return input ? summariseSpendByService(input, now, bucketSize, attribution) : null;
  }, [periodInput, transactions, now, bucketSize, attribution]);

  /** The small charts are always at the default granularity, whatever the main chart shows. */
  const miniSpend = useMemo(() => {
    if (bucketSize === defaultBucket) return spend;
    const input = periodInput(transactions);
    return input ? summariseSpendByService(input, now, defaultBucket, attribution) : null;
  }, [spend, bucketSize, defaultBucket, periodInput, transactions, now, attribution]);

  const serviceCards = useMemo(
    () => (miniSpend ? buildServiceCards(miniSpend, memberKey ? null : (serviceUsage ?? null)) : []),
    [miniSpend, memberKey, serviceUsage],
  );

  const memberRows = useMemo(() => rankMembers(transactions, directory), [transactions, directory]);
  const meetingRows = useMemo(
    () => rankMeetings(transactions, attribution, roomWindows),
    [transactions, attribution, roomWindows],
  );
  const movements = useMemo(() => creditMovements(transactions), [transactions]);

  const cycleActivity = useMemo(() => {
    if (!balance || !ledger) return null;
    return summariseCycleActivity(
      {
        transactions: ledger,
        currentPeriodStart: balance.currentPeriodStart,
        currentPeriodEnd: balance.currentPeriodEnd,
        totalCredits: balance.totalCredits,
      },
      now,
    );
  }, [balance, ledger, now]);

  const burnUp = useMemo(() => {
    if (!balance || !ledger) return null;
    return summariseCycleBurnUp(
      {
        transactions: ledger,
        currentPeriodStart: balance.currentPeriodStart,
        currentPeriodEnd: balance.currentPeriodEnd,
        totalCredits: balance.totalCredits,
        currentCredits: balance.currentCredits,
      },
      now,
    );
  }, [balance, ledger, now]);

  const overageDate = useMemo(() => {
    if (!burnUp || burnUp.overageAt === null) return null;
    const bucketDays = burnUp.bucketSize === "week" ? 7 : 1;
    const at = new Date(burnUp.points[0].start.getTime());
    at.setDate(at.getDate() + Math.round(burnUp.overageAt * bucketDays));
    return at;
  }, [burnUp]);

  const chartSeries = useMemo(() => {
    const present = spend?.services ?? [];
    const named = present
      .filter((service) => (slots.get(service.key) ?? 0) > 0)
      .sort((a, b) => (slots.get(a.key) ?? 0) - (slots.get(b.key) ?? 0))
      .map((service) => ({ key: service.key, label: service.label, slot: slots.get(service.key)! }));
    const hasOther = present.some((service) => (slots.get(service.key) ?? 0) === 0);
    return hasOther ? [...named, { key: "other", label: t("usageSpendChart.otherServices"), slot: 0 }] : named;
  }, [spend, slots, t]);

  // Workspace figures. They add up: granted + carried + topped up = available.
  const toppedUp = cycleActivity ? Math.round(cycleActivity.totalToppedUp) : 0;
  const workspaceConsumed = cycleActivity ? Math.round(cycleActivity.totalConsumed) : 0;
  const granted = Math.round(balance?.totalCredits ?? 0);
  const available = burnUp ? Math.round(burnUp.available) : granted + toppedUp;
  // Whatever the cycle started with that the plan did not grant: a balance rolled over from last
  // cycle, or an admin adjustment. It is the difference between two numbers the page already
  // shows, and leaving it out is what made them disagree.
  const carried = available - granted - toppedUp;
  const remaining = balance?.currentCredits ?? 0;

  const spent = memberKey ? Math.round(spend?.total ?? 0) : workspaceConsumed;
  const selectedMember = memberKey ? memberOptions.find((row) => row.key === memberKey) : null;
  const memberLabel = memberKey
    ? (selectedMember?.label ?? t("header.selectedMember"))
    : t("header.allMembers");

  const elapsedFraction = balance
    ? cycleElapsedFraction(balance.currentPeriodStart, balance.currentPeriodEnd, now)
    : 0;

  const exportCsv = useCallback(() => {
    const rows = buildUsageCsvRows(transactions, {
      directory,
      attribution,
      rooms: roomWindows,
    });
    const suffix = memberKey ? `-${memberLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "";
    const fileName = `usage-${workspaceSlug || "workspace"}-${format(now, "yyyy-MM-dd")}${suffix}.csv`;
    // A byte-order mark so a spreadsheet opens member names with diacritics as UTF-8.
    void downloadBlob(
      () => new Blob(["\uFEFF", toCsv(rows)], { type: "text/csv;charset=utf-8" }),
      fileName,
    ).catch(() => undefined);
  }, [transactions, directory, attribution, roomWindows, memberKey, memberLabel, workspaceSlug, now]);


  const bucketWord = bucketSize === "week" ? "week" : "day";

  return (
    <div className="@container flex min-w-0 flex-col text-ink">
      {/* 1. Header row */}
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-hairline px-4 py-3.5 sm:px-6">
        <h1 className="mr-auto text-[20px] font-semibold leading-tight tracking-[-0.3px] text-ink">
          {t("header.title")}
        </h1>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-medium text-ink outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            aria-label={t("header.filterByMember")}
          >
            <span className="truncate">{memberLabel}</span>
            <CaretDown className="size-3.5 shrink-0 text-ink-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[320px] w-60 overflow-y-auto">
            <DropdownMenuRadioGroup
              value={memberKey ?? ALL_MEMBERS}
              onValueChange={(value) => setMemberKey(value === ALL_MEMBERS ? null : String(value))}
            >
              <DropdownMenuRadioItem value={ALL_MEMBERS}>{t("header.allMembers")}</DropdownMenuRadioItem>
              {memberOptions.map((option) => (
                <DropdownMenuRadioItem key={option.key} value={option.key}>
                  <span className="truncate">{option.label}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 text-[13px] font-medium text-ink">
          <CalendarBlank className="size-3.5 text-ink-muted" />
          {balance
            ? t("header.cycleRangeElapsed", {
                range: `${format(new Date(balance.currentPeriodStart), "MMM d")} – ${format(
                  new Date(balance.currentPeriodEnd),
                  "MMM d",
                )}`,
                days: cycleDaysElapsed,
              })
            : t("header.thisBillingCycle")}
        </span>

        <IconButton label={t("header.refresh")} onClick={onRefresh}>
          <ArrowClockwise className="size-4" />
        </IconButton>
        <IconButton
          label={t("header.exportCsv")}
          onClick={exportCsv}
          disabled={transactions.length === 0}
        >
          <DownloadSimple className="size-4" />
        </IconButton>
      </div>

      {/* 2. Main row */}
      <div className="grid border-b border-hairline @min-[940px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 border-b border-hairline px-4 py-5 sm:px-6 @min-[940px]:border-b-0 @min-[940px]:border-r">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] text-ink-muted">{t("chart.creditsSpent")}</span>
            <div className="flex items-center gap-1.5">
              {/* One grouping exists today. A label, not a menu that offers a single choice. */}
              <span className="px-1.5 text-[13px] text-ink-muted">
                {t("chart.groupBy")} <b className="font-medium text-ink">{t("chart.service")}</b>
              </span>
              <div
                role="group"
                aria-label={t("chart.bucketSizeAria")}
                className="flex gap-0.5 border-l border-hairline pl-1.5"
              >
                {(["day", "week"] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={bucketSize === size}
                    onClick={() => setBucketChoice(size)}
                    className={cn(
                      "h-7 min-w-8 rounded-[6px] px-2 text-[13px] font-medium",
                      bucketSize === size
                        ? "bg-surface-3 text-ink"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {size === "day" ? t("chart.day") : t("chart.week")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.4px] tabular-nums text-ink">
            {t("chart.creditsHeadline", { amount: formatAmount(spent) })}
          </p>
          <p className="mt-0.5 text-[13px] tabular-nums text-[var(--primary)]">
            {t("chart.avgPerBucket", {
              amount: formatAmount(Math.round(spend?.averagePerBucket ?? 0)),
              bucket: bucketWord,
            })}
          </p>
          {overageDate && burnUp ? (
            <p className="mt-0.5 text-[12px] font-semibold text-destructive">
              {memberKey ? t("chart.workspacePrefix") : ""}
              {burnUp.overageIsMeasured
                ? t("chart.inOverageSince", { date: format(overageDate, "d MMM") })
                : t("chart.projectedOverageOn", { date: format(overageDate, "d MMM") })}
            </p>
          ) : null}

          <div className="mt-4">
            {isLoading ? (
              <div className="flex h-[260px] items-center justify-center">
                <Spinner className="h-5 w-5 animate-spin text-ink-muted" />
              </div>
            ) : !spend ? (
              <p className="flex h-[260px] items-center justify-center text-[12px] text-ink-muted">
                {t("chart.noDatesToChart")}
              </p>
            ) : spend.total === 0 ? (
              <div className="flex h-[260px] flex-col items-center justify-center gap-1 text-center">
                <p className="text-[13px] text-ink">
                  {memberKey ? t("chart.noSpendMember") : t("chart.noSpendWorkspace")}
                </p>
                <p className="text-[12px] text-ink-muted">
                  {t("chart.spendingAppearsHere", { bucket: bucketWord })}
                </p>
              </div>
            ) : (
              <UsageSpendChart
                buckets={spend.buckets}
                bucketSize={bucketSize}
                series={chartSeries}
                average={spend.averagePerBucket}
              />
            )}
          </div>
        </div>

        {/* Rail: a column beside the chart, a 3-up row under it, then a stack. The rule between
            cells moves with the layout, or the cells hang together with nothing between them. */}
        <div className="grid min-w-0 @min-[600px]:grid-cols-3 @min-[940px]:flex @min-[940px]:flex-col">
          <div className="min-w-0 border-b border-hairline px-4 py-[18px] sm:px-6 @min-[600px]:border-b-0 @min-[600px]:border-r @min-[940px]:border-b @min-[940px]:border-r-0">
            <p className="text-[13px] text-ink-muted">{t("rail.cycleCredits")}</p>
            <div className="mt-2.5 flex items-baseline justify-between gap-2 tabular-nums">
              <b className="truncate text-[13px] font-medium text-ink">
                {memberKey ? t("rail.spentByMember", { member: memberLabel }) : t("rail.spent")}
              </b>
              <span className="shrink-0 text-[13px] text-ink">
                {t("rail.spentOfAvailable", { spent: formatAmount(spent), available: formatAmount(available) })}
              </span>
            </div>
            <PaceTrack spent={spent} available={available} elapsed={elapsedFraction} />
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[12px] tabular-nums">
              <dt className="text-ink-muted">{t("rail.granted")}</dt>
              <dd className="text-right text-ink">{formatAmount(granted)}</dd>
              <dt className="text-ink-muted">{carried < 0 ? t("rail.adjustments") : t("rail.carriedOver")}</dt>
              <dd className="text-right text-ink">{formatAmount(carried)}</dd>
              <dt className="text-ink-muted">{t("rail.toppedUp")}</dt>
              <dd className="text-right text-ink">{formatAmount(toppedUp)}</dd>
              <dt className="text-ink-muted">{t("rail.remaining")}</dt>
              <dd className={cn("text-right", remaining <= 0 ? "text-destructive" : "text-ink")}>
                {formatAmount(remaining)}
              </dd>
            </dl>
            <PaceNote
              spent={workspaceConsumed}
              available={available}
              elapsed={elapsedFraction}
              overageDate={overageDate}
              overageIsMeasured={burnUp?.overageIsMeasured ?? false}
              hasRate={burnUp?.perBucket !== null && burnUp?.perBucket !== undefined}
            />
          </div>

          <div className="min-w-0 border-b border-hairline px-4 py-[18px] sm:px-6 @min-[600px]:border-b-0 @min-[600px]:border-r @min-[940px]:border-b @min-[940px]:border-r-0">
            <p className="text-[13px] text-ink-muted">{t("rail.settlements")}</p>
            <p className="mt-1 text-[22px] font-semibold leading-tight tabular-nums text-ink">
              {formatAmount(miniSpend?.settlements ?? 0)}
            </p>
            <div className="mt-1.5">
              <MiniBars
                values={miniSpend?.buckets.map((b) => b.settlements) ?? []}
                label={t("rail.settlementsPerBucket", { bucket: defaultBucket })}
              />
            </div>
            <p className="mt-2 text-[12px] text-ink-muted">{t("rail.settlementsDetail")}</p>
          </div>

          <div className="min-w-0 px-4 py-[18px] sm:px-6">
            <p className="text-[13px] text-ink-muted">{t("rail.meetingsBilled")}</p>
            <p className="mt-1 text-[22px] font-semibold leading-tight tabular-nums text-ink">
              {formatAmount(miniSpend?.meetings ?? 0)}
            </p>
            <div className="mt-1.5">
              <MiniBars
                values={miniSpend?.buckets.map((b) => b.meetings) ?? []}
                label={t("rail.meetingsBilledPerBucket", { bucket: defaultBucket })}
              />
            </div>
            <p className="mt-2 text-[12px] text-ink-muted">
              {t("rail.busiestBucket", { bucket: defaultBucket })}{" "}
              <b className="font-medium text-ink">
                {miniSpend?.busiest
                  ? t("rail.busiestValue", {
                      date: format(miniSpend.busiest.start, "MMM d"),
                      amount: formatAmount(Math.round(miniSpend.busiest.total)),
                    })
                  : t("rail.noValue")}
              </b>
            </p>
          </div>
        </div>
      </div>

      {/* 3. Bottom row */}
      <div className="grid @min-[940px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 border-b border-hairline @min-[940px]:border-b-0 @min-[940px]:border-r">
          <TabBar
            label={t("tabs.spendingDetail")}
            value={leftTab}
            onChange={setLeftTab}
            tabs={[
              { value: "services", label: t("tabs.aiServices") },
              { value: "movements", label: t("tabs.movements") },
            ]}
          />
          {leftTab === "services" ? (
            <ServiceCards cards={serviceCards} slots={slots} bucketWord={defaultBucket} />
          ) : (
            <MovementList movements={movements} directory={directory} />
          )}
        </div>

        <div className="min-w-0">
          <TabBar
            label={t("tabs.spendingBy")}
            value={rightTab}
            onChange={setRightTab}
            tabs={[
              { value: "members", label: t("tabs.members") },
              { value: "meetings", label: t("tabs.meetings") },
            ]}
          />
          {rightTab === "members" ? (
            <RankedList rows={memberRows} empty={t("rankedList.noMembers")} />
          ) : (
            <>
              <RankedList
                rows={meetingRows}
                empty={t("rankedList.noMeetings")}
                hrefOf={(row) =>
                  row.meetingId && workspaceSlug ? roomDetailPath(workspaceSlug, row.meetingId) : null
                }
                subOf={(row) =>
                  t("rankedList.meetingSub", {
                    date: format(row.firstAt, "MMM d"),
                    count: row.settlements,
                  })
                }
              />
              {meetingRows.length > 0 ? (
                <p className="px-4 pb-4 text-[11px] leading-relaxed text-ink-subtle sm:px-6">
                  {t("rankedList.meetingsFootnote")}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-8 place-items-center rounded-[8px] text-ink-muted hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Spent against available, with a tick where an even spend would be today. */
function PaceTrack({
  spent,
  available,
  elapsed,
}: {
  spent: number;
  available: number;
  elapsed: number;
}) {
  const t = useTranslations("settingsBillingUsage");
  const share = available > 0 ? spent / available : 0;
  const ahead = share > elapsed;
  return (
    <div
      role="progressbar"
      aria-label={t("rail.progressAria")}
      aria-valuemin={0}
      aria-valuemax={Math.max(available, 0)}
      aria-valuenow={Math.max(spent, 0)}
      className="relative mt-2 h-2 rounded-full bg-surface-3"
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          share >= 1 ? "bg-destructive" : ahead ? "bg-amber-500" : "bg-emerald-500",
        )}
        style={{ width: `${Math.min(100, share * 100)}%` }}
      />
      {available > 0 ? (
        <div
          title={t("rail.pointToday")}
          className="absolute -inset-y-[3px] w-0.5 rounded-[1px] bg-ink"
          style={{ left: `calc(${elapsed * 100}% - 1px)` }}
        />
      ) : null}
    </div>
  );
}

function PaceNote({
  spent,
  available,
  elapsed,
  overageDate,
  overageIsMeasured,
  hasRate,
}: {
  spent: number;
  available: number;
  elapsed: number;
  overageDate: Date | null;
  overageIsMeasured: boolean;
  hasRate: boolean;
}) {
  const t = useTranslations("settingsBillingUsage");
  let text: React.ReactNode;
  let bad = false;
  if (overageDate) {
    bad = true;
    text = overageIsMeasured
      ? t.rich("rail.paceNote.inOverageSince", {
          date: () => <b className="font-medium">{format(overageDate, "MMM d")}</b>,
        })
      : t.rich("rail.paceNote.projectedOverageStarts", {
          date: () => <b className="font-medium">{format(overageDate, "MMM d")}</b>,
        });
  } else if (available <= 0) {
    text = t("rail.paceNote.noAllowance");
  } else if (!hasRate) {
    text = t("rail.paceNote.tooEarly");
  } else {
    const even = available * elapsed;
    const delta = even > 0 ? Math.round(((spent - even) / even) * 100) : 0;
    text = (
      <>
        {t.rich("rail.paceNote.lastsWholeCycle", {
          b: (chunks) => <b className="font-medium text-ink">{chunks}</b>,
        })}
        {delta > 0 ? t("rail.paceNote.aheadOfEvenSpend", { delta }) : ""}.
      </>
    );
  }
  return (
    <p className={cn("mt-2.5 text-[12px]", bad ? "text-destructive" : "text-ink-muted")}>{text}</p>
  );
}

function TabBar<T extends string>({
  label,
  value,
  onChange,
  tabs,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: string }[];
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-5 overflow-x-auto overflow-y-hidden border-b border-hairline px-4 sm:px-6"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "h-[46px] shrink-0 whitespace-nowrap border-b-2 text-[13px] font-medium",
            value === tab.value
              ? "border-ink text-ink"
              : "border-transparent text-ink-muted hover:text-ink",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Credits per use: a small number for a translated line, a large one for a clone. */
function formatPerUse(value: number): string {
  if (value >= 100) return formatAmount(Math.round(value));
  if (value >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

function ServiceCards({
  cards,
  slots,
  bucketWord,
}: {
  cards: ServiceCard[];
  slots: Map<string, number>;
  bucketWord: OverviewBucketSize;
}) {
  const t = useTranslations("settingsBillingUsage");
  if (cards.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[12px] text-ink-muted sm:px-6">
        {t("serviceCards.empty")}
      </p>
    );
  }
  return (
    // Cells ruled by hairlines, not bordered cards: the page's main content box is the one card on
    // this screen (owner, 2026-09-17: "card lồng card, để card main content làm card chính"). The
    // rule between columns belongs to the left cell, so an odd last card leaves no stray line.
    <div className="grid @min-[560px]:grid-cols-2">
      {cards.map((card) => {
        const color = serviceColor(slots.get(card.key) ?? 0);
        return (
          <article
            key={card.key}
            className="min-w-0 border-b border-hairline px-4 py-4 sm:px-6 @min-[560px]:odd:border-r"
          >
            <h3 className="truncate text-[13px] font-medium text-ink" title={card.label}>
              {card.label}
            </h3>
            <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[12px] tabular-nums text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-[9px] rounded-[2px]" style={{ background: color }} />
                {t("serviceCards.credits", { amount: formatAmount(card.credits) })}
              </span>
              <span>{t("serviceCards.uses", { amount: formatAmount(card.uses) })}</span>
              {/* An em dash, never "0.00": no recorded use is unknown, not free. */}
              <span>
                {t("serviceCards.perUse", {
                  value: card.creditsPerUse === null ? t("serviceCards.noValue") : formatPerUse(card.creditsPerUse),
                })}
              </span>
            </div>
            <div className="mt-2.5">
              <MiniBars
                values={card.series}
                color={color}
                height={72}
                label={t("serviceCards.creditsPerBucket", { label: card.label, bucket: bucketWord })}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MovementList({
  movements,
  directory,
}: {
  movements: CreditTransactionDto[];
  directory: ReturnType<typeof memberDirectory>;
}) {
  const t = useTranslations("settingsBillingUsage");
  if (movements.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[12px] text-ink-muted sm:px-6">
        {t("movements.empty")}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-hairline">
      {movements.map((tx) => (
        <li key={tx.id} className="flex items-baseline justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-[13px] text-ink">
              {movementLabel(tx)}
              {tx.description ? (
                <span className="text-ink-muted"> · {tx.description}</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-subtle">
              {format(new Date(tx.createdAt), "MMM d, HH:mm")} · {memberLabelOf(tx, directory).label}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 text-[13px] font-medium tabular-nums",
              tx.amount < 0 ? "text-ink" : "text-emerald-600",
            )}
          >
            {tx.amount > 0 ? "+" : ""}
            {formatAmount(tx.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RankedList({
  rows,
  empty,
  hrefOf,
  subOf,
}: {
  rows: RankedRow[];
  empty: string;
  hrefOf?: (row: RankedRow) => string | null;
  subOf?: (row: RankedRow) => string;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-[12px] text-ink-muted sm:px-6">{empty}</p>;
  }
  // Bars against the LARGEST row, not the total: one dominant row would otherwise render every
  // other bar as a single pixel.
  const largest = Math.max(...rows.map((row) => row.credits), 1);
  return (
    <ul className="flex flex-col gap-1.5 px-4 pb-5 pt-3.5 sm:px-5">
      {rows.map((row) => {
        const href = hrefOf?.(row) ?? null;
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[13px] text-ink">
                {row.label}
                {subOf ? (
                  <span className="block truncate text-[11px] text-ink-muted">{subOf(row)}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-[13px] tabular-nums text-ink">
                {formatAmount(Math.round(row.credits))}
              </span>
            </div>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-surface-4">
              <div
                className="h-full rounded-full bg-[var(--primary)]"
                style={{ width: `${Math.max(2, (row.credits / largest) * 100)}%` }}
              />
            </div>
          </>
        );
        return (
          <li key={row.key}>
            {href ? (
              <Link
                href={href}
                className="block rounded-[8px] bg-surface-2 px-2.5 py-2 hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              >
                {body}
              </Link>
            ) : (
              <div className="rounded-[8px] bg-surface-2 px-2.5 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
