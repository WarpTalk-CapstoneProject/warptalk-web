"use client";

/**
 * The announcements the app shell owns: the top banner, the modal and the toast stack.
 * (Notification-centre cards live in the bell panel and dashboard cards on the workspace home —
 * see announcement-feeds.tsx. All five read the same query.)
 *
 * The server does all the deciding — the window, the audience, the frequency and the dismissals —
 * so this renders whatever GET /notifications/announcements returns, sorted by priority, and
 * reports what the viewer saw and did with it.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  AnnouncementArticle,
  ModalSurface,
  ToastSurface,
  TopBannerSurface,
  type AnnouncementViewModel,
} from "@/components/announcements/announcement-surfaces";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  useActiveAnnouncements,
  useAnnouncementActions,
  useHiddenAnnouncementIds,
} from "@/hooks/use-announcements";
import { visibleNow } from "@/lib/announcements/viewer-placements";
import type { ViewerAnnouncementDto } from "@/types/admin-cms";

/** Records one impression the first time an announcement is actually on screen. */
export function useImpression(id: string | undefined) {
  const { seen } = useAnnouncementActions();
  useEffect(() => {
    if (id) seen(id);
  }, [id, seen]);
}

export function AnnouncementHost({ enabled }: { enabled: boolean }) {
  const query = useActiveAnnouncements(enabled);
  const hidden = useHiddenAnnouncementIds();
  if (!enabled || !query.data?.length) return null;
  const visible = visibleNow(query.data, hidden);
  return (
    <>
      {visible.banner.length > 0 ? <BannerSlot items={visible.banner} /> : null}
      {visible.modal ? <ModalSlot key={visible.modal.id} announcement={visible.modal} /> : null}
      {visible.toasts.length > 0 ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
          {visible.toasts.map((toast) => (
            <ToastSlot key={toast.id} announcement={toast} />
          ))}
        </div>
      ) : null}
    </>
  );
}

function BannerSlot({ items }: { items: ViewerAnnouncementDto[] }) {
  const t = useTranslations("common.announcements");
  const { close, clicked } = useAnnouncementActions();
  const [index, setIndex] = useState(0);
  const [reading, setReading] = useState(false);
  const position = Math.min(index, items.length - 1);
  const current = items[position];
  useImpression(current?.id);
  if (!current) return null;

  const closeCurrent = () => {
    setReading(false);
    close(current);
    setIndex((value) => Math.max(0, Math.min(value, items.length - 2)));
  };

  return (
    <>
      <TopBannerSurface
        announcement={current as AnnouncementViewModel}
        position={position}
        total={items.length}
        onPrevious={() => setIndex(position - 1)}
        onNext={() => setIndex(position + 1)}
        onReadMore={() => setReading(true)}
        onClose={current.dismissible ? closeCurrent : undefined}
        onCta={(secondary) => clicked(current.id, secondary)}
      />
      <Dialog open={reading} onOpenChange={setReading}>
        <DialogContent className="gap-0 p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">{current.title}</DialogTitle>
          <AnnouncementArticle
            announcement={current as AnnouncementViewModel}
            onClose={() => setReading(false)}
            onCta={(secondary) => {
              clicked(current.id, secondary);
              setReading(false);
            }}
            footer={
              current.dismissible ? (
                <Button variant="outline" size="sm" onClick={closeCurrent}>
                  {t("dontShowAgain")}
                </Button>
              ) : null
            }
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModalSlot({ announcement }: { announcement: ViewerAnnouncementDto }) {
  const { close, clicked } = useAnnouncementActions();
  useImpression(announcement.id);
  // Closing a modal is always possible; only a dismissible one is remembered as dismissed.
  const onClose = () => close(announcement);
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="gap-0 bg-transparent p-0 ring-0 sm:max-w-lg" showCloseButton={false}>
        <DialogTitle className="sr-only">{announcement.title}</DialogTitle>
        <ModalSurface
          announcement={announcement as AnnouncementViewModel}
          onClose={onClose}
          onCta={(secondary) => {
            clicked(announcement.id, secondary);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ToastSlot({ announcement }: { announcement: ViewerAnnouncementDto }) {
  const { close, clicked } = useAnnouncementActions();
  useImpression(announcement.id);
  return (
    <div className="pointer-events-auto animate-in fade-in-0 slide-in-from-bottom-2">
      <ToastSurface
        announcement={announcement as AnnouncementViewModel}
        onClose={() => close(announcement)}
        onCta={(secondary) => clicked(announcement.id, secondary)}
      />
    </div>
  );
}
