"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { notificationService } from "@/services/notification.service";
import { NotificationItem } from "./notification-item";
import { Badge } from "@/components/ui/badge";

export function NotificationPopover() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationService.getNotifications(1, 10),
    retry: false,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notifications = data?.data?.items || [];
  const unreadCount = notifications.filter(n => !n.isRead).length;

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
        
        <div className="max-h-[400px] overflow-y-auto overflow-x-hidden flex flex-col divide-y divide-hairline">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mb-2" />
              <p className="text-xs">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-center">
              <Bell className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs opacity-75 mt-1">You have no new notifications.</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <NotificationItem key={notif.id} notification={notif} />
            ))
          )}
        </div>
        
        {notifications.length > 0 && (
          <div className="p-2 border-t border-hairline bg-surface-2/30 text-center">
            <Button variant="ghost" size="sm" className="w-full text-xs text-primary hover:text-primary-hover hover:bg-primary/5">
              View all notifications
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
