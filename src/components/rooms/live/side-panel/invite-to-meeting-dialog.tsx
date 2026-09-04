"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/api/errors";
import { useInviteToRoom, useTranslationRoomInvitations } from "@/hooks/use-translationRooms";
import {
  RECIPIENT_NOTES,
  describeInviteResult,
  hasInvalid,
  parseRecipients,
  sendableRecipients,
  type RecipientState,
} from "@/lib/meeting/invite-recipients";

/**
 * WT-552: bring somebody into a meeting that is already running.
 *
 * The only way to add an invitee used to be the room settings form, which refuses once the room
 * leaves SCHEDULED — exactly when a host realises they need one more person.
 *
 * A free-text box rather than a picker, because that is how the addresses arrive: pasted out of a
 * calendar entry or a chat message. The paste is decided before anything is sent, so the host can
 * see who is going to get an email and who is already here.
 */
export function InviteToMeetingDialog({
  open,
  onOpenChange,
  roomId,
  participantEmails,
  joinLink,
  onCopyLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  /** Roster addresses, so somebody sitting in the meeting is not emailed an invitation to it. */
  participantEmails: readonly (string | null | undefined)[];
  joinLink: string;
  onCopyLink: () => void;
}) {
  const [raw, setRaw] = useState("");
  const invite = useInviteToRoom(roomId);
  // Only while the dialog is open — this is a 3-second-poll panel and the list is not needed
  // until somebody is actually typing into it.
  const { data: invitations } = useTranslationRoomInvitations(open ? roomId : "");

  const parsed = useMemo(
    () =>
      parseRecipients(raw, {
        invitedEmails: invitations?.map((invitation) => invitation.email),
        participantEmails,
      }),
    [raw, invitations, participantEmails],
  );

  const sendable = sendableRecipients(parsed);
  const blocked = hasInvalid(parsed);

  async function handleInvite() {
    if (sendable.length === 0 || blocked) return;
    try {
      const result = await invite.mutateAsync(sendable);
      // The server's count, not `sendable.length`: it de-duplicates against invitation rows this
      // client may not have refetched, so a request for three can legitimately invite two.
      toast.success(describeInviteResult(result.invited, sendable.length));
      setRaw("");
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not send the invitations."));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setRaw("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-surface-1 border-border text-ink rounded-xl sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Invite to this meeting</DialogTitle>
          <DialogDescription className="text-ink-subtle pt-2">
            They get an email and an in-app notification with a link straight into this room.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <textarea
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={3}
            autoFocus
            placeholder="name@company.com, another@company.com"
            className="w-full resize-none rounded-md border border-border bg-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none"
          />

          {parsed.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {parsed.map((recipient, index) => (
                <li
                  key={`${recipient.email}-${index}`}
                  className={`flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] ${CHIP_STYLES[recipient.state]}`}
                >
                  <span className="max-w-[180px] truncate">{recipient.email}</span>
                  {RECIPIENT_NOTES[recipient.state] ? (
                    <span className="opacity-70">· {RECIPIENT_NOTES[recipient.state]}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {/* The link is the faster route for anybody the host can already reach on chat, and it
              is the only route for somebody without an account. Kept next to the box rather than
              behind it, because copying a link is not a fallback for a failed invite. */}
          <button
            type="button"
            onClick={onCopyLink}
            className="self-start text-[12px] font-medium text-primary hover:text-primary-hover"
            title={joinLink}
          >
            Or copy the join link
          </button>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-surface-2 hover:bg-surface-3 text-ink border-border"
          >
            Cancel
          </Button>
          <Button
            onClick={handleInvite}
            disabled={sendable.length === 0 || blocked || invite.isPending}
          >
            <PaperPlaneTilt className="mr-1.5 h-3.5 w-3.5" />
            {invite.isPending
              ? "Sending…"
              : sendable.length > 1
                ? `Invite ${sendable.length}`
                : "Invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A `Record`, so adding a recipient state without giving it a style is a type error rather than
 * an unstyled chip. Only `invalid` is red — the other two non-sending states are outcomes the
 * host asked for, not mistakes they made.
 */
const CHIP_STYLES: Record<RecipientState, string> = {
  new: "border-primary/30 bg-primary/10 text-primary",
  "already-invited": "border-border bg-surface-2 text-ink-subtle",
  "already-in-room": "border-green-200 bg-green-50 text-green-600",
  duplicate: "border-border bg-surface-2 text-ink-subtle",
  invalid: "border-red-200 bg-red-50 text-red-600",
};
