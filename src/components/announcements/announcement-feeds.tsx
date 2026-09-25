"use client";

/**
 * The two in-page placements: cards pinned to the top of the bell panel, and cards on the
 * workspace home. Same query as the shell's banner/modal/toast host (announcement-host.tsx), so
 * a dismissal anywhere closes it everywhere.
 */

import { useTranslations } from "next-intl";

import { useImpression } from "@/components/announcements/announcement-host";
import {
  DashboardCardSurface,
  NotificationCardSurface,
  type AnnouncementViewModel,
} from "@/components/announcements/announcement-surfaces";
import {
  useActiveAnnouncements,
  useAnnouncementActions,
  useHiddenAnnouncementIds,
} from "@/hooks/use-announcements";
import { visibleNow } from "@/lib/announcements/viewer-placements";
import type { ViewerAnnouncementDto } from "@/types/admin-cms";

/** How many notification-centre announcements are live — the bell shows a dot for them. */
export function useNotificationCenterAnnouncementCount(): number {
  const query = useActiveAnnouncements(true);
  const hidden = useHiddenAnnouncementIds();
  return visibleNow(query.data ?? [], hidden).notificationCenter.length;
}

export function NotificationCenterAnnouncements() {
  const t = useTranslations("common.announcements");
  const query = useActiveAnnouncements(true);
  const hidden = useHiddenAnnouncementIds();
  const items = visibleNow(query.data ?? [], hidden).notificationCenter;
  if (items.length === 0) return null;
  return (
    <section aria-label={t("regionLabel")} className="space-y-1 px-1 pb-1 pt-1">
      {items.map((announcement) => (
        <NotificationCard key={announcement.id} announcement={announcement} />
      ))}
    </section>
  );
}

function NotificationCard({ announcement }: { announcement: ViewerAnnouncementDto }) {
  const { close, clicked } = useAnnouncementActions();
  useImpression(announcement.id);
  return (
    <NotificationCardSurface
      announcement={announcement as AnnouncementViewModel}
      onClose={announcement.dismissible ? () => close(announcement) : undefined}
      onCta={(secondary) => clicked(announcement.id, secondary)}
    />
  );
}

export function DashboardAnnouncements() {
  const t = useTranslations("common.announcements");
  const query = useActiveAnnouncements(true);
  const hidden = useHiddenAnnouncementIds();
  const items = visibleNow(query.data ?? [], hidden).dashboard;
  if (items.length === 0) return null;
  return (
    <section aria-label={t("regionLabel")} className="grid gap-3 lg:grid-cols-2">
      {items.map((announcement) => (
        <DashboardCard key={announcement.id} announcement={announcement} />
      ))}
    </section>
  );
}

function DashboardCard({ announcement }: { announcement: ViewerAnnouncementDto }) {
  const { close, clicked } = useAnnouncementActions();
  useImpression(announcement.id);
  return (
    <DashboardCardSurface
      announcement={announcement as AnnouncementViewModel}
      onClose={announcement.dismissible ? () => close(announcement) : undefined}
      onCta={(secondary) => clicked(announcement.id, secondary)}
    />
  );
}
