"use client";

/**
 * Published announcements, shown to the people they are for.
 *
 * A slim strip across the top of the content column: the newest live announcement's title and
 * button, a pager when there are several, "Read more" for the full markdown body, and a close
 * button that dismisses it for this person on the server (so it stays closed on every device).
 *
 * The server does all the deciding — the window, the audience (everyone, some plans, some
 * workspaces) and the dismissals — so this renders whatever GET /notifications/announcements
 * returns, in order, and nothing else.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react/dist/ssr";

import {
  AnnouncementCardView,
  AnnouncementCta,
  AnnouncementTypePill,
} from "@/components/announcements/announcement-card-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useActiveAnnouncements, useDismissAnnouncement } from "@/hooks/use-announcements";
import { typeAccent } from "@/lib/announcements/announcement-cms";
import { cn } from "@/lib/utils";

export function AnnouncementBanner({ enabled }: { enabled: boolean }) {
  const t = useTranslations("common.announcements");
  const query = useActiveAnnouncements(enabled);
  const dismiss = useDismissAnnouncement();
  const [index, setIndex] = useState(0);
  const [reading, setReading] = useState(false);

  const items = query.data ?? [];
  if (!enabled || items.length === 0) return null;

  const position = Math.min(index, items.length - 1);
  const current = items[position];

  const close = () => {
    setReading(false);
    dismiss.mutate(current.id);
    setIndex((value) => Math.max(0, Math.min(value, items.length - 2)));
  };

  return (
    <>
      <section
        aria-label={t("regionLabel")}
        className="relative flex shrink-0 items-center gap-3 border-b border-border bg-surface-1 py-2 pl-4 pr-2"
      >
        <span className={cn("absolute inset-y-0 left-0 w-1", typeAccent(current.type))} aria-hidden />
        <AnnouncementTypePill type={current.type} className="hidden shrink-0 sm:inline-flex" />
        <p className="min-w-0 flex-1 truncate text-[13px] text-ink">
          <span className="font-medium">{current.title}</span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setReading(true)}>
            {t("readMore")}
          </Button>
          {current.ctaLabel && current.ctaUrl ? (
            <span className="hidden sm:inline-flex">
              <AnnouncementCta label={current.ctaLabel} url={current.ctaUrl} />
            </span>
          ) : null}
          {items.length > 1 ? (
            <div className="flex items-center" aria-label={t("pagerLabel")}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("previous")}
                disabled={position === 0}
                onClick={() => setIndex(position - 1)}
              >
                <CaretLeft size={14} />
              </Button>
              <span className="px-1 text-[11px] tabular-nums text-ink-muted">
                {t("position", { current: position + 1, total: items.length })}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("next")}
                disabled={position >= items.length - 1}
                onClick={() => setIndex(position + 1)}
              >
                <CaretRight size={14} />
              </Button>
            </div>
          ) : null}
          <Button variant="ghost" size="icon-sm" aria-label={t("dismiss")} onClick={close}>
            <X size={14} />
          </Button>
        </div>
      </section>

      <Dialog open={reading} onOpenChange={setReading}>
        <DialogContent className="gap-0 p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">{current.title}</DialogTitle>
          <AnnouncementCardView
            announcement={current}
            className="rounded-none border-0 shadow-none"
            onNavigate={() => setReading(false)}
          />
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button variant="outline" size="sm" onClick={close}>
              {t("dontShowAgain")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
