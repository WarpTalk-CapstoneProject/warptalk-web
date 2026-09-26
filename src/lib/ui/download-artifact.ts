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

export function openArtifactDownload(
  payload: ArtifactDownloadPayload,
  options: { asAttachment?: boolean } = {},
) {
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

  /**
   * An anchor rather than a new window, for a link the SERVER has marked as an attachment.
   *
   * `window.open` on such a link opens a tab that downloads and then sits there blank, which reads
   * as something having gone wrong. An anchor click downloads in place with nothing to dismiss.
   *
   * `download` is set to the EMPTY string on purpose. The attribute is what marks the link as a
   * download; its value would be a file name, and the file name is the server's to give — it sends
   * `Content-Disposition: attachment; filename*=UTF-8''…` with the meeting's own title in it, which
   * a value here would override with whatever this client happened to think the file was called.
   * (The attribute's value is ignored cross-origin anyway, so a name set here would be a lie that
   * only shows up on same-origin builds.)
   *
   * Only for `asAttachment`. Without the header, an anchor would navigate the page the reader is
   * standing on to an S3 url, so anything that has not asked the server for an attachment still
   * gets a tab.
   */
  if (options.asAttachment) {
    const anchor = document.createElement("a");
    anchor.href = payload.url;
    anchor.download = "";
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }

  window.open(payload.url, "_blank", "noopener,noreferrer");
}
