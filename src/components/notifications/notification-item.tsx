"use client";

import { QUERY_KEYS } from "@/constants/realtime";
import {
  readMeetingInviteNotice,
  readMeetingStartedNotice,
} from "@/lib/notifications/meeting-started-notice";
import { translationRoomService } from "@/services/translation-room.service";
import type { NotificationMessageDto } from "@/types/notification";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface NotificationItemProps {
  notification: NotificationMessageDto;
  /**
   * Unread when the panel was opened. Opening the bell marks everything read on the server, so
   * `isRead` is true for every row a moment later; this is what keeps "which of these are new"
   * visible for as long as the panel stays open.
   */
  fresh?: boolean;
  onNavigate?: () => void;
}

/**
 * One notification, in the ElevenLabs shape: a quiet card with the title, the body and the time
 * stacked on the left and at most one action on the right.
 *
 * No per-type icon and no tinted background. With coloured icons, a tinted unread row and a badge
 * all competing, nothing stood out; a single small dot now marks what is new. There is no
 * per-row "mark as read" either — opening the bell already did that (NotificationPopover).
 */
export function NotificationItem({ notification, fresh = false, onNavigate }: NotificationItemProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

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
    },
    onError: () => {
      toast.error("Could not accept the invitation", {
        description: "Try again in a moment.",
      });
    },
  });

  /**
   * WT-612 / WT-621 — MEETING_OPENED is the one type whose `actionUrl` must not be followed.
   *
   * The bell is the DURABLE copy of the banner, so the rule about where that notice leads has to
   * hold here too, or dismissing the popup and clicking the row a minute later lands somewhere
   * else. The server mints `/room/{id}` for every meeting notification because the same string is
   * emailed, and that address forwards straight into `/live` — right for a call already running,
   * wrong for a room the clock merely unlocked: it skips device setup and drops the reader into
   * an empty session. `readMeetingStartedNotice` resolves the room page instead.
   *
   * Only for the opened kind. MEETING_STARTED keeps following its own `actionUrl`, unchanged.
   */
  const opened = readMeetingStartedNotice(notification);
  const openHref =
    (opened?.kind === "opened" ? opened.joinHref : null) ?? notification.actionUrl;

  const handleOpen = () => {
    if (!openHref) return;
    onNavigate?.();
    router.push(openHref);
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
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 rounded-[14px] py-3.5 pr-3.5 pl-4 outline-none transition-colors",
        "hover:bg-ink/[0.045] focus-visible:bg-ink/[0.045] focus-visible:ring-2 focus-visible:ring-primary",
        notification.actionUrl && "cursor-pointer",
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            "flex items-baseline gap-2 text-[14px] leading-[1.45] text-ink",
            fresh ? "font-semibold" : "font-medium",
          )}
        >
          {/* Always laid out, only painted when fresh, so read and new titles start at the same x. */}
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 -translate-y-0.5 rounded-full bg-primary",
              !fresh && "invisible",
            )}
          />
          <span className="min-w-0">
            {notification.title}
            {notification.actionUrl ? (
              <span aria-hidden className="font-normal text-ink-muted">
                {" "}
                →
              </span>
            ) : null}
            {fresh ? <span className="sr-only"> (new)</span> : null}
          </span>
        </p>
        <p className="mt-1.5 ml-3.5 line-clamp-3 text-[13.5px] leading-[1.55] text-ink-muted">
          {notification.content}
        </p>
        <p className="mt-2.5 ml-3.5 text-xs text-ink-subtle">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </p>
      </div>

      {invite?.roomId ? (
        accepted ? (
          <span className="text-[12.5px] font-semibold whitespace-nowrap text-emerald-600">
            Accepted
          </span>
        ) : (
          <button
            type="button"
            // stopPropagation, because the whole row is a link to the meeting. Without it,
            // Accept would also navigate — and a click that both answers and leaves the page
            // makes it impossible to tell whether the answer landed.
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              acceptMutation.mutate();
            }}
            disabled={acceptMutation.isPending}
            className="h-7 rounded-full bg-primary px-3 text-[12.5px] font-semibold whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {acceptMutation.isPending ? "Accepting…" : "Accept"}
          </button>
        )
      ) : null}
    </div>
  );
}
