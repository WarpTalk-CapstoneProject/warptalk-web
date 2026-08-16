"use client";

/**
 * "You were invited to a meeting" — with the one control that makes it an invitation: Accept.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE MEETING-STARTED BANNER
 *   Being invited and a meeting going live are different news and needed different answers. The
 *   started banner offers Join, because a meeting that is running can only be joined; an invitation
 *   usually points at something hours away, so Join alone would be a button that opens an empty
 *   room. What an invitation asks for is a yes — and until this shipped, an invitation existed only
 *   as an email and a row in `translation_room_invitations` that nothing in the app could answer.
 *
 *   The notification itself was also never arriving: the server sends type `MEETING_INVITED`, which
 *   was missing from the notification service's validator schema table, so every one was rejected
 *   as an unknown type carrying a payload. See NotificationConstants.TypeMeetingInvited.
 *
 * IT DOES NOT EXPIRE ON A TIMER
 *   Its sibling does, and correctly: a meeting is only "starting" for a moment. An invitation is
 *   a question, and a question that removes its own answer button after twenty seconds turns "I
 *   did not answer" into "I never saw it". It stays until Accept, or until dismissed by hand — and
 *   dismissing is local only: the notification is still in the bell, with the same Accept button.
 *
 * ACCEPT IS NOT JOIN
 *   Accept records the RSVP against the caller's email claim and nothing else. Join stays a
 *   separate, secondary control, and it is offered after accepting rather than instead of it, so
 *   somebody who wants to walk straight in still can.
 */

import { useState } from "react";
import Link from "next/link";
import { Check, UserPlus, X } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { QUERY_KEYS } from "@/constants/realtime";
import { translationRoomService } from "@/services/translation-room.service";
import { useMeetingInviteStore } from "@/stores/meeting-invite-store";

export function MeetingInviteBanner() {
  const notice = useMeetingInviteStore((state) => state.notice);
  const dismiss = useMeetingInviteStore((state) => state.dismiss);
  const queryClient = useQueryClient();

  // Local rather than in the store: "this notice has been accepted" is about the card on screen,
  // and the store's job is only to say which invitation is being shown.
  //
  // It records WHICH invitation was accepted rather than a bare boolean. This component is mounted
  // once by the layout and outlives every notice that passes through it, so a boolean would carry
  // the first acceptance over onto the next invitation — which would show a second, unanswered
  // meeting as already accepted.
  const [acceptedKey, setAcceptedKey] = useState<string | null>(null);
  const accepted = acceptedKey !== null && acceptedKey === notice?.key;

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!notice?.roomId) {
        // The accept endpoint is keyed by the room's UUID, which arrives in the payload. The
        // action_url cannot stand in for it: the server builds that link from the room CODE.
        throw new Error("This invitation did not arrive with a meeting to accept.");
      }
      return translationRoomService.acceptInvitation(notice.roomId);
    },
    onSuccess: () => {
      if (notice) setAcceptedKey(notice.key);
      // The room becomes something the invitee has said yes to, so every list that shows their
      // meetings — and the bell, whose copy of this notification is now answered — is stale.
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ROOMS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TRANSLATION_ROOMS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACE_ROOMS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.MEETINGS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });
      toast.success("Invitation accepted", { description: notice?.title });
    },
    onError: () => {
      // Left on screen deliberately — a failed Accept must not look like a completed one, and the
      // button has to still be there to press again.
      toast.error("Could not accept the invitation", {
        description: "Try again, or open the meeting from your notifications.",
      });
    },
  });

  if (!notice) return null;

  return (
    <div
      className="pointer-events-auto flex w-full max-w-[360px] items-start gap-3 rounded-[14px] border border-border bg-surface-1 p-3.5 shadow-lg"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
        <UserPlus size={17} weight="fill" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug text-ink">
          {accepted ? "Invitation accepted" : "You've been invited to a meeting"}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-ink-muted" title={notice.title}>
          {notice.title}
        </p>

        <div className="mt-2.5 flex items-center gap-2">
          {accepted ? (
            notice.joinHref ? (
              <Link
                href={notice.joinHref}
                onClick={dismiss}
                className="inline-flex h-[28px] items-center rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background transition hover:opacity-90"
              >
                Join now
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
                <Check size={12} weight="bold" />
                You&apos;re on the list
              </span>
            )
          ) : (
            <>
              {/* No Accept without a room id — the endpoint is keyed by it. A disabled button
                  would be a promise the card cannot keep; the View link below still works,
                  because that one only needs the link the server sent. */}
              {notice.roomId ? (
                <button
                  type="button"
                  onClick={() => acceptMutation.mutate()}
                  disabled={acceptMutation.isPending}
                  className="inline-flex h-[28px] items-center gap-1 rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check size={12} weight="bold" />
                  {acceptMutation.isPending ? "Accepting…" : "Accept"}
                </button>
              ) : null}
              {notice.joinHref ? (
                <Link
                  href={notice.joinHref}
                  onClick={dismiss}
                  className="inline-flex h-[28px] items-center rounded-full border border-border px-3 text-[12px] font-medium text-ink-muted transition hover:text-ink"
                >
                  View
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 grid size-6 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <X size={11} weight="bold" />
      </button>
    </div>
  );
}
