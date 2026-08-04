"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Bell, Check, Loader2, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { notificationService } from "@/services/notification.service";
import { NotificationItem } from "./notification-item";
import { Badge } from "@/components/ui/badge";

export function NotificationPopover() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [showAll, setShowAll] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
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
  const totalCount = data?.data?.totalCount ?? 0;
  const filteredNotifications = notifications.filter((notification) =>
    filter === "unread" ? !notification.isRead : true,
  );
  const visibleNotifications = showAll
    ? filteredNotifications
    : filteredNotifications.slice(0, 10);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Notifications"
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
      
      <PopoverContent align="end" className="w-[380px] p-0 rounded-xl shadow-lg border-hairline bg-surface-1">
        <div className="flex items-center justify-between p-4 border-b border-hairline bg-surface-2/10">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5 bg-primary/10 text-primary hover:bg-primary/20">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 text-xs text-muted-foreground hover:text-ink hover:bg-surface-2"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              {markAllReadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
              Mark all read
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1 border-b border-hairline px-3 py-2">
          <Button
            type="button"
            variant={filter === "all" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => setFilter("all")}
          >
            All {totalCount > 0 ? `(${totalCount})` : ""}
          </Button>
          <Button
            type="button"
            variant={filter === "unread" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => setFilter("unread")}
          >
            Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
          </Button>
          {isFetching && !isLoading && (
            <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-ink-muted" />
          )}
        </div>
        
        <div className="max-h-[400px] overflow-y-auto overflow-x-hidden flex flex-col divide-y divide-hairline">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mb-2" />
              <p className="text-xs">Loading notifications...</p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <AlertCircle className="h-7 w-7 text-destructive/80" />
              <p className="text-sm font-medium text-ink">Couldn&apos;t load notifications</p>
              <p className="text-xs">Check your connection and try again.</p>
              <Button type="button" variant="outline" size="sm" className="mt-1 h-8 gap-1.5" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-center">
              <Bell className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs opacity-75 mt-1">
                {filter === "unread" ? "You have no unread notifications." : "New updates will appear here."}
              </p>
            </div>
          ) : (
            visibleNotifications.map((notif) => (
              <NotificationItem
                key={notif.id}
                notification={notif}
                onNavigate={() => setOpen(false)}
              />
            ))
          )}
        </div>
        
        {filteredNotifications.length > 10 && (
          <div className="p-2 border-t border-hairline bg-surface-2/30 text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-xs text-primary hover:text-primary-hover hover:bg-primary/5"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Show recent" : `View all ${filteredNotifications.length} notifications`}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
