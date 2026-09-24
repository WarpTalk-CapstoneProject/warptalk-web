"use client";

/** How the CMS describes an announcement's audience and window, on its card and in its editor. */

import { useTranslations } from "next-intl";

import { useCmsDateFormatter } from "@/components/admin/cms/cms-shared";
import type { AdminAnnouncementCmsDto } from "@/types/admin-cms";

export function AudienceLine({ announcement }: { announcement: AdminAnnouncementCmsDto }) {
  const t = useTranslations("adminCms.announcements.audience");
  if (announcement.audienceMode === "PLANS") {
    return <>{t("plans", { plans: announcement.audiencePlanSlugs.join(", ") })}</>;
  }
  if (announcement.audienceMode === "WORKSPACES") {
    return <>{t("workspaces", { count: announcement.audienceWorkspaceIds.length })}</>;
  }
  return <>{t("all")}</>;
}

export function WindowLine({ announcement }: { announcement: AdminAnnouncementCmsDto }) {
  const t = useTranslations("adminCms.announcements.window");
  const formatDate = useCmsDateFormatter();
  const start = announcement.startsAt ?? announcement.publishedAt;
  switch (announcement.effectiveStatus) {
    case "SCHEDULED":
      return <>{t("scheduled", { date: formatDate(announcement.startsAt) })}</>;
    case "PUBLISHED":
      return announcement.endsAt ? (
        <>{t("liveUntil", { date: formatDate(announcement.endsAt) })}</>
      ) : (
        <>{t("liveSince", { date: formatDate(start) })}</>
      );
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
