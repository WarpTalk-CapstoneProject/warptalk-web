"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowClockwise,
  CheckCircle,
  FileText,
  Spinner,
  Star,
  WarningCircle,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/errors";
import { translationRoomService } from "@/services/translationRoom.service";

const TERMINAL_ARTIFACT_STATUSES = new Set([
  "active",
  "completed",
  "deleted",
  "expired",
  "failed",
  "missing",
  "ready",
]);

export default function RoomEndedPage() {
  const { id: roomId, workspaceSlug } = useParams<{ id: string; workspaceSlug: string }>();
  const roomQuery = useQuery({
    queryKey: ["translationRooms", roomId],
    queryFn: async () => (await translationRoomService.get(roomId)).data,
    enabled: Boolean(roomId),
  });
  const artifactsQuery = useQuery({
    queryKey: ["translationRooms", roomId, "artifacts"],
    queryFn: async () => (await translationRoomService.artifacts(roomId)).data,
    enabled: Boolean(roomId),
    refetchInterval: (query) => {
      const artifacts = query.state.data;
      if (!artifacts || artifacts.length === 0) return 5_000;
      return artifacts.some((artifact) => !TERMINAL_ARTIFACT_STATUSES.has(artifact.status.toLowerCase()))
        ? 5_000
        : false;
    },
  });

  if (roomQuery.isLoading || artifactsQuery.isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center text-muted-foreground">
        <Spinner className="mr-2 h-5 w-5 animate-spin" />
        Loading post-meeting status
      </div>
    );
  }

  if (roomQuery.isError || artifactsQuery.isError) {
    const error = roomQuery.error ?? artifactsQuery.error;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Post-meeting status unavailable</CardTitle>
          <CardDescription>
            {getErrorMessage(error, "Could not load the room processing status.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              void roomQuery.refetch();
              void artifactsQuery.refetch();
            }}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const room = roomQuery.data;
  const artifacts = artifactsQuery.data ?? [];
  const isRoomEnded = room?.status === "ended" || room?.status === "cancelled";

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{room?.title || "Meeting"} ended</CardTitle>
              <CardDescription>
                Post-meeting artifacts update automatically while backend processing is running.
              </CardDescription>
            </div>
            <Badge variant={isRoomEnded ? "default" : "secondary"}>
              {room?.status ?? "unknown"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {artifacts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-4">
              <ArrowClockwise className="h-5 w-5 animate-spin text-muted-foreground" />
              <div>
                <p className="font-medium">Waiting for post-meeting artifacts</p>
                <p className="text-sm text-muted-foreground">
                  No artifact has been reported by the backend yet. This page will check again automatically.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {artifacts.map((artifact) => {
                const normalizedStatus = artifact.status.toLowerCase();
                const isReady = ["active", "completed", "ready"].includes(normalizedStatus);
                const isFailed = ["deleted", "expired", "failed", "missing"].includes(normalizedStatus);
                const StatusIcon = isReady ? CheckCircle : isFailed ? WarningCircle : ArrowClockwise;

                return (
                  <div key={artifact.id} className="rounded-xl border bg-background p-4">
                    <StatusIcon
                      className={`mb-3 h-5 w-5 ${!isReady && !isFailed ? "animate-spin" : ""}`}
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{artifact.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {artifact.type.replaceAll("_", " ")}
                        </p>
                      </div>
                      <Badge variant={isReady ? "default" : isFailed ? "destructive" : "secondary"}>
                        {artifact.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href={`/${workspaceSlug}/rooms/${roomId}/artifacts`}
          className="inline-flex h-8 items-center justify-center rounded-full bg-foreground px-3 text-sm font-medium text-background transition hover:bg-foreground/90"
        >
          <FileText className="mr-2 h-4 w-4" />
          Open artifacts
        </Link>
        <Link
          href={`/feedback?roomId=${encodeURIComponent(roomId)}`}
          className="inline-flex h-8 items-center justify-center rounded-full border border-border px-3 text-sm font-medium transition hover:bg-muted"
        >
          <Star className="mr-2 h-4 w-4" />
          Submit feedback
        </Link>
        <Link
          href={`/${workspaceSlug}/history`}
          className="inline-flex h-8 items-center justify-center rounded-full border border-border px-3 text-sm font-medium transition hover:bg-muted"
        >
          View history
        </Link>
      </div>
    </div>
  );
}
