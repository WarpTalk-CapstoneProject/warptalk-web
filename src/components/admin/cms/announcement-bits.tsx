"use client";

/** How the CMS describes an announcement — its audience, window, type and placement — on its card and in its editor. */

import { useTranslations } from "next-intl";

import { useCmsDateFormatter } from "@/components/admin/cms/cms-shared";
import { AnnouncementIcon } from "@/components/announcements/announcement-surfaces";
import { colorTokens, iconFor } from "@/lib/announcements/announcement-cms";
import { cn } from "@/lib/utils";
import type { AdminAnnouncementCmsDto } from "@/types/admin-cms";

const KNOWN_TYPES = ["ANNOUNCEMENT", "FEATURE", "MAINTENANCE", "PROMOTION"];
const KNOWN_PLACEMENTS = ["TOP_BANNER", "MODAL", "TOAST", "NOTIFICATION_CENTER", "DASHBOARD_CARD"];

export function AudienceLine({ announcement }: { announcement: AdminAnnouncementCmsDto }) {
  const t = useTranslations("adminCms.announcements.audience");
  const parts: string[] = [];
  if (announcement.audienceMode === "PLANS") parts.push(t("plans", { plans: announcement.audiencePlanSlugs.join(", ") }));
  else if (announcement.audienceMode === "WORKSPACES") parts.push(t("workspaces", { count: announcement.audienceWorkspaceIds.length }));
  else parts.push(t("all"));
  if (announcement.targetRoles.length) parts.push(t("roles", { roles: announcement.targetRoles.join(", ") }));
  if (announcement.targetLocales.length) parts.push(t("locales", { locales: announcement.targetLocales.map((code) => code.toUpperCase()).join(", ") }));
  if (announcement.newUsersWithinDays) parts.push(t("newUsers", { days: announcement.newUsersWithinDays }));
  return <>{parts.join(" · ")}</>;
}

export function WindowLine({ announcement }: { announcement: AdminAnnouncementCmsDto }) {
  const t = useTranslations("adminCms.announcements.window");
  const formatDate = useCmsDateFormatter();
  const start = announcement.startsAt ?? announcement.publishedAt;
  switch (announcement.effectiveStatus) {
    case "SCHEDULED":
      return <>{t("scheduled", { date: formatDate(announcement.startsAt) })}</>;
    case "PUBLISHED":
      return announcement.endsAt ? <>{t("liveUntil", { date: formatDate(announcement.endsAt) })}</> : <>{t("liveSince", { date: formatDate(start) })}</>;
    case "ENDED":
      return <>{t("ended", { date: formatDate(announcement.endsAt) })}</>;
    case "ARCHIVED":
      return <>{t("archived", { date: formatDate(announcement.archivedAt) })}</>;
    default:
      return announcement.startsAt || announcement.endsAt ? (
        <>
          {t("draftWindow", {
            start: announcement.startsAt ? formatDate(announcement.startsAt) : t("onPublish"),
            end: announcement.endsAt ? formatDate(announcement.endsAt) : t("noEnd"),
          })}
        </>
      ) : (
        <>{t("notPublished")}</>
      );
  }
}

export function AnnouncementTypePill({ type, className }: { type: string; className?: string }) {
  const t = useTranslations("common.announcements.types");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted",
        className,
      )}
    >
      <AnnouncementIcon name={iconFor(type, null)} size={11} />
      {KNOWN_TYPES.includes(type) ? t(type as "ANNOUNCEMENT") : type}
    </span>
  );
}

export function PlacementLabel({ placement }: { placement: string }) {
  const t = useTranslations("adminCms.announcements.preview.placements");
  return <>{KNOWN_PLACEMENTS.includes(placement) ? t(placement as "TOP_BANNER") : placement}</>;
}

/** The announcement's own icon, tinted with its accent: the card's visual key. */
export function AnnouncementSwatch({ announcement }: { announcement: AdminAnnouncementCmsDto }) {
  const tokens = colorTokens(announcement.accentColor);
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tokens.subtle, tokens.text)}>
      <AnnouncementIcon name={iconFor(announcement.type, announcement.icon)} size={18} />
    </span>
  );
}
