"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { notificationService } from "@/services/notification.service";
import { NOTIFICATION_GLASS, NotificationPanel } from "./notification-panel";

const NOTHING_FRESH: ReadonlySet<string> = new Set();

export function NotificationPopover() {
  const [open, setOpen] = useState(false);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(NOTHING_FRESH);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationService.getNotifications(1, 50),
    retry: false,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notifications = data?.data?.items || [];
  const unreadCount = data?.data?.unreadCount ?? 0;

  /**
   * OPENING THE BELL IS READING IT. There is no mark-all control and no per-row tick: the panel
   * lists everything, so opening it is the moment it was all seen, and the server is told so then.
   *
   * What was new is snapshotted first. The server answer flips every row to read a moment later,
   * and without the snapshot the dots marking the new rows would vanish while the reader is still
   * looking for them. Anything that arrives while the panel is open is still unread on the server
   * — it shows a dot from its own flag — and is marked read when the panel closes, because by then
   * it has been on screen too.
   */
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFreshIds(new Set(notifications.filter((item) => !item.isRead).map((item) => item.id)));
    } else {
      setFreshIds(NOTHING_FRESH);
    }
    if (unreadCount > 0 && !markAllReadMutation.isPending) markAllReadMutation.mutate();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        title="Notifications"
        className="relative flex size-6 items-center justify-center rounded-full border border-hairline bg-surface-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-surface-2 hover:text-ink transition-colors"
      >
        <Bell className="h-3 w-3" strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" aria-label="Notifications" className={NOTIFICATION_GLASS}>
        <NotificationPanel
          notifications={notifications}
          freshIds={freshIds}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          onNavigate={() => handleOpenChange(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
