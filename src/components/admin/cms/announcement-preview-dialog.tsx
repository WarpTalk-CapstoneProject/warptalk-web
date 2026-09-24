"use client";

/**
 * "Preview as users will see it": the strip that runs across the top of the app, and the card
 * that opens from its "Read more" — both drawn by the same components the app itself uses.
 */

import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react/dist/ssr";

import {
  AnnouncementCardView,
  AnnouncementCta,
  AnnouncementTypePill,
  type AnnouncementViewModel,
} from "@/components/announcements/announcement-card-view";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { typeAccent } from "@/lib/announcements/announcement-cms";
import { cn } from "@/lib/utils";

/** The app's announcement strip, static — no pager, no dismissal. */
export function AnnouncementStripPreview({ announcement }: { announcement: AnnouncementViewModel }) {
  const t = useTranslations("common.announcements");
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-surface-1 py-2 pl-4 pr-2">
      <span className={cn("absolute inset-y-0 left-0 w-1", typeAccent(announcement.type))} aria-hidden />
      <AnnouncementTypePill type={announcement.type} className="shrink-0" />
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
        {announcement.title || "—"}
      </p>
      <span className="shrink-0 px-2 text-[12px] text-ink-muted">{t("readMore")}</span>
      {announcement.ctaLabel && announcement.ctaUrl ? (
        <span className="pointer-events-none shrink-0">
          <AnnouncementCta label={announcement.ctaLabel} url={announcement.ctaUrl} />
        </span>
      ) : null}
      <X size={14} className="shrink-0 text-ink-subtle" aria-hidden />
    </div>
  );
}

export function AnnouncementUserPreview({ announcement }: { announcement: AnnouncementViewModel }) {
  const t = useTranslations("adminCms.announcements.preview");
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-subtle">{t("strip")}</p>
        <AnnouncementStripPreview announcement={announcement} />
      </div>
      <div>
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-subtle">{t("card")}</p>
        <div className="pointer-events-none">
          <AnnouncementCardView announcement={announcement} />
        </div>
      </div>
    </div>
  );
}

export function AnnouncementPreviewDialog({
  announcement,
  onClose,
}: {
  announcement: AnnouncementViewModel | null;
  onClose: () => void;
}) {
  const t = useTranslations("adminCms.announcements.preview");
  return (
    <Dialog open={Boolean(announcement)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {announcement ? <AnnouncementUserPreview announcement={announcement} /> : null}
      </DialogContent>
    </Dialog>
  );
}
