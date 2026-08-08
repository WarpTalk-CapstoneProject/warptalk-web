"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Microphone,
  MicrophoneSlash,
  Star,
  UserMinus,
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
import { getErrorMessage } from "@/lib/errors";
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
import { Lumidot } from "lumidot";
import { useTheme } from "next-themes";
import {
  PRESENCE_LABELS,
  participantPresence,
  type ParticipantPresence,
} from "@/lib/room-occupancy";

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
  const lkParticipants = useParticipants();
  const lkParticipantIds = new Set(lkParticipants.map((p) => p.identity));
  const { resolvedTheme } = useTheme();
  const lumidotVariant = resolvedTheme === "dark" ? "white" : "black";
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
      </div>

      <div className="space-y-1">
        {participantsLoading ? (
          <div className="flex items-center gap-2">
            <Lumidot variant={lumidotVariant} pattern="frame" glow={4} />
            <p className="text-[13px] text-ink-subtle">
              Loading participants...
            </p>
          </div>
        ) : null}
        {participantsError ? (
          <p className="text-[13px] text-red-600">
            Could not load participant controls.
          </p>
        ) : null}
        {visibleParticipants.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-[13px] text-ink-subtle">
            No active participants in this room.
          </p>
        ) : (
          visibleParticipants.map((participant) => (
            <ParticipantRow
              key={participant.id}
              participant={participant}
              isHost={isHost}
              roomId={roomId}
              isRoomHost={participant.userId === room.hostId}
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
  roomId,
  isRoomHost,
  isInRoom,
  handRaised,
  isSpotlighted,
  onToggleSpotlight,
}: {
  participant: TranslationRoomParticipantDto;
  isHost: boolean;
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

  const canManage = isHost && !isRoomHost;
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
                  chain. The chain this replaced had no CONNECTED arm, so the host's own
                  row — seeded CONNECTED the moment the room is created — fell through to
                  the `else` and read "Left" while the host was sitting in the meeting. */}
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
