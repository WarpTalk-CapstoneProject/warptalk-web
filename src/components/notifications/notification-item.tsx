"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Megaphone, Info, Wrench, X } from "lucide-react";
import { notificationService } from "@/services/notification.service";
import type { NotificationMessageDto } from "@/types/notification";
import { Button } from "@/components/ui/button";

interface NotificationItemProps {
  notification: NotificationMessageDto;
  onRead?: () => void;
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const queryClient = useQueryClient();

  const markReadMutation = useMutation({
    mutationFn: () => notificationService.markAsRead(notification.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      onRead?.();
    },
  });

  const getIcon = () => {
    switch (notification.type) {
      case "SYSTEM":
        return <Info className="h-5 w-5 text-blue-500" />;
      case "PROMOTION":
        return <Megaphone className="h-5 w-5 text-emerald-500" />;
      case "MAINTENANCE":
        return <Wrench className="h-5 w-5 text-orange-500" />;
      case "ANNOUNCEMENT":
      default:
        return <Megaphone className="h-5 w-5 text-primary" />;
    }
  };

  const handleMarkRead = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!notification.isRead) {
      markReadMutation.mutate();
    }
  };

  return (
    <div
      className={`relative flex items-start gap-3 p-4 transition-colors hover:bg-surface-2/30 ${
        notification.isRead ? "opacity-75" : "bg-primary/5"
      }`}
    >
      <div className="mt-0.5 shrink-0">{getIcon()}</div>
      
      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium leading-none ${!notification.isRead ? "text-ink" : "text-ink/80"}`}>
            {notification.title}
          </p>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </span>
        </div>
        
        <p className="text-xs text-muted-foreground line-clamp-2">
          {notification.content}
        </p>
      </div>

      {!notification.isRead && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMarkRead}
          className="h-6 w-6 shrink-0 rounded-full text-primary hover:bg-primary/10 hover:text-primary-hover absolute top-3 right-2 opacity-0 group-hover:opacity-100 transition-opacity md:opacity-100"
          title="Mark as read"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
