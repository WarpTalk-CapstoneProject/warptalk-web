"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Spinner } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { ArtifactContentView } from "@/components/rooms/artifact-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/api/errors";
import { translationRoomService } from "@/services/translation-room.service";
import type { TranslationRoomArtifactDto } from "@/types/translationRoom";

export default function RoomArtifactsPage() {
  const { id: roomId } = useParams<{ workspaceSlug: string; id: string }>();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const artifactsQuery = useQuery({
    queryKey: ["translationRooms", roomId, "artifacts"],
    queryFn: async () => (await translationRoomService.artifacts(roomId)).data,
    enabled: Boolean(roomId),
  });

  async function download(artifact: TranslationRoomArtifactDto) {
    setDownloadingId(artifact.id);
    try {
      if (artifact.consentRequired) {
        await translationRoomService.approveArtifactConsent(artifact.id);
      }
      const { data } = await translationRoomService.artifactDownload(artifact.id);
      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (data.content != null) {
        const blob = new Blob([data.content], { type: data.contentType || "text/plain" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = data.fileName || `${artifact.title}.${artifact.fileFormat ?? "txt"}`;
        anchor.click();
        URL.revokeObjectURL(url);
        return;
      }
      throw new Error("The artifact has no downloadable content.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not download artifact."));
    } finally {
      setDownloadingId(null);
    }
  }

  if (artifactsQuery.isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center text-muted-foreground">
        <Spinner weight="light" className="mr-2 h-5 w-5 animate-spin" />
        Loading artifacts
      </div>
    );
  }

  if (artifactsQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Artifacts unavailable</CardTitle>
          <CardDescription>{getErrorMessage(artifactsQuery.error, "Could not load room artifacts.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => artifactsQuery.refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const artifacts = artifactsQuery.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Post-meeting artifacts</p>
          <h1 className="text-2xl font-semibold tracking-tight">Room artifacts</h1>
          <p className="text-sm text-muted-foreground">Transcript, summaries and recordings produced for this room.</p>
        </div>
        <Badge variant="outline">{artifacts.length} available</Badge>
      </div>

      {artifacts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No artifacts yet</CardTitle>
            <CardDescription>Artifacts appear after processing completes. Refresh to check again.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => artifactsQuery.refetch()}>Refresh</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {artifacts.map((artifact) => {
            const ready = ["ready", "active", "completed"].includes(artifact.status.toLowerCase());
            return (
              <Card key={artifact.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{artifact.title}</CardTitle>
                      <CardDescription>
                        {artifact.type.replaceAll("_", " ")}
                        {artifact.fileSizeBytes ? ` · ${formatBytes(artifact.fileSizeBytes)}` : ""}
                      </CardDescription>
                    </div>
                    <Badge variant={ready ? "default" : "secondary"}>{artifact.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {artifact.content ? (
                    <div className="max-h-64 overflow-auto">
                      <ArtifactContentView content={artifact.content} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText weight="light" className="h-4 w-4" />
                      {artifact.fileFormat?.toUpperCase() ?? "Stored artifact"}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    disabled={!ready || downloadingId === artifact.id}
                    onClick={() => download(artifact)}
                  >
                    {downloadingId === artifact.id
                      ? <Spinner weight="light" className="mr-2 h-4 w-4 animate-spin" />
                      : <Download weight="light" className="mr-2 h-4 w-4" />}
                    {artifact.consentRequired ? "Approve & download" : "Download"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

