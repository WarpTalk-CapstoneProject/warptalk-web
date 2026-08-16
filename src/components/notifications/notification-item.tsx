"use client";

import { Button } from "@/components/ui/button";
import { QUERY_KEYS } from "@/constants/realtime";
import { readMeetingInviteNotice } from "@/lib/notifications/meeting-started-notice";
import { notificationService } from "@/services/notification.service";
import { translationRoomService } from "@/services/translation-room.service";
import type { NotificationMessageDto } from "@/types/notification";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  CreditCard,
  Info,
  Megaphone,
  UserPlus,
  Video,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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

  /**
   * An invitation can be answered from the bell, not only from the popup that appeared once.
   *
   * The popup is a moment — it is dismissed, or it is missed because the tab was in the background.
   * The bell is the durable copy, so it has to carry the same Accept button; otherwise the only way
   * to say yes was to be looking at the screen when the notification arrived.
   *
   * Null for every other type. The room's UUID comes from the payload, not from `actionUrl` —
   * the server builds that link from the room CODE, which the accept endpoint does not take.
   */
  const invite = readMeetingInviteNotice(notification);
  const [accepted, setAccepted] = useState(false);

  const acceptMutation = useMutation({
    mutationFn: () => translationRoomService.acceptInvitation(invite!.roomId!),
    onSuccess: () => {
      setAccepted(true);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ROOMS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TRANSLATION_ROOMS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACE_ROOMS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.MEETINGS] });
      toast.success("Invitation accepted", { description: invite?.title });
      // Answering it is reading it. Leaving the row unread after an explicit yes would keep the
      // badge counting a question that has been answered.
      if (!notification.isRead) markReadMutation.mutate();
    },
    onError: () => {
      toast.error("Could not accept the invitation", {
        description: "Try again in a moment.",
      });
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
      // The two meeting types that reached this switch and fell through to the megaphone:
      // MEETING_INVITED has been sent since invitations rang the bell, and MEETING_STARTED is
      // new in WT-341. A meeting that is live now is the one notification worth acting on
      // immediately, so it gets the loudest colour in the list.
      case "MEETING_INVITED":
        return <UserPlus className="h-5 w-5 text-blue-500" />;
      case "MEETING_STARTED":
        return <Video className="h-5 w-5 text-emerald-500" />;
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

        {invite?.roomId ? (
          <div className="pt-1.5">
            {accepted ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <Check className="h-3 w-3" />
                Accepted
              </span>
            ) : (
              <Button
                size="sm"
                // stopPropagation, because the whole row is a link to the meeting. Without it,
                // Accept would also navigate — and a click that both answers and leaves the page
                // makes it impossible to tell whether the answer landed.
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  acceptMutation.mutate();
                }}
                disabled={acceptMutation.isPending}
                className="h-6 gap-1 rounded-full px-2.5 text-[11px]"
              >
                <Check className="h-3 w-3" />
                {acceptMutation.isPending ? "Accepting…" : "Accept"}
              </Button>
            )}
          </div>
        ) : null}
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
