"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Microphone, MicrophoneSlash, UserCheck, UserMinus, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useKickMeetingParticipant,
  useTransferMeetingHost,
  useRejectMeetingParticipant,
} from "@/hooks/use-meeting";
import { useAdmitParticipant, useUpdateParticipantAudio } from "@/hooks/use-translationRooms";
import type { TranslationRoomDto, TranslationRoomParticipantDto } from "@/types/translationRoom";
import { useParticipants } from "@livekit/components-react";
import { Lumidot } from "lumidot";
import { useTheme } from "next-themes";

export function PeoplePanel({
  roomId,
  room,
  isHost,
  participants,
  participantsLoading,
  participantsError,
  onCopyText,
  joinLink,
}: {
  roomId: string;
  room: TranslationRoomDto;
  isHost: boolean;
  participants: TranslationRoomParticipantDto[];
  participantsLoading: boolean;
  participantsError: boolean;
  activeCount: number;
  onCopyText: (value: string, label: string) => void;
  joinLink: string;
}) {
  const lkParticipants = useParticipants();
  const lkParticipantIds = new Set(lkParticipants.map(p => p.identity));
  const { resolvedTheme } = useTheme();
  const lumidotVariant = resolvedTheme === "dark" ? "white" : "black";

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-canvas p-3">
        <p className="text-[12px] font-medium text-ink-subtle">Room Code</p>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold tracking-wide text-ink">{room.translationRoomCode}</span>
          <button onClick={() => onCopyText(joinLink, "Invite link")} className="text-[12px] font-medium text-primary hover:text-primary-hover">
            Copy Link
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {participantsLoading ? <div className="flex items-center gap-2"><Lumidot variant={lumidotVariant} pattern="frame" glow={4} /><p className="text-[13px] text-ink-subtle">Loading participants...</p></div> : null}
        {participantsError ? <p className="text-[13px] text-red-600">Could not load participant controls.</p> : null}
        {participants.map((participant) => (
          <ParticipantRow
            key={participant.id}
            participant={participant}
            isHost={isHost}
            roomId={roomId}
            isRoomHost={participant.userId === room.hostId}
            isInRoom={lkParticipantIds.has(participant.userId)}
          />
        ))}
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
}: {
  participant: TranslationRoomParticipantDto;
  isHost: boolean;
  roomId: string;
  isRoomHost: boolean;
  isInRoom: boolean;
}) {
  const updateAudio = useUpdateParticipantAudio(roomId);
  const admit = useAdmitParticipant(roomId);
  const reject = useRejectMeetingParticipant(roomId);
  const kickLivekit = useKickMeetingParticipant(roomId);
  const transferHost = useTransferMeetingHost(roomId);
  
  const canManage = isHost && !isRoomHost;
  const audioEnabled = participant.isTranslationAudioEnabled ?? true;

  const [showKickDialog, setShowKickDialog] = useState(false);
  const [kickScope, setKickScope] = useState<"live" | "record">("live");

  async function runAction(action: "audio" | "admit" | "reject" | "transfer") {
    try {
      if (action === "audio") {
        await updateAudio.mutateAsync({
          participantId: participant.id,
          isTranslationAudioEnabled: !audioEnabled,
        });
        toast.success("Participant audio route updated.");
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
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    }
  }

  async function handleKick() {
    try {
      await kickLivekit.mutateAsync(participant.userId);
      toast.success("Participant removed from meeting.");
      setShowKickDialog(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to kick participant.");
    }
  }

  return (
    <>
      <div className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-canvas">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-primary/10 text-[10px] font-bold text-primary">
            {initials(participant.displayName)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[13px] font-medium text-ink">{participant.displayName}</p>
              {participant.isExternal && (
                <span className="rounded bg-surface-2 px-1 py-0.5 text-[10px] font-medium text-ink-subtle border border-border">External</span>
              )}
              {isInRoom ? (
                <span className="rounded bg-green-50 px-1 py-0.5 text-[10px] font-medium text-green-600 border border-green-200">In Room</span>
              ) : participant.status === "invited" ? (
                <span className="rounded bg-surface-2 px-1 py-0.5 text-[10px] font-medium text-ink-subtle border border-border">Not in room</span>
              ) : participant.status === "waiting" ? (
                <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-600 border border-amber-200">Waiting in Lobby</span>
              ) : participant.status === "disconnected" ? (
                <span className="rounded bg-red-50 px-1 py-0.5 text-[10px] font-medium text-red-600 border border-red-200">Disconnected</span>
              ) : (
                <span className="rounded bg-surface-2 px-1 py-0.5 text-[10px] font-medium text-ink-subtle border border-border">Left</span>
              )}
            </div>
            <p className="truncate text-[11px] text-ink-subtle capitalize">
              {participant.role.toString().toLowerCase()}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="grid h-6 w-6 place-items-center rounded-sm bg-canvas text-ink-subtle group-hover:hidden">
            {audioEnabled ? <Microphone className="h-3.5 w-3.5" /> : <MicrophoneSlash className="h-3.5 w-3.5" />}
          </span>
          {canManage && (
            <div className="hidden group-hover:flex items-center">
              {participant.status === "waiting" ? (
                <>
                  <button onClick={() => runAction("admit")} className="grid h-6 w-6 place-items-center rounded-sm hover:bg-surface-2 text-ink-muted" title="Admit">
                    <UserCheck className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => runAction("reject")} className="grid h-6 w-6 place-items-center rounded-sm hover:bg-red-50 text-red-600" title="Reject">
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => runAction("transfer")} className="grid h-6 w-6 place-items-center rounded-sm hover:bg-surface-2 text-ink-muted" title="Make Host">
                    <CheckCircle className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => runAction("audio")} className="grid h-6 w-6 place-items-center rounded-sm hover:bg-surface-2 text-ink-muted" title="Toggle audio">
                    {audioEnabled ? <MicrophoneSlash className="h-3.5 w-3.5" /> : <Microphone className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => setShowKickDialog(true)} className="grid h-6 w-6 place-items-center rounded-sm hover:bg-red-50 text-red-600" title="Remove">
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showKickDialog} onOpenChange={setShowKickDialog}>
        <DialogContent className="bg-surface-1 border-border text-ink rounded-xl sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Remove Participant</DialogTitle>
            <DialogDescription className="text-ink-subtle pt-2">
              Are you sure you want to remove <strong>{participant.displayName}</strong>? They will not be able to rejoin with the same invitation.
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
                <div className="text-[13px] font-medium">Remove from Live Meeting Only</div>
                <div className="text-[12px] text-ink-subtle">They are kicked from the live call but their chat messages and transcript contributions remain.</div>
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
                <div className="text-[13px] font-medium">Remove from History & Records (Coming soon)</div>
                <div className="text-[12px] text-ink-subtle">Their messages and translations will be redacted from the final artifact.</div>
              </div>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKickDialog(false)} className="bg-surface-2 hover:bg-surface-3 text-ink border-border">Cancel</Button>
            <Button variant="destructive" onClick={handleKick}>Remove Participant</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
