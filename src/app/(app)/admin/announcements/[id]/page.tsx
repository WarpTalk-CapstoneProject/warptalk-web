"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowsClockwise,
  Copy,
  Megaphone,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import { useAdminAnnouncement } from "@/hooks/use-admin-announcements";
import { useAdminUserDetail } from "@/hooks/use-admin-users";
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import {
  announcementDeliveredCount,
  announcementStatusClasses,
} from "@/lib/notifications/announcement-status";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("en-US");
/** Recipient ids shown before "Show all". A list can carry up to 1,000. */
const RECIPIENT_PREVIEW = 12;

function formatWhen(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

/**
 * The server stores audience and payload as JSON serialized into a string column and returns the
 * string as-is. A row written by hand, or before a field existed, may not parse; the page shows
 * the raw text rather than failing.
 */
function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

async function copyText(
  value: string,
  label: string,
  t: (key: string, values?: Record<string, string>) => string,
) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(t("toasts.copied", { label }));
  } catch {
    toast.error(t("toasts.copyFailed", { label: label.toLowerCase() }));
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-hairline/60 px-4 py-3 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-[13px] text-ink">{children}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 text-[13px] font-semibold text-ink">{children}</h2>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-subtle">{children}</span>;
}

export default function AdminAnnouncementDetailPage() {
  const t = useTranslations("adminAnnouncements.detail");
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : undefined;
  const detailQuery = useAdminAnnouncement(id);
  const announcement = detailQuery.data;
  const authorQuery = useAdminUserDetail(announcement?.createdBy);
  const [showAllRecipients, setShowAllRecipients] = useState(false);

  const audience = useMemo(
    () => parseJsonObject(announcement?.targetAudienceData),
    [announcement?.targetAudienceData],
  );
  const payload = useMemo(() => parseJsonObject(announcement?.payload), [announcement?.payload]);

  const recipientIds = Array.isArray(audience?.userIds)
    ? (audience.userIds as unknown[]).filter((value): value is string => typeof value === "string")
    : [];
  const segmentId = asString(audience?.segmentId);
  const visibleRecipients = showAllRecipients
    ? recipientIds
    : recipientIds.slice(0, RECIPIENT_PREVIEW);

  const backLink = (
    <Link
      href="/admin/announcements"
      className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink"
    >
      <ArrowLeft size={12} />
      {t("back")}
    </Link>
  );

  if (detailQuery.isError) {
    const notFound = apiErrorCode(detailQuery.error) === 404;
    return (
      <AdminPage>
        {backLink}
        <AdminPanel>
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">
                {notFound ? t("notFound.title") : t("loadError.title")}
              </p>
              <p className="mt-1 text-ink-muted">
                {notFound
                  ? t("notFound.description")
                  : getErrorMessage(detailQuery.error, t("loadError.description"))}
              </p>
              {notFound ? null : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void detailQuery.refetch()}
                >
                  {t("retry")}
                </Button>
              )}
            </div>
          </div>
        </AdminPanel>
      </AdminPage>
    );
  }

  if (!announcement) {
    return (
      <AdminPage>
        {backLink}
        <div className="h-6 w-72 animate-pulse rounded bg-surface-2" />
        <div className="mt-6 h-40 animate-pulse rounded-lg bg-surface-1" />
      </AdminPage>
    );
  }

  const author = authorQuery.data?.user;
  const payloadEntries: Array<[string, React.ReactNode]> = [];
  if (payload) {
    const imageUrl = asString(payload.imageUrl);
    const ctaLink = asString(payload.ctaLink);
    const discountCode = asString(payload.discountCode);
    const severity = asString(payload.severity);
    if (imageUrl)
      payloadEntries.push([
        t("payloadFields.image"),
        <a key="image" href={imageUrl} target="_blank" rel="noreferrer" className="break-all underline-offset-2 hover:underline">
          {imageUrl}
        </a>,
      ]);
    if (ctaLink)
      payloadEntries.push([
        t("payloadFields.cta"),
        <a key="cta" href={ctaLink} target="_blank" rel="noreferrer" className="break-all underline-offset-2 hover:underline">
          {ctaLink}
        </a>,
      ]);
    if (discountCode)
      payloadEntries.push([t("payloadFields.discountCode"), <span key="code" className="font-mono">{discountCode}</span>]);
    if (severity) payloadEntries.push([t("payloadFields.severity"), severity]);
    if (typeof payload.actionRequired === "boolean")
      payloadEntries.push([
        t("payloadFields.actionRequired"),
        payload.actionRequired ? t("payloadFields.yes") : t("payloadFields.no"),
      ]);
    if (asString(payload.downtimeStart) || asString(payload.downtimeEnd))
      payloadEntries.push([
        t("payloadFields.downtimeWindow"),
        t("payloadFields.downtimeRange", {
          start: formatWhen(asString(payload.downtimeStart)),
          end: formatWhen(asString(payload.downtimeEnd)),
        }),
      ]);
  }

  return (
    <AdminPage>
      {backLink}
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Megaphone size={14} weight="fill" />}
        title={announcement.title}
        description={t("headerDescription", {
          type: announcement.type,
          date: formatWhen(announcement.createdAt),
        })}
        actions={
          <>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                announcementStatusClasses(announcement.status),
              )}
            >
              {announcement.status}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void detailQuery.refetch()}
              disabled={detailQuery.isFetching}
            >
              <ArrowsClockwise size={14} className={cn(detailQuery.isFetching && "animate-spin")} />
              {t("refresh")}
            </Button>
          </>
        }
      />

      <SectionTitle>{t("sections.message")}</SectionTitle>
      <AdminPanel>
        <p className="whitespace-pre-wrap break-words px-4 py-4 text-[13px] leading-relaxed text-ink">
          {announcement.content}
        </p>
      </AdminPanel>

      <SectionTitle>{t("sections.record")}</SectionTitle>
      <AdminPanel>
        <dl>
          <Field label={t("fields.type")}>
            <span className="font-mono text-[12px]">{announcement.type}</span>
          </Field>
          <Field label={t("fields.status")}>{announcement.status}</Field>
          <Field label={t("fields.sentAt")}>
            {announcement.sentAt ? formatWhen(announcement.sentAt) : <Muted>{t("notSent")}</Muted>}
          </Field>
          <Field label={t("fields.delivered")}>
            {announcementDeliveredCount(announcement) !== null ? (
              t("deliveredCount", { count: announcementDeliveredCount(announcement) ?? 0 })
            ) : (
              <Muted>{t("deliveryUnknown")}</Muted>
            )}
          </Field>
          <Field label={t("fields.author")}>
            {author ? (
              <span>
                {author.fullName || author.email}
                {author.fullName ? <span className="ml-2 text-ink-muted">{author.email}</span> : null}
              </span>
            ) : (
              <span className="font-mono text-[12px]">
                {announcement.createdBy}
                {authorQuery.isPending ? <Muted> {t("resolving")}</Muted> : null}
              </span>
            )}
          </Field>
          <Field label={t("fields.created")}>{formatWhen(announcement.createdAt)}</Field>
          <Field label={t("fields.lastUpdated")}>{formatWhen(announcement.updatedAt)}</Field>
          <Field label={t("fields.announcementId")}>
            <button
              type="button"
              onClick={() => void copyText(announcement.id, t("fields.announcementId"), t)}
              className="inline-flex items-center gap-1.5 break-all text-left font-mono text-[12px] text-ink-muted hover:text-ink"
            >
              {announcement.id}
              <Copy size={12} className="shrink-0" />
            </button>
          </Field>
        </dl>
      </AdminPanel>

      <SectionTitle>{t("sections.audience")}</SectionTitle>
      <AdminPanel>
        <dl>
          <Field label={t("fields.mode")}>
            <span className="font-mono text-[12px]">{announcement.targetAudienceMode}</span>
          </Field>
          {audience === null ? (
            <Field label={t("fields.rawTargeting")}>
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-ink-muted">
                {announcement.targetAudienceData}
              </pre>
            </Field>
          ) : (
            <>
              {segmentId ? (
                <Field label={t("fields.segment")}>
                  <span className="font-mono text-[12px]">{segmentId}</span>
                </Field>
              ) : null}
              <Field label={t("fields.namedRecipients")}>
                {recipientIds.length === 0 ? (
                  <Muted>{t("recipients.none")}</Muted>
                ) : (
                  <div>
                    <p>{t("recipients.count", { count: recipientIds.length })}</p>
                    <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                      {visibleRecipients.map((userId) => (
                        <li key={userId} className="truncate font-mono text-[11px] text-ink-muted" title={userId}>
                          {userId}
                        </li>
                      ))}
                    </ul>
                    {recipientIds.length > RECIPIENT_PREVIEW ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 px-2"
                        onClick={() => setShowAllRecipients((value) => !value)}
                      >
                        {showAllRecipients
                          ? t("recipients.showFewer")
                          : t("recipients.showAll", { count: numberFormatter.format(recipientIds.length) })}
                      </Button>
                    ) : null}
                  </div>
                )}
              </Field>
            </>
          )}
        </dl>
      </AdminPanel>

      <SectionTitle>{t("sections.payload")}</SectionTitle>
      <AdminPanel>
        {payload === null ? (
          <pre className="whitespace-pre-wrap break-all px-4 py-3 font-mono text-[11px] text-ink-muted">
            {announcement.payload}
          </pre>
        ) : payloadEntries.length === 0 ? (
          <p className="px-4 py-4 text-[12px] text-ink-muted">{t("payloadFields.empty")}</p>
        ) : (
          <dl>
            {payloadEntries.map(([label, value]) => (
              <Field key={label} label={label}>
                {value}
              </Field>
            ))}
          </dl>
        )}
      </AdminPanel>

      {/* Stated because a reader will look for them: the record the service returns has no
          sent-at time and no per-recipient delivery counts. */}
      <p className="mt-4 text-[12px] text-ink-muted">{t("footerNote")}</p>
    </AdminPage>
  );
}
