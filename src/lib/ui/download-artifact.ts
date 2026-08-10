import apiClient from "@/lib/api/client";

export interface ArtifactDownloadPayload {
  url?: string | null;
  content?: string | null;
  fileName: string;
  contentType: string;
}

export function saveBlobDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadAuthenticatedFile(
  path: string,
  fileName: string,
) {
  const { data } = await apiClient.get<Blob>(path, {
    responseType: "blob",
  });
  saveBlobDownload(data, fileName);
}

export function openArtifactDownload(payload: ArtifactDownloadPayload) {
  if (payload.content != null) {
    saveBlobDownload(
      new Blob([payload.content], { type: payload.contentType }),
      payload.fileName,
    );
    return;
  }

  if (!payload.url) {
    throw new Error("The artifact content is unavailable.");
  }

  window.open(payload.url, "_blank", "noopener,noreferrer");
}
