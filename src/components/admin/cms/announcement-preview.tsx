"use client";

/**
 * An announcement previewed where it will appear: the real placement component (the same one the
 * app renders — announcement-surfaces.tsx) inside a schematic of the app, at desktop or phone
 * width, in the light or dark theme.
 *
 * The frame's dark mode is a `dark` class on the frame, so the preview can show the other theme
 * without switching the admin's own.
 */

import { useTranslations } from "next-intl";
import { Bell } from "@phosphor-icons/react/dist/ssr";

import {
  DashboardCardSurface,
  ModalSurface,
  NotificationCardSurface,
  ToastSurface,
  TopBannerSurface,
  type AnnouncementViewModel,
} from "@/components/announcements/announcement-surfaces";
import { cn } from "@/lib/utils";

export type PreviewDevice = "desktop" | "mobile";

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-surface-2", className)} />;
}

function PageSkeleton({ compact }: { compact: boolean }) {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-4 w-40" />
      <div className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-4")}>
        {Array.from({ length: compact ? 4 : 8 }, (_, index) => (
          <Skeleton key={index} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-24" />
    </div>
  );
}

function AppChrome({ children, mobile }: { children: React.ReactNode; mobile: boolean }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface-1 px-3">
      <span className="size-5 rounded-md bg-ink/80" aria-hidden />
      {!mobile ? <Skeleton className="h-3 w-24" /> : null}
      <span className="ml-auto flex items-center gap-2">
        {children}
        <span className="size-6 rounded-full bg-surface-2" aria-hidden />
      </span>
    </div>
  );
}

export function AnnouncementPlacementPreview({
  announcement,
  placement,
  device,
  dark,
  className,
}: {
  announcement: AnnouncementViewModel;
  placement: string;
  device: PreviewDevice;
  dark: boolean;
  className?: string;
}) {
  const t = useTranslations("adminCms.announcements.preview");
  const mobile = device === "mobile";
  const noop = () => undefined;
  const handlers = { inert: true, onCta: noop, onClose: announcement.dismissible === false ? undefined : noop };

  return (
    <div className={cn("flex justify-center rounded-lg border border-border bg-surface-2 p-3 sm:p-5", className)}>
      <div
        className={cn(
          dark && "dark",
          "relative flex w-full flex-col overflow-hidden border border-border bg-panel text-ink shadow-sm",
          mobile ? "h-[640px] max-w-[375px] rounded-[28px]" : "h-[520px] max-w-[900px] rounded-lg",
        )}
        aria-label={t("frameLabel", { placement: t(`placements.${placement}`), device: t(`devices.${device}`) })}
      >
        <AppChrome mobile={mobile}>
          <span className="relative flex size-6 items-center justify-center rounded-full border border-border bg-surface-1">
            <Bell size={12} />
            {placement === "NOTIFICATION_CENTER" ? <span className="absolute right-0 top-0 size-1.5 rounded-full bg-primary" /> : null}
          </span>
        </AppChrome>

        {placement === "TOP_BANNER" ? <TopBannerSurface announcement={announcement} onReadMore={noop} {...handlers} /> : null}

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {placement === "DASHBOARD_CARD" ? (
            <div className="space-y-3 p-4">
              <DashboardCardSurface announcement={announcement} {...handlers} />
              <PageSkeleton compact={mobile} />
            </div>
          ) : (
            <PageSkeleton compact={mobile} />
          )}

          {placement === "MODAL" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md">
                <ModalSurface announcement={announcement} {...handlers} />
              </div>
            </div>
          ) : null}

          {placement === "TOAST" ? (
            <div className={cn("absolute bottom-4", mobile ? "inset-x-3 flex justify-center" : "right-4")}>
              <ToastSurface announcement={announcement} {...handlers} />
            </div>
          ) : null}

          {placement === "NOTIFICATION_CENTER" ? (
            <div
              className={cn(
                "absolute top-2 rounded-[18px] bg-surface-1/90 p-1 shadow-[0_24px_48px_-12px_rgba(17,18,20,0.25)] ring-1 ring-ink/[0.07] backdrop-blur",
                mobile ? "inset-x-2" : "right-3 w-[400px]",
              )}
            >
              <NotificationCardSurface announcement={announcement} {...handlers} />
              <div className="space-y-2 p-3">
                {[0, 1].map((index) => (
                  <div key={index} className="flex gap-2">
                    <span className="size-7 shrink-0 rounded-full bg-surface-2" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
