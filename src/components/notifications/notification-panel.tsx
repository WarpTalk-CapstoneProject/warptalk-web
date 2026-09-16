"use client";

/**
 * The inside of the bell: the list and its three non-list states, with no data layer.
 *
 * Split from NotificationPopover so the look can be checked against fixtures on
 * /dev/notifications-preview — the real popover needs a session and a notification history,
 * neither of which a laptop has.
 */

import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { NotificationMessageDto } from "@/types/notification";
import { NotificationItem } from "./notification-item";

/**
 * Frosted glass, as in ElevenLabs' panels: the page shows through, blurred, instead of a solid
 * card. No header, no divider lines around the list and no noise layer — only the blur. Shared
 * with the dev preview so the two cannot drift.
 */
export const NOTIFICATION_GLASS =
  "w-[440px] max-w-[calc(100vw-24px)] gap-0 overflow-hidden rounded-[18px] p-1 " +
  "bg-surface-1/70 backdrop-blur-[24px] backdrop-saturate-150 " +
  "ring-1 ring-ink/[0.07] shadow-[0_24px_48px_-12px_rgba(17,18,20,0.2),0_4px_12px_rgba(17,18,20,0.05)] " +
  "dark:shadow-[0_28px_56px_-12px_rgba(0,0,0,0.7)]";

export function NotificationPanel({
  notifications,
  freshIds,
  isLoading,
  isError,
  onRetry,
  onNavigate,
}: {
  notifications: NotificationMessageDto[];
  /** Ids that were unread when the panel opened. See NotificationItem's `fresh`. */
  freshIds: ReadonlySet<string>;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onNavigate: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 px-6 py-10 text-[13px] text-ink-muted">
        <Loader2 className="size-4 animate-spin" />
        Loading notifications…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <AlertCircle className="size-6 text-destructive/80" />
        <p className="text-[13.5px] font-medium text-ink">Couldn&apos;t load notifications</p>
        <p className="text-xs text-ink-muted">Check your connection and try again.</p>
        <Button type="button" variant="outline" size="sm" className="mt-1 h-8 gap-1.5" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <p className="px-6 py-10 text-center text-[13px] text-ink-muted">
        You&apos;re all caught up. New notifications appear here.
      </p>
    );
  }

  return (
    <div className="max-h-[min(560px,calc(100vh-120px))] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="divide-y divide-ink/[0.06]">
        {notifications.map((notification) => (
          <li key={notification.id} className="py-1">
            <NotificationItem
              notification={notification}
              fresh={freshIds.has(notification.id) || !notification.isRead}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
