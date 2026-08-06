"use client";

import { useEffect, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Clock, Copy, ShieldCheck, Spinner, UserCheck, Users } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BackToSetupButton } from "@/components/rooms/setup/back-to-setup-button";
import { LanguageLabel } from "@/components/language/language-label";
import { getErrorMessage } from "@/lib/errors";
import { roomOccupancy } from "@/lib/room-occupancy";
import { useAuthStore } from "@/stores/auth-store";
import {
  useAdmitParticipant,
  useStartTranslationRoom,
  useTranslationRoom,
  useTranslationRoomParticipants,
} from "@/hooks/use-translationRooms";

export default function WaitingRoomPage() {
  const { id: roomId } = useParams<{ workspaceSlug: string; id: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  // Polled so the lobby notices the host starting without anyone having to reload (WT-232).
  const roomQuery = useTranslationRoom(roomId, 3000);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const startRoom = useStartTranslationRoom();
  const admitParticipant = useAdmitParticipant(roomId);

  const roomStatus = roomQuery.data?.status;
  useEffect(() => {
    // The host is routed by startMeeting() itself; this carries everyone else in once the
    // meeting actually opens, which is the whole point of sitting in a lobby.
    if (roomStatus === "in_progress" || roomStatus === "paused") {
      router.push(`/room/${roomId}`);
    }
  }, [roomStatus, roomId, router]);

  async function startMeeting() {
    try {
      await startRoom.mutateAsync(roomId);
      router.push(`/room/${roomId}`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not start the meeting."));
    }
  }

  async function admit(participantId: string) {
    try {
      await admitParticipant.mutateAsync(participantId);
      toast.success("Participant admitted.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not admit participant."));
    }
  }

  async function copyInvite() {
    const code = roomQuery.data?.translationRoomCode;
    if (!code) return;
    await navigator.clipboard.writeText(`${window.location.origin}/join?code=${encodeURIComponent(code)}`);
    toast.success("Invite link copied.");
  }

  if (roomQuery.isLoading || participantsQuery.isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center text-muted-foreground">
        <Spinner weight="light" className="mr-2 h-5 w-5 animate-spin" />
        Loading waiting room
      </div>
    );
  }

  if (roomQuery.isError || participantsQuery.isError || !roomQuery.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Waiting room unavailable</CardTitle>
          <CardDescription>
            {getErrorMessage(roomQuery.error ?? participantsQuery.error, "Could not load room state.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => Promise.all([roomQuery.refetch(), participantsQuery.refetch()])}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const room = roomQuery.data;
  const isHost = room.hostId === user?.id || room.isHost === true;
  const participants = participantsQuery.data ?? [];
  // WT-274: the lobby uses the same seat rule as every other surface — "Ready" is the people
  // holding a seat, "Waiting approval" is the lobby. It used to accept a "joined" status the
  // backend's participant_status enum does not have.
  const { seated: ready, lobby: waiting } = roomOccupancy({
    capacity: room.maxParticipants,
    participants,
  });
  // The row below each name is that person's OWN speak → listen pair, which is not the room's
  // language coverage: a host auto-added as en → en in a room targeting ["en","vi"] made it
  // look like `vi` had been dropped. The room's declared languages are stated once, here.
  const roomLanguages = room.targetLanguages?.length
    ? room.targetLanguages
    : [room.sourceLanguage].filter(Boolean) as string[];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>{room.title}</CardTitle>
              <CardDescription>Approve participants and confirm readiness before starting.</CardDescription>
              {roomLanguages.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  <span className="text-xs uppercase tracking-wide">Room languages</span>
                  {roomLanguages.map((language) => (
                    <Badge key={language} variant="secondary" className="font-normal">
                      <LanguageLabel value={language} />
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
            <Badge variant="outline">{room.translationRoomCode}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {participants.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No participants have joined yet.
            </p>
          ) : participants.map((participant) => (
            <div key={participant.id} className="flex items-center justify-between gap-3 rounded-lg border p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {(participant.displayName || "P").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{participant.displayName || "Participant"}</p>
                  <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                    <span className="shrink-0 text-xs">Speaks</span>
                    <LanguageLabel value={participant.speakLanguage} />
                    <span aria-hidden>→</span>
                    <span className="shrink-0 text-xs">hears</span>
                    <LanguageLabel value={participant.listenLanguage} />
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={participant.status === "waiting" ? "outline" : "secondary"}>
                  {participant.status}
                </Badge>
                {isHost && participant.status === "waiting" && (
                  <Button
                    size="sm"
                    disabled={admitParticipant.isPending}
                    onClick={() => admit(participant.id)}
                  >
                    Admit
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{isHost ? "Host actions" : "Waiting for the host"}</CardTitle>
            <CardDescription>
              {isHost
                ? "Move from waiting room into the live surface."
                : "You'll be taken in automatically as soon as the host starts the meeting."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {isHost && (
              <Button onClick={startMeeting} disabled={startRoom.isPending}>
                {startRoom.isPending && <Spinner weight="light" className="mr-2 h-4 w-4 animate-spin" />}
                Start meeting
              </Button>
            )}
            <Button variant="outline" onClick={copyInvite} disabled={!room.translationRoomCode}>
              <Copy weight="light" className="mr-2 h-4 w-4" />
              Copy invite
            </Button>
            <BackToSetupButton roomId={roomId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Room signals</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Signal icon={<Users weight="light" />} label="Ready" value={String(ready.length)} />
            <Signal
              icon={<Clock weight="light" />}
              label="Scheduled"
              value={room.scheduledAt ? new Date(room.scheduledAt).toLocaleString() : "Now"}
            />
            <Signal icon={<UserCheck weight="light" />} label="Waiting approval" value={String(waiting.length)} />
            <Signal icon={<ShieldCheck weight="light" />} label="Backend" value="Connected" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Signal({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
