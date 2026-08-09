"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { liveMeetingPath } from "@/lib/workspace/workspace-routes";
import { Copy, Spinner } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BackToSetupButton } from "@/components/rooms/setup/back-to-setup-button";
import { DevicePreview } from "@/components/rooms/setup/device-preview";
import { LanguageLabel } from "@/components/language/language-label";
import { useDevicePreview } from "@/hooks/use-device-preview";
import { getErrorMessage } from "@/lib/api/errors";
import { roomOccupancy } from "@/lib/meeting/room-occupancy";
import { useAuthStore } from "@/stores/auth-store";
import {
  useAdmitParticipant,
  useStartTranslationRoom,
  useTranslationRoom,
  useTranslationRoomParticipants,
} from "@/hooks/use-translationRooms";

/**
 * The lobby, rebuilt around the question people actually have here: "do my camera and
 * microphone work, and am I getting in?"
 *
 * What it used to lead with was a roster and a "Room signals" panel reporting Ready /
 * Scheduled / Waiting approval / Backend Connected. That is instrumentation — it answers
 * questions an engineer has while debugging, not the two a participant has thirty seconds
 * before a meeting. The self-view now takes the space the diagnostics had.
 */
export default function WaitingRoomPage() {
  const { workspaceSlug, id: roomId } = useParams<{
    workspaceSlug: string;
    id: string;
  }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  // Polled so the lobby notices the host starting without anyone having to reload (WT-232).
  const roomQuery = useTranslationRoom(roomId, 3000);
  const participantsQuery = useTranslationRoomParticipants(roomId);
  const startRoom = useStartTranslationRoom();
  const admitParticipant = useAdmitParticipant(roomId);

  // Stopped by the hook's cleanup on navigation, so the camera light goes out when the
  // meeting opens rather than staying on behind the live surface.
  const preview = useDevicePreview({ active: true });

  const roomStatus = roomQuery.data?.status;
  useEffect(() => {
    // The host is routed by startMeeting() itself; this carries everyone else in once the
    // meeting actually opens, which is the whole point of sitting in a lobby.
    if (roomStatus === "in_progress" || roomStatus === "paused") {
      router.push(liveMeetingPath(workspaceSlug, roomId));
    }
  }, [roomStatus, workspaceSlug, roomId, router]);

  async function startMeeting() {
    try {
      await startRoom.mutateAsync(roomId);
      router.push(liveMeetingPath(workspaceSlug, roomId));
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
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/join?code=${encodeURIComponent(code)}`,
      );
      toast.success("Invite link copied.");
    } catch {
      toast.error("Could not copy — copy the room code instead.");
    }
  }

  if (roomQuery.isLoading || participantsQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted-foreground">
        <Spinner weight="light" className="mr-2 h-5 w-5 animate-spin" />
        Loading waiting room
      </div>
    );
  }

  if (roomQuery.isError || participantsQuery.isError || !roomQuery.data) {
    return (
      <div className="p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Waiting room unavailable</CardTitle>
            <CardDescription>
              {getErrorMessage(
                roomQuery.error ?? participantsQuery.error,
                "Could not load room state.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => Promise.all([roomQuery.refetch(), participantsQuery.refetch()])}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const room = roomQuery.data;
  const isHost = room.hostId === user?.id || room.isHost === true;
  const participants = participantsQuery.data ?? [];
  const requiresApproval = room.settings?.requiresApproval === true;

  // WT-274: the lobby uses the same seat rule as every other surface — "in the room" is the
  // people holding a seat, the lobby is everyone still waiting on the host.
  const { seated, lobby } = roomOccupancy({
    capacity: room.maxParticipants,
    participants,
  });

  // Whether MY request is still pending, which is the only status a guest cares about.
  const me = participants.find((participant) => participant.userId === user?.id);
  const awaitingApproval = !isHost && me?.status === "waiting";

  // The room's declared coverage, stated once. Each person's own speak → listen pair is a
  // different thing and belongs on their row, not here.
  const roomLanguages = room.targetLanguages?.length
    ? room.targetLanguages
    : ([room.sourceLanguage].filter(Boolean) as string[]);

  return (
    <div className="mx-auto w-full max-w-6xl p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{room.title}</h1>
          {roomLanguages.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {roomLanguages.map((language) => (
                <Badge key={language} variant="secondary" className="font-normal">
                  <LanguageLabel value={language} />
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <Badge variant="outline" className="font-mono">
          {room.translationRoomCode}
        </Badge>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <section aria-label="Check your camera and microphone">
          <DevicePreview preview={preview} displayName={user?.fullName} />
        </section>

        <aside className="space-y-6">
          <Card>
            <CardHeader className="space-y-1.5">
              <CardTitle className="text-lg">
                {isHost
                  ? "Ready when you are"
                  : awaitingApproval
                    ? "Asking to join"
                    : "Waiting for the host"}
              </CardTitle>
              <CardDescription>
                {isHost
                  ? requiresApproval
                    ? "Admit anyone waiting, then start the meeting."
                    : "Start when you are ready — everyone here joins automatically."
                  : awaitingApproval
                    ? "The host has been notified. You'll be let in once they approve."
                    : "You'll be taken in automatically as soon as the host starts."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isHost ? (
                <Button className="w-full" onClick={startMeeting} disabled={startRoom.isPending}>
                  {startRoom.isPending ? (
                    <Spinner weight="light" className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Start meeting
                </Button>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  <Spinner weight="light" className="h-4 w-4 animate-spin" />
                  {awaitingApproval ? "Waiting for approval" : "Waiting for the host to start"}
                </div>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={copyInvite}
                disabled={!room.translationRoomCode}
              >
                <Copy weight="light" className="mr-2 h-4 w-4" />
                Copy invite
              </Button>
              <BackToSetupButton roomId={roomId} />
            </CardContent>
          </Card>

          {/* Only the host can act on these, and only when the room asks for approval. */}
          {isHost && requiresApproval && lobby.length > 0 ? (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">
                  Asking to join ({lobby.length})
                </CardTitle>
                <CardDescription>They cannot hear anything until you admit them.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {lobby.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={participant.displayName} />
                      <p className="truncate text-sm font-medium">
                        {participant.displayName || "Participant"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={admitParticipant.isPending}
                      onClick={() => admit(participant.id)}
                    >
                      Admit
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">In the room ({seated.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {seated.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Nobody else is here yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {seated.map((participant) => (
                    <li key={participant.id} className="flex min-w-0 items-center gap-3">
                      <Avatar name={participant.displayName} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {participant.displayName || "Participant"}
                          {participant.userId === user?.id ? (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              (you)
                            </span>
                          ) : null}
                        </p>
                        {/* An arrow between two identical languages — "English → English" —
                            describes no translation at all, and it is the common case: until
                            someone picks a listen language it defaults to the one they speak.
                            One label is the truthful rendering of that state. */}
                        <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
                          <LanguageLabel value={participant.speakLanguage} />
                          {participant.listenLanguage !== participant.speakLanguage ? (
                            <>
                              <span aria-hidden>→</span>
                              <LanguageLabel value={participant.listenLanguage} />
                            </>
                          ) : null}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Avatar({ name }: { name?: string | null }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
      {(name || "P").slice(0, 1).toUpperCase()}
    </div>
  );
}
