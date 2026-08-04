"use client";

import { Button } from "@/components/ui/button";
import { notificationService } from "@/services/notification.service";
import type { NotificationMessageDto } from "@/types/notification";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CalendarClock, CheckCircle2, CreditCard, Info, Megaphone, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";

interface NotificationItemProps {
  notification: NotificationMessageDto;
  onRead?: () => void;
  onNavigate?: () => void;
}

export function NotificationItem({
  notification,
  onRead,
  onNavigate,
}: NotificationItemProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

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
      case "MEETING_REMINDER":
        return <CalendarClock className="h-5 w-5 text-blue-500" />;
      case "BILLING_PAYMENT_SUCCEEDED":
      case "BILLING_PAYMENT_FAILED":
      case "BILLING_PAYMENT_REFUNDED":
      case "BILLING_PAYMENT_DISPUTED":
        return <CreditCard className="h-5 w-5 text-violet-500" />;
      case "ANNOUNCEMENT":
      default:
        return <Megaphone className="h-5 w-5 text-primary" />;
    }
  };

  const handleOpen = () => {
    if (!notification.actionUrl) return;
    if (!notification.isRead) {
      markReadMutation.mutate();
    }
    onNavigate?.();
    router.push(notification.actionUrl);
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
      role={notification.actionUrl ? "link" : undefined}
      tabIndex={notification.actionUrl ? 0 : undefined}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (notification.actionUrl && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          handleOpen();
        }
      }}
      className={`group relative flex items-start gap-3 p-4 transition-colors hover:bg-surface-2/30 ${notification.actionUrl ? "cursor-pointer" : ""} ${
        notification.isRead ? "opacity-75" : "bg-primary/5"
      }`}
    >
      <div className="mt-0.5 shrink-0">{getIcon()}</div>

      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-sm font-medium leading-none ${!notification.isRead ? "text-ink" : "text-ink/80"}`}
          >
            {notification.title}
          </p>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {formatDistanceToNow(new Date(notification.createdAt), {
              addSuffix: true,
            })}
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
