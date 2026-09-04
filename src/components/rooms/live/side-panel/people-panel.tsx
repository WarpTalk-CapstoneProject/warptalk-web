"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Microphone,
  MicrophoneSlash,
  Star,
  UserMinus,
  UserPlus,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import { HandRaiseBadge } from "@/components/rooms/live/hand-raise-badge";
import { AvatarPresenceDot } from "@/components/presence/presence-dot";
import { usePresence } from "@/hooks/use-presence";
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
import { useAuthStore } from "@/stores/auth-store";
import {
  useKickMeetingParticipant,
  useMuteMeetingParticipant,
  useTransferMeetingHost,
  useRejectMeetingParticipant,
} from "@/hooks/use-meeting";
import {
  useAdmitParticipant,
} from "@/hooks/use-translationRooms";
import type {
  TranslationRoomDto,
  TranslationRoomParticipantDto,
} from "@/types/translationRoom";
import { useParticipants } from "@livekit/components-react";
import { LumidotSpinner } from "@/components/ui/lumidot-spinner";
import {
  PRESENCE_LABELS,
  participantPresence,
  type ParticipantPresence,
} from "@/lib/meeting/room-occupancy";
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { MEETING_MEMBER_PAGE_SIZE } from "@/lib/meeting/participant-identity";
import { InviteToMeetingDialog } from "./invite-to-meeting-dialog";

export function PeoplePanel({
  roomId,
  room,
  isHost,
  participants,
  participantsLoading,
  participantsError,
  onCopyText,
  joinLink,
  raisedHandUserIds,
  spotlightedUserId,
  onToggleSpotlight,
}: {
  roomId: string;
  room: TranslationRoomDto;
  isHost: boolean;
  participants: TranslationRoomParticipantDto[];
  participantsLoading: boolean;
  participantsError: boolean;
  onCopyText: (value: string, label: string) => void;
  joinLink: string;
  raisedHandUserIds?: Set<string>;
  spotlightedUserId?: string | null;
  onToggleSpotlight?: (userId: string) => void;
}) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const lkParticipants = useParticipants();
  const lkParticipantIds = new Set(lkParticipants.map((p) => p.identity));
  // WT-308: "who is gone" is the same question the badge answers, so it is asked the same
  // way. This used to be a second, private status list; keeping two meant they could
  // disagree, and a roster that hides a status the badge still renders is exactly how the
  // "Left" arm went unnoticed. Status only — a stale row must not be resurrected into the
  // list by a LiveKit identity that happens to still be around.
  const visibleParticipants = participants.filter(
    (participant) => participantPresence(participant.status) !== "left",
  );

  // One request for the whole roster instead of one per row.
  usePresence(visibleParticipants.map((participant) => participant.userId));

  // WT-537 — admit the whole lobby at once.
  //
  // Admitting one at a time is fine for a stray latecomer and unusable for the case this exists
  // for: a scheduled meeting where everyone arrives in the same minute and the host is left
  // clicking through a queue while the room waits on them.
  //
  // Deliberately N calls to the existing per-participant endpoint rather than a new bulk one.
  // Admission is not a set operation server-side — each admit writes a participant row, seats
  // them against the room's capacity, and publishes its own realtime event — so a bulk endpoint
  // would have to reproduce all of that and decide what "half of them fit" means. Looping here
  // keeps one definition of admitting somebody, and a capacity refusal lands on the person it
  // refused rather than failing the whole batch.
  const waitingParticipants = visibleParticipants.filter(
    (participant) => participant.status === "waiting",
  );
  const admitAll = useAdmitParticipant(roomId);
  const [admittingAll, setAdmittingAll] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  // WT-552 — the roster carries no email address.
  //
  // `GET /translation-rooms/{id}/participants` returns names, roles and languages and nothing to
  // match an invitation against, so "this person is already in the room" cannot be answered from
  // the roster alone. The workspace member list is the same source the meeting already uses to
  // put a face on a participant (see buildParticipantIdentities), and it is the one that carries
  // the address. Same page size, so both callers share one cached request.
  //
  // A participant with no member row — an external or a bridge guest — simply is not matched, and
  // re-inviting them falls through to the server's own de-duplication. Under-claiming here is the
  // safe direction: the alternative is telling a host somebody is present when they are not.
  const membersQuery = useWorkspaceMembers(
    isHost && room.workspaceId ? room.workspaceId : undefined,
    1,
    MEETING_MEMBER_PAGE_SIZE,
  );
  const participantEmails = useMemo(() => {
    const byUserId = new Map(
      (membersQuery.data?.items ?? []).map((member) => [member.userId, member.email]),
    );
    return visibleParticipants
      .map((participant) => byUserId.get(participant.userId))
      .filter((email): email is string => Boolean(email));
  }, [membersQuery.data, visibleParticipants]);

  async function handleAdmitAll() {
    setAdmittingAll(true);
    // Snapshotted before the first await: the roster polls every 3 seconds, so the array this
    // closes over would otherwise be replaced mid-loop and somebody could be admitted twice or
    // skipped entirely.
    const queue = waitingParticipants;
    let admitted = 0;
    const failures: string[] = [];

    for (const participant of queue) {
      try {
        await admitAll.mutateAsync(participant.id);
        admitted += 1;
      } catch (error) {
        // Kept going rather than aborting. One person failing capacity or having already left
        // is not a reason to leave the rest of the lobby waiting.
        failures.push(getErrorMessage(error, participant.displayName));
      }
    }

    setAdmittingAll(false);
    if (admitted > 0) {
      toast.success(`Admitted ${admitted} ${admitted === 1 ? "person" : "people"}.`);
    }
    if (failures.length > 0) {
      toast.error(
        `${failures.length} could not be admitted.`,
        { description: failures[0] },
      );
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-canvas p-3">
        <p className="text-[12px] font-medium text-ink-subtle">Room Code</p>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold tracking-wide text-ink">
            {room.translationRoomCode}
          </span>
          <button
            onClick={() => onCopyText(joinLink, "Invite link")}
            className="text-[12px] font-medium text-primary hover:text-primary-hover"
          >
            Copy Link
          </button>
        </div>
        {/* WT-552 — host-only, and next to the link rather than behind a menu.
            The link works for anybody the host can already reach on chat. This is for the person
            they cannot: it sends a real invitation, which is what puts the meeting in that
            person's own room list and bell. Room settings refuse to add an invitee once the room
            leaves SCHEDULED, so before this there was no way to do it at all. */}
        {isHost ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowInvite(true)}
            className="mt-1 w-full bg-surface-2 hover:bg-surface-3 text-ink border-border"
          >
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Invite people
          </Button>
        ) : null}
      </div>

      {isHost ? (
        <InviteToMeetingDialog
          open={showInvite}
          onOpenChange={setShowInvite}
          roomId={roomId}
          participantEmails={participantEmails}
          joinLink={joinLink}
          onCopyLink={() => onCopyText(joinLink, "Invite link")}
        />
      ) : null}

      {isHost && waitingParticipants.length > 1 ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2">
          <p className="text-[12px] text-ink-muted">
            <span className="font-medium text-ink">{waitingParticipants.length} people</span> are
            waiting to join.
          </p>
          <Button size="sm" onClick={handleAdmitAll} disabled={admittingAll}>
            {admittingAll ? "Admitting…" : "Admit all"}
          </Button>
        </div>
      ) : null}

      <div className="space-y-1">
        {participantsLoading ? (
          <div className="flex items-center gap-2">
            <LumidotSpinner />
            <p className="text-[13px] text-ink-subtle">
              Loading participants...
            </p>
          </div>
        ) : null}
        {/* WT-367 — the error only counts when there is nothing to show.
            This query polls every 3 seconds, and the comment on it in persistent-meeting-session
            says why that is dangerous: 20 requests a minute against a gateway that rate-limits an
            IP at 100/min and answers rejections with a bodyless 503. React Query keeps the last
            good `data` alongside `isError`, so a single rejected poll used to paint a red failure
            over a roster that was on screen, correct, and about to be refreshed three seconds
            later. Reporting a fault the user can see is untrue is worse than reporting nothing.

            It also said "controls" when what failed is the participant LIST — which sent this
            ticket looking at the host-control authorization code for a networking blip. */}
        {participantsError && participants.length === 0 ? (
          <p className="text-[13px] text-red-600">
            Could not load the participant list.
          </p>
        ) : visibleParticipants.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-[13px] text-ink-subtle">
            No active participants in this room.
          </p>
        ) : (
          visibleParticipants.map((participant) => (
            <ParticipantRow
              key={participant.id}
              participant={participant}
              isHost={isHost}
              isSelf={participant.userId === currentUserId}
              roomId={roomId}
              // WT-367: `participant.role`, not `room.hostId`. The role has already been
              // reconciled against the live HostChanged broadcast by applyLiveHostRole (WT-358);
              // `room.hostId` comes from the room query and stays stale until it refetches. In
              // that window the two disagree, and `canManage` below reads this as "do not touch
              // the host" — so the NEW host could not mute, kick or re-transfer the person they
              // had just taken the role from. Deriving both from the same corrected field is
              // also what stops this panel from having a second opinion about who the host is.
              isRoomHost={participant.role?.toUpperCase() === "HOST"}
              isInRoom={lkParticipantIds.has(participant.userId)}
              handRaised={raisedHandUserIds?.has(participant.userId) ?? false}
              isSpotlighted={spotlightedUserId === participant.userId}
              onToggleSpotlight={isHost ? onToggleSpotlight : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ParticipantRow({
  participant,
  isHost,
  isSelf,
  roomId,
  isRoomHost,
  isInRoom,
  handRaised,
  isSpotlighted,
  onToggleSpotlight,
}: {
  participant: TranslationRoomParticipantDto;
  isHost: boolean;
  /** This row is the viewer. Host powers never apply to yourself — see canManage below. */
  isSelf: boolean;
  roomId: string;
  isRoomHost: boolean;
  isInRoom: boolean;
  handRaised?: boolean;
  isSpotlighted?: boolean;
  /** Host-only: spotlight this participant for everyone. Omit (or !isHost) to hide the control. */
  onToggleSpotlight?: (userId: string) => void;
}) {
  const admit = useAdmitParticipant(roomId);
  const reject = useRejectMeetingParticipant(roomId);
  const kickLivekit = useKickMeetingParticipant(roomId);
  const muteParticipant = useMuteMeetingParticipant(roomId);
  const transferHost = useTransferMeetingHost(roomId);

  // WT-367 — `!isRoomHost` was standing in for "this row is not me", and the two only coincide
  // while the viewer is the host AND nobody has transferred the role. After a transfer the old
  // host's own row is no longer the room host, so the proxy stopped protecting the one person it
  // was meant to protect: they saw mute, kick and transfer-host on themselves.
  //
  // The server always refused these — the toast "Use the microphone control to mute yourself"
  // comes from the backend, not from here — so the damage was never a bad action going through.
  // It was offering a control that cannot work and only says so after it is clicked.
  //
  // Both guards are kept. `!isSelf` is the one that was missing; `!isRoomHost` still stops a host
  // from being kicked out of their own meeting if the two identities ever diverge.
  const canManage = isHost && !isSelf && !isRoomHost;
  const audioEnabled = participant.isTranslationAudioEnabled ?? true;

  const [showKickDialog, setShowKickDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [kickScope, setKickScope] = useState<"live" | "record">("live");

  async function runAction(action: "mute" | "admit" | "reject" | "transfer") {
    try {
      if (action === "mute") {
        // Muted at the SFU, not asked over the data channel: a request is something an
        // unresponsive or modified client can ignore, and a host asking for silence means
        // silence. There is no unmute here — only the speaker can turn their own mic back on.
        await muteParticipant.mutateAsync(participant.userId);
        toast.success(`${participant.displayName} has been muted.`);
      }
      if (action === "admit") {
        await admit.mutateAsync(participant.id);
        toast.success("Participant admitted.");
      }
      if (action === "reject") {
        await reject.mutateAsync(participant.id);
        toast.success("Participant rejected from lobby.");
      }
      if (action === "transfer") {
        await transferHost.mutateAsync(participant.userId);
        toast.success("Host transferred.");
        setShowTransferDialog(false);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Action failed."));
    }
  }

  async function handleKick() {
    try {
      await kickLivekit.mutateAsync(participant.userId);
      toast.success("Participant removed from meeting.");
      setShowKickDialog(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to kick participant."));
    }
  }

  return (
    <>
      <div className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-canvas">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* The badges to the right say where someone is relative to THIS room; the dot says
              whether they are reachable in the app at all — which is the difference between an
              invitee who has not clicked in yet and one who is not around. */}
          <div className="relative h-7 w-7 shrink-0">
            <div className="grid h-full w-full place-items-center rounded-sm bg-primary/10 text-[10px] font-bold text-primary">
              {initials(participant.displayName)}
            </div>
            <AvatarPresenceDot userId={participant.userId} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[13px] font-medium text-ink">
                {participant.displayName}
              </p>
              {handRaised ? (
                <HandRaiseBadge className="h-4 w-4 text-[10px]" />
              ) : null}
              {participant.isExternal && (
                <span className="rounded bg-surface-2 px-1 py-0.5 text-[10px] font-medium text-ink-subtle border border-border">
                  External
                </span>
              )}
              {/* WT-308: presence comes from the shared resolver, not an inline if/else
                  chain. The chain this replaced had no CONNECTED arm, so the host's own row
                  fell through to the `else` and read "Left" while the host was sitting in
                  the meeting. (WT-450 later stopped seeding that row CONNECTED at creation —
                  it is INVITED until they actually join, which the resolver reads as
                  "Not in room". The CONNECTED arm still matters the moment they do join.) */}
              <PresenceBadge
                presence={participantPresence(participant.status, { isInRoom })}
              />
            </div>
            <p className="truncate text-[11px] text-ink-subtle capitalize">
              {participant.role.toString().toLowerCase()}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="grid h-6 w-6 place-items-center rounded-sm bg-canvas text-ink-subtle group-hover:hidden">
            {audioEnabled ? (
              <Microphone className="h-3.5 w-3.5" />
            ) : (
              <MicrophoneSlash className="h-3.5 w-3.5" />
            )}
          </span>
          {onToggleSpotlight && isInRoom && (
            <button
              onClick={() => onToggleSpotlight(participant.userId)}
              className={`hidden h-6 w-6 place-items-center rounded-sm group-hover:grid ${isSpotlighted ? "text-primary" : "text-ink-muted hover:bg-surface-2"}`}
              title={
                isSpotlighted ? "Remove spotlight" : "Spotlight for everyone"
              }
            >
              <Star
                className="h-3.5 w-3.5"
                weight={isSpotlighted ? "fill" : "regular"}
              />
            </button>
          )}
          {canManage && (
            <div
              className={
                participant.status === "waiting"
                  ? "flex items-center gap-1"
                  : "hidden group-hover:flex items-center"
              }
            >
              {participant.status === "waiting" ? (
                <>
                  <Button
                    size="sm"
                    disabled={admit.isPending}
                    onClick={() => runAction("admit")}
                    className="h-7 px-2 text-[11px]"
                  >
                    {admit.isPending ? "Approving..." : "Approve"}
                  </Button>
                  <button
                    onClick={() => runAction("reject")}
                    disabled={reject.isPending}
                    className="grid h-6 w-6 place-items-center rounded-sm hover:bg-red-50 text-red-600"
                    title="Reject"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setShowTransferDialog(true)}
                    className="grid h-6 w-6 place-items-center rounded-sm hover:bg-surface-2 text-ink-muted"
                    title="Make Host"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                  </button>
                  {/* One direction only. This used to be a "Toggle audio" button that wrote
                      isTranslationAudioEnabled — whether this person HEARS the translation —
                      while wearing a microphone icon in the host's control cluster. The host
                      pressed it, the participant kept talking, and the transcript kept
                      filling. It mutes now, and says so. */}
                  <button
                    onClick={() => runAction("mute")}
                    disabled={!audioEnabled || muteParticipant.isPending}
                    className="grid h-6 w-6 place-items-center rounded-sm hover:bg-surface-2 text-ink-muted disabled:opacity-40 disabled:hover:bg-transparent"
                    title={audioEnabled ? "Mute microphone" : "Already muted"}
                  >
                    <MicrophoneSlash className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setShowKickDialog(true)}
                    className="grid h-6 w-6 place-items-center rounded-sm hover:bg-red-50 text-red-600"
                    title="Remove"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="bg-surface-1 border-border text-ink rounded-xl sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Transfer Host Role</DialogTitle>
            <DialogDescription className="text-ink-subtle pt-2">
              Transfer host controls to <strong>{participant.displayName}</strong>?
              You will immediately lose host-only controls for this meeting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowTransferDialog(false)}
              className="bg-surface-2 hover:bg-surface-3 text-ink border-border"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void runAction("transfer")}
              disabled={transferHost.isPending}
            >
              {transferHost.isPending ? "Transferring..." : "Transfer Host"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showKickDialog} onOpenChange={setShowKickDialog}>
        <DialogContent className="bg-surface-1 border-border text-ink rounded-xl sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Remove Participant</DialogTitle>
            <DialogDescription className="text-ink-subtle pt-2">
              Are you sure you want to remove{" "}
              <strong>{participant.displayName}</strong>? They will not be able
              to rejoin with the same invitation.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-4">
            <div className="text-[13px] font-medium">Remove scope:</div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="kickScope"
                checked={kickScope === "live"}
                onChange={() => setKickScope("live")}
                className="mt-1 accent-primary"
              />
              <div>
                <div className="text-[13px] font-medium">
                  Remove from Live Meeting Only
                </div>
                <div className="text-[12px] text-ink-subtle">
                  They are kicked from the live call but their chat messages and
                  transcript contributions remain.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer opacity-50">
              <input
                type="radio"
                name="kickScope"
                checked={kickScope === "record"}
                onChange={() => setKickScope("record")}
                disabled
                className="mt-1 accent-primary"
              />
              <div>
                <div className="text-[13px] font-medium">
                  Remove from History & Records (Coming soon)
                </div>
                <div className="text-[12px] text-ink-subtle">
                  Their messages and translations will be redacted from the
                  final artifact.
                </div>
              </div>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowKickDialog(false)}
              className="bg-surface-2 hover:bg-surface-3 text-ink border-border"
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleKick}>
              Remove Participant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * WT-308: one badge, driven by `ParticipantPresence`. A `Record` rather than a chain of
 * ternaries, so adding a presence without giving it a style is a type error instead of a
 * participant silently rendering as somebody who left.
 */
const PRESENCE_STYLES: Record<ParticipantPresence, string> = {
  "in-room": "bg-green-50 text-green-600 border-green-200",
  connected: "bg-green-50 text-green-600 border-green-200",
  lobby: "bg-amber-50 text-amber-600 border-amber-200",
  "not-in-room": "bg-surface-2 text-ink-subtle border-border",
  disconnected: "bg-red-50 text-red-600 border-red-200",
  left: "bg-surface-2 text-ink-subtle border-border",
};

function PresenceBadge({ presence }: { presence: ParticipantPresence }) {
  return (
    <span
      className={`rounded px-1 py-0.5 text-[10px] font-medium border ${PRESENCE_STYLES[presence]}`}
    >
      {PRESENCE_LABELS[presence]}
    </span>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
