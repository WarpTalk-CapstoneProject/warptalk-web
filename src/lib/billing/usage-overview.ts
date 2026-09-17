/**
 * The data shaping behind the Usage page: spend per day per service, per member and per meeting,
 * the service cards, and the CSV export. Pure, so every figure the page prints is tested here and
 * the page only lays numbers out.
 *
 * EVERY FIGURE STARTS FROM THE SAME LEDGER
 *   The cycle's credit transactions (paged in full — WT-430) are the one source for the chart, the
 *   settlement and meeting counts, the member and meeting lists and the per-service series. They
 *   are filtered by member BEFORE any of those are computed, so choosing a member changes every
 *   number at once and none of them can disagree with the others.
 *
 * SPEND IS A SIGN, NOT A TYPE
 *   Same rule as `cycle-activity`: a negative amount is credits leaving the workspace. A negative
 *   adjustment is spend and is charted (as "Credit adjustments") so the chart's total is the same
 *   "Credits spent" the burn-up maths computes; it is not an AI service and gets no service card.
 *
 * MEETINGS ARE MATCHED BY TIME, BECAUSE THE LEDGER CARRIES NO ROOM
 *   The settlement worker writes `reference_type = 'translation_content' | 'audio_dubbing'` and
 *   `reference_id = TranscriptSegment.Id` (warptalk-ai billing_worker/worker.py). The room id goes
 *   into `usage_records.translation_room_id`, which no web-facing endpoint returns. So a charge is
 *   attributed to the meeting that was running when it was settled — see `matchMeeting` — and the
 *   two cases that rule cannot decide are reported as themselves rather than guessed.
 */

import type { CreditTransactionDto } from "@/types/billing";

import { chargeTypeFromDescription, usageServiceOf, type UsageService } from "./usage-labels.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type OverviewBucketSize = "day" | "week";

/* ------------------------------------------------------------------------------------------------
 * Members
 * ---------------------------------------------------------------------------------------------- */

export interface UsageMemberLike {
  userId: string;
  fullName?: string | null;
  email?: string | null;
}

/** The filter key for a transaction's member. System rows with no user share one key. */
export const UNKNOWN_MEMBER_KEY = "unknown";

export function memberKeyOf(tx: Pick<CreditTransactionDto, "userId">): string {
  return tx.userId || UNKNOWN_MEMBER_KEY;
}

/**
 * Who a transaction belongs to, as a name.
 *
 * `userName` first, but it is null on the workspace history endpoint today (`CreditMapper.ToDto`
 * passes null), so the member directory is what actually names people. A user id nobody in the
 * directory has is somebody who left — their credits were still spent. No user id at all is a
 * system row.
 */
export function memberLabelOf(
  tx: Pick<CreditTransactionDto, "userId" | "userName">,
  directory: ReadonlyMap<string, UsageMemberLike>,
): { label: string; isFormer: boolean } {
  if (tx.userName) return { label: tx.userName, isFormer: false };
  if (!tx.userId) return { label: "Unknown", isFormer: false };
  const member = directory.get(tx.userId);
  if (member) return { label: member.fullName || member.email || "Member", isFormer: false };
  return { label: "Former member", isFormer: true };
}

export function memberDirectory(members: readonly UsageMemberLike[]): Map<string, UsageMemberLike> {
  return new Map(members.map((member) => [member.userId, member]));
}

export function filterByMember<T extends Pick<CreditTransactionDto, "userId">>(
  transactions: readonly T[],
  memberKey: string | null,
): T[] {
  if (!memberKey) return [...transactions];
  return transactions.filter((tx) => memberKeyOf(tx) === memberKey);
}

/* ------------------------------------------------------------------------------------------------
 * Services
 * ---------------------------------------------------------------------------------------------- */

export const ADJUSTMENT_SERVICE: UsageService = {
  key: "adjustment",
  label: "Credit adjustments",
  known: true,
};

export function isSpend(tx: Pick<CreditTransactionDto, "amount">): boolean {
  return tx.amount < 0;
}

/** The service a spend was billed under, from the settlement's "Aggregated <charge_type>" line. */
export function serviceOfTransaction(
  tx: Pick<CreditTransactionDto, "type" | "description">,
): UsageService {
  const chargeType = chargeTypeFromDescription(tx.description);
  if (chargeType) return usageServiceOf(chargeType);
  if (tx.type === "consume") return usageServiceOf(null);
  return ADJUSTMENT_SERVICE;
}

/* ------------------------------------------------------------------------------------------------
 * Meetings
 * ---------------------------------------------------------------------------------------------- */

export interface MeetingWindowLike {
  id: string;
  title?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
}

/**
 * How long after a meeting ends a settlement can still belong to it. Billing trails the audio —
 * dubbing is chunked in seconds and the worker reads a stream — so the last charges of a meeting
 * are written after `endedAt`. Five minutes covers that without reaching the next meeting in most
 * calendars; when it does reach one, the strict window below wins.
 */
export const MEETING_SETTLEMENT_GRACE_MS = 5 * 60 * 1000;

export type MeetingMatch =
  | { kind: "meeting"; id: string }
  | { kind: "overlap" }
  | { kind: "unmatched" };

/** Reference types that name a room directly. None of the live writers use one; old rows might. */
const ROOM_REFERENCE = /^(translation_?room|room|meeting|meeting_?room)$/i;

function windowOf(room: MeetingWindowLike, now: number): [number, number] | null {
  const start = room.startedAt ? new Date(room.startedAt).getTime() : Number.NaN;
  if (!Number.isFinite(start)) return null;
  const end = room.endedAt ? new Date(room.endedAt).getTime() : now;
  return [start, Number.isFinite(end) ? end : now];
}

/**
 * The meeting a charge belongs to.
 *
 * 1. A room-typed reference is exact and wins.
 * 2. Otherwise the meeting whose [started, ended] contains the settlement time.
 * 3. Otherwise the meeting that ended within the grace period before it.
 *
 * Two candidates at the same step is `overlap`: two meetings were running and the ledger cannot
 * say which one spoke. Splitting the charge or picking one would print a number nobody measured.
 * No candidate is `unmatched` — typically a post-meeting translation backfill.
 */
export function matchMeeting(
  tx: Pick<CreditTransactionDto, "createdAt" | "referenceId" | "referenceType">,
  rooms: readonly MeetingWindowLike[],
  now: number,
): MeetingMatch {
  if (tx.referenceId && tx.referenceType && ROOM_REFERENCE.test(tx.referenceType)) {
    return { kind: "meeting", id: tx.referenceId };
  }

  const at = new Date(tx.createdAt).getTime();
  if (!Number.isFinite(at)) return { kind: "unmatched" };

  const strict: string[] = [];
  const grace: string[] = [];
  for (const room of rooms) {
    const window = windowOf(room, now);
    if (!window) continue;
    const [start, end] = window;
    if (at >= start && at <= end) strict.push(room.id);
    else if (at > end && at <= end + MEETING_SETTLEMENT_GRACE_MS) grace.push(room.id);
  }

  const candidates = strict.length > 0 ? strict : grace;
  if (candidates.length === 1) return { kind: "meeting", id: candidates[0] };
  if (candidates.length > 1) return { kind: "overlap" };
  return { kind: "unmatched" };
}

/** Every consume transaction's meeting, keyed by transaction id. Other rows are not attributed. */
export function attributeMeetings(
  transactions: readonly CreditTransactionDto[],
  rooms: readonly MeetingWindowLike[],
  now: number,
): Map<string, MeetingMatch> {
  const result = new Map<string, MeetingMatch>();
  for (const tx of transactions) {
    if (tx.type !== "consume") continue;
    result.set(tx.id, matchMeeting(tx, rooms, now));
  }
  return result;
}

/* ------------------------------------------------------------------------------------------------
 * Buckets
 * ---------------------------------------------------------------------------------------------- */

export interface ServiceBucket {
  /** Local midnight at the start of the bucket. */
  start: Date;
  /** Credits spent in the bucket, all services. */
  total: number;
  /** Credits spent per service key. */
  byService: Record<string, number>;
  /** Consume transactions settled in the bucket. */
  settlements: number;
  /** Distinct meetings with at least one charge in the bucket. */
  meetings: number;
}

export interface RankedService extends UsageService {
  credits: number;
  settlements: number;
}

export interface SpendByService {
  buckets: ServiceBucket[];
  bucketSize: OverviewBucketSize;
  /** Every service that spent this cycle, largest first. */
  services: RankedService[];
  total: number;
  settlements: number;
  /** Distinct meetings billed over the whole window. */
  meetings: number;
  /** Credits per elapsed bucket. */
  averagePerBucket: number;
  /** The bucket that spent most, or null when nothing was spent. */
  busiest: ServiceBucket | null;
}

export interface SpendByServiceInput {
  transactions: readonly CreditTransactionDto[];
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Spend per day (or week) stacked by service, over the buckets of this cycle that have started.
 *
 * Bucket arithmetic is `summariseCycleActivity`'s: the first bucket opens on the cycle's first
 * LOCAL day, the series stops at the bucket containing `now` (never padded with future zeroes),
 * and the bucket array is the cycle filter — a transaction outside it is not this cycle's.
 */
export function summariseSpendByService(
  input: SpendByServiceInput,
  now: number,
  bucketSize: OverviewBucketSize,
  meetingOf?: ReadonlyMap<string, MeetingMatch>,
): SpendByService | null {
  const start = new Date(input.currentPeriodStart).getTime();
  const end = new Date(input.currentPeriodEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const span = (bucketSize === "week" ? 7 : 1) * MS_PER_DAY;
  const first = startOfLocalDay(start);
  const elapsed = Math.floor((now - first) / span) + 1;
  const inCycle = Math.ceil((end - first) / span);
  const count = Math.max(1, Math.min(elapsed, inCycle));

  const buckets: ServiceBucket[] = Array.from({ length: count }, (_, index) => ({
    start: new Date(first + index * span),
    total: 0,
    byService: {},
    settlements: 0,
    meetings: 0,
  }));
  const meetingsPerBucket = buckets.map(() => new Set<string>());
  const allMeetings = new Set<string>();
  const services = new Map<string, RankedService>();

  for (const tx of input.transactions) {
    const at = new Date(tx.createdAt).getTime();
    if (!Number.isFinite(at)) continue;
    const index = Math.floor((at - first) / span);
    const bucket = buckets[index];
    if (!bucket) continue;

    if (tx.type === "consume") {
      bucket.settlements += 1;
      const match = meetingOf?.get(tx.id);
      if (match?.kind === "meeting") {
        meetingsPerBucket[index].add(match.id);
        allMeetings.add(match.id);
      }
    }

    if (!isSpend(tx)) continue;
    const credits = -tx.amount;
    const service = serviceOfTransaction(tx);
    bucket.total += credits;
    bucket.byService[service.key] = (bucket.byService[service.key] ?? 0) + credits;

    const ranked = services.get(service.key) ?? { ...service, credits: 0, settlements: 0 };
    ranked.credits += credits;
    if (tx.type === "consume") ranked.settlements += 1;
    services.set(service.key, ranked);
  }

  buckets.forEach((bucket, index) => {
    bucket.meetings = meetingsPerBucket[index].size;
  });

  const total = buckets.reduce((sum, b) => sum + b.total, 0);
  const busiest = buckets.reduce<ServiceBucket | null>(
    (best, b) => (b.total > 0 && (!best || b.total > best.total) ? b : best),
    null,
  );

  return {
    buckets,
    bucketSize,
    services: [...services.values()].sort((a, b) => b.credits - a.credits),
    total,
    settlements: buckets.reduce((sum, b) => sum + b.settlements, 0),
    meetings: allMeetings.size,
    averagePerBucket: total / buckets.length,
    busiest,
  };
}

/** How far through the cycle `now` is, 0–1. Where an even spend would have reached today. */
export function cycleElapsedFraction(
  currentPeriodStart: string,
  currentPeriodEnd: string,
  now: number,
): number {
  const start = new Date(currentPeriodStart).getTime();
  const end = new Date(currentPeriodEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/* ------------------------------------------------------------------------------------------------
 * Chart scale
 * ---------------------------------------------------------------------------------------------- */

/** A top of scale that divides into four readable gridlines (the burn-up chart's rule). */
export function niceAxisMax(peak: number): number {
  const rawStep = (peak * 1.1) / 4;
  if (!(rawStep > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 4 ? 4 : normalised <= 5 ? 5 : 10) *
    magnitude;
  return step * 4;
}

/** A bar this many times taller than the next tallest is drawn broken rather than to scale. */
export const OUTLIER_RATIO = 4;

/**
 * The y axis for a bar chart whose real data is often one enormous day.
 *
 * The demo workspace put 2,100,998 of 2,106,183 credits through a single day. To scale, that is one
 * bar and a row of invisible ones — which is why the page once replaced its bar chart with a burn-up.
 * Instead the axis is scaled to the SECOND tallest bar and the outlier is drawn clipped at the top
 * with its value printed, so every other day stays readable and the outlier still says how big it
 * is. `clipped` lists the indexes that overflow the axis.
 */
export function stackedChartScale(totals: readonly number[]): { max: number; clipped: number[] } {
  const positive = totals.filter((t) => t > 0).sort((a, b) => b - a);
  if (positive.length === 0) return { max: 1, clipped: [] };
  const [peak, second] = positive;
  if (second === undefined || peak <= OUTLIER_RATIO * second) {
    return { max: niceAxisMax(peak), clipped: [] };
  }
  const max = niceAxisMax(second * 1.5);
  const clipped = totals.flatMap((t, index) => (t > max ? [index] : []));
  return { max, clipped };
}

/* ------------------------------------------------------------------------------------------------
 * Colours
 * ---------------------------------------------------------------------------------------------- */

/** Distinct service colours available (`--usage-service-1` … `-5`). */
export const SERVICE_COLOR_SLOTS = 5;

/**
 * A colour slot per service: 1–5 for the largest five, 0 ("Other") for the rest. Ranked on the
 * unfiltered workspace so a service keeps its colour when a member is picked.
 */
export function serviceColorSlots(services: readonly { key: string }[]): Map<string, number> {
  const slots = new Map<string, number>();
  services.forEach((service, index) => {
    slots.set(service.key, index < SERVICE_COLOR_SLOTS ? index + 1 : 0);
  });
  return slots;
}

/* ------------------------------------------------------------------------------------------------
 * Service cards
 * ---------------------------------------------------------------------------------------------- */

export interface BreakdownRowLike {
  usageType: string;
  usageCount: number;
  totalCreditsConsumed: number;
}

export interface ServiceCard extends UsageService {
  credits: number;
  uses: number;
  /** Credits per use; null when there were no uses — never 0, which would read as free. */
  creditsPerUse: number | null;
  /** Credits per bucket, aligned with the chart's buckets. */
  series: number[];
}

/**
 * One card per AI service.
 *
 * Totals and uses come from the breakdown endpoint when it applies (all members): it counts usage
 * records, the unit a "use" is. With a member picked the breakdown cannot be filtered, so the
 * ledger answers instead — each settlement writes exactly one usage record and one transaction,
 * so a consume row IS a use. The per-day series always comes from the ledger.
 *
 * A service present in only one source still gets a card; credit adjustments never do.
 */
export function buildServiceCards(
  spend: SpendByService,
  breakdown: readonly BreakdownRowLike[] | null,
): ServiceCard[] {
  const cards = new Map<string, ServiceCard>();

  for (const service of spend.services) {
    if (service.key === ADJUSTMENT_SERVICE.key) continue;
    cards.set(service.key, {
      key: service.key,
      label: service.label,
      known: service.known,
      credits: service.credits,
      uses: service.settlements,
      creditsPerUse: null,
      series: spend.buckets.map((b) => b.byService[service.key] ?? 0),
    });
  }

  if (breakdown) {
    const folded = new Map<string, { service: UsageService; credits: number; uses: number }>();
    for (const row of breakdown) {
      const service = usageServiceOf(row.usageType);
      const entry = folded.get(service.key) ?? { service, credits: 0, uses: 0 };
      entry.credits += row.totalCreditsConsumed;
      entry.uses += row.usageCount;
      folded.set(service.key, entry);
    }
    for (const { service, credits, uses } of folded.values()) {
      const card = cards.get(service.key) ?? {
        ...service,
        credits: 0,
        uses: 0,
        creditsPerUse: null,
        series: spend.buckets.map(() => 0),
      };
      card.credits = credits;
      card.uses = uses;
      cards.set(service.key, card);
    }
  }

  return [...cards.values()]
    .filter((card) => card.credits > 0 || card.uses > 0)
    .map((card) => ({ ...card, creditsPerUse: card.uses > 0 ? card.credits / card.uses : null }))
    .sort((a, b) => b.credits - a.credits);
}

/* ------------------------------------------------------------------------------------------------
 * Ranked lists
 * ---------------------------------------------------------------------------------------------- */

export interface RankedRow {
  key: string;
  label: string;
  credits: number;
  /** Consume transactions behind the row. */
  settlements: number;
  /** Earliest charge, for a meeting's date line. */
  firstAt: number;
  /** Set for a real meeting row; absent for members and for the overlap/unmatched rows. */
  meetingId?: string;
  isFormer?: boolean;
}

export function rankMembers(
  transactions: readonly CreditTransactionDto[],
  directory: ReadonlyMap<string, UsageMemberLike>,
): RankedRow[] {
  const rows = new Map<string, RankedRow>();
  for (const tx of transactions) {
    if (!isSpend(tx)) continue;
    const key = memberKeyOf(tx);
    const at = new Date(tx.createdAt).getTime();
    const row =
      rows.get(key) ??
      (() => {
        const { label, isFormer } = memberLabelOf(tx, directory);
        return { key, label, isFormer, credits: 0, settlements: 0, firstAt: at };
      })();
    row.credits += -tx.amount;
    if (tx.type === "consume") row.settlements += 1;
    if (at < row.firstAt) row.firstAt = at;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.credits - a.credits);
}

export const OVERLAP_ROW_KEY = "meeting:overlap";
export const UNMATCHED_ROW_KEY = "meeting:unmatched";

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** A meeting's name, or "Meeting · Sep 9" when its room is not in the loaded history. */
export function meetingLabel(title: string | null | undefined, firstAt: number): string {
  const trimmed = title?.trim();
  if (trimmed) return trimmed;
  return Number.isFinite(firstAt) ? `Meeting · ${SHORT_DATE.format(firstAt)}` : "Meeting";
}

/**
 * Credits per meeting, largest first, followed by the charges no single meeting can claim. Those
 * two rows are kept so the list still sums to what was spent on consume transactions.
 */
export function rankMeetings(
  transactions: readonly CreditTransactionDto[],
  attribution: ReadonlyMap<string, MeetingMatch>,
  rooms: readonly MeetingWindowLike[],
): RankedRow[] {
  const titles = new Map(rooms.map((room) => [room.id, room.title ?? null]));
  const rows = new Map<string, RankedRow>();

  for (const tx of transactions) {
    if (tx.type !== "consume" || !isSpend(tx)) continue;
    const match = attribution.get(tx.id) ?? { kind: "unmatched" as const };
    const key =
      match.kind === "meeting"
        ? `meeting:${match.id}`
        : match.kind === "overlap"
          ? OVERLAP_ROW_KEY
          : UNMATCHED_ROW_KEY;
    const at = new Date(tx.createdAt).getTime();
    const row = rows.get(key) ?? {
      key,
      label: "",
      credits: 0,
      settlements: 0,
      firstAt: at,
      meetingId: match.kind === "meeting" ? match.id : undefined,
    };
    row.credits += -tx.amount;
    row.settlements += 1;
    if (at < row.firstAt) row.firstAt = at;
    rows.set(key, row);
  }

  const meetings: RankedRow[] = [];
  const leftovers: RankedRow[] = [];
  for (const row of rows.values()) {
    if (row.meetingId) {
      meetings.push({ ...row, label: meetingLabel(titles.get(row.meetingId), row.firstAt) });
    } else if (row.key === OVERLAP_ROW_KEY) {
      leftovers.push({ ...row, label: "During overlapping meetings" });
    } else {
      leftovers.push({ ...row, label: "Not matched to a meeting" });
    }
  }

  meetings.sort((a, b) => b.credits - a.credits);
  leftovers.sort((a, b) => (a.key === OVERLAP_ROW_KEY ? -1 : b.key === OVERLAP_ROW_KEY ? 1 : 0));
  return [...meetings, ...leftovers];
}

/* ------------------------------------------------------------------------------------------------
 * Top-ups & adjustments
 * ---------------------------------------------------------------------------------------------- */

/** Everything that is not an ordinary settlement — top-ups, refunds, adjustments — newest first. */
export function creditMovements(transactions: readonly CreditTransactionDto[]): CreditTransactionDto[] {
  return transactions
    .filter((tx) => tx.type !== "consume" || tx.amount > 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function movementLabel(tx: Pick<CreditTransactionDto, "type" | "amount">): string {
  const type = String(tx.type);
  if (type === "top_up") return "Top-up";
  if (type === "refund") return "Refund";
  if (type === "adjustment") return tx.amount < 0 ? "Adjustment (debit)" : "Adjustment";
  if (type === "consume") return "Credit returned";
  return type.replace(/_/g, " ");
}

/* ------------------------------------------------------------------------------------------------
 * CSV export
 * ---------------------------------------------------------------------------------------------- */

export const USAGE_CSV_HEADER = [
  "Date",
  "Member",
  "Service",
  "Meeting / reference",
  "Credits",
  "Balance after",
] as const;

export interface UsageCsvContext {
  directory: ReadonlyMap<string, UsageMemberLike>;
  attribution: ReadonlyMap<string, MeetingMatch>;
  rooms: readonly MeetingWindowLike[];
}

/** One row per transaction, oldest first, credits signed as the ledger stores them. */
export function buildUsageCsvRows(
  transactions: readonly CreditTransactionDto[],
  context: UsageCsvContext,
): (string | number)[][] {
  const titles = new Map(context.rooms.map((room) => [room.id, room.title ?? null]));
  const ordered = [...transactions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const rows = ordered.map((tx) => {
    const at = new Date(tx.createdAt).getTime();
    const match = context.attribution.get(tx.id);
    const reference =
      match?.kind === "meeting"
        ? meetingLabel(titles.get(match.id), at)
        : match?.kind === "overlap"
          ? "During overlapping meetings"
          : [tx.referenceType, tx.referenceId].filter(Boolean).join(" ");
    const service =
      tx.type === "consume" && tx.amount < 0 ? serviceOfTransaction(tx).label : movementLabel(tx);
    return [
      Number.isFinite(at) ? new Date(at).toISOString() : tx.createdAt,
      memberLabelOf(tx, context.directory).label,
      service,
      reference,
      tx.amount,
      tx.balanceAfter,
    ];
  });

  return [[...USAGE_CSV_HEADER], ...rows];
}

/**
 * RFC 4180 text. A text cell that starts like a formula is prefixed with an apostrophe, because a
 * meeting title is user input and this file is opened in a spreadsheet. Numbers are left alone —
 * a debit is legitimately "-2".
 */
export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  const cell = (value: string | number) => {
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
