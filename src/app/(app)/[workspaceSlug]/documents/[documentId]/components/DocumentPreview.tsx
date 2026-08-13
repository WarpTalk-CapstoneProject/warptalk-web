"use client";

/**
 * The document itself, on the page that asks you to approve it.
 *
 * The page used to show a file NAME, a size, a format badge and a Download button — everything
 * about the file except the file. An approver's question is "may this go into the workspace's AI
 * context", and nothing on the screen helped answer it; the only way to read the thing you were
 * approving was to download it and open it in another application.
 *
 * WHAT IS RENDERED, AND WHAT IS NOT
 *   text  — as text. Markdown is shown as its source rather than rendered, deliberately: an
 *           approver is reading it for what it says, and adding a markdown renderer means adding
 *           a dependency and a sanitiser to this page for a formatting nicety. If the team later
 *           wants rendered markdown, that is a separate, deliberate change.
 *   image — as the image.
 *   pdf   — in the browser's own viewer.
 *   other — docx and xlsx are zip archives; there is no honest way to show them without a
 *           converter, so the fallback SAYS it cannot preview rather than showing an empty box.
 *
 * The bytes come from the same endpoint the Download button uses, so what is shown is what will
 * be downloaded — not a separately generated preview that could drift from it.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Download, Spinner, Warning } from "@phosphor-icons/react";

import { WorkspaceService } from "@/services/workspace.service";

/** Extensions we can show without converting anything. */
const TEXT_EXTENSIONS = [
  ".md",
  ".txt",
  ".csv",
  ".json",
  ".log",
  ".xml",
  ".yml",
  ".yaml",
];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"];

/** Big enough for a long report, small enough not to lock the tab up rendering one string. */
const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

type PreviewKind = "text" | "image" | "pdf" | "unsupported";

function previewKind(fileExtension: string): PreviewKind {
  const ext = fileExtension.toLowerCase();
  if (TEXT_EXTENSIONS.includes(ext)) return "text";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  return "unsupported";
}

export function DocumentPreview({
  workspaceId,
  documentId,
  fileName,
  fileExtension,
  sizeBytes,
  onDownload,
}: {
  workspaceId: string;
  documentId: string;
  fileName: string;
  fileExtension: string;
  sizeBytes: number;
  onDownload: () => void;
}) {
  const kind = previewKind(fileExtension);
  const tooLargeToRead = kind === "text" && sizeBytes > MAX_TEXT_PREVIEW_BYTES;
  const canPreview = kind !== "unsupported" && !tooLargeToRead;

  const {
    data: blob,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["workspace-document-preview", workspaceId, documentId],
    queryFn: () => WorkspaceService.downloadDocument(workspaceId, documentId),
    enabled: Boolean(workspaceId) && Boolean(documentId) && canPreview,
    // The bytes of a stored file do not change under us: a document is replaced by uploading a
    // new one, which is a different id.
    staleTime: Infinity,
  });

  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || kind !== "text") return;
    let cancelled = false;
    void blob.text().then((value) => {
      if (!cancelled) setText(value);
    });
    return () => {
      cancelled = true;
    };
  }, [blob, kind]);

  // Object URLs are a leak if they are not revoked, and this page is reachable repeatedly from
  // the list.
  const objectUrl = useMemo(() => {
    if (!blob || (kind !== "image" && kind !== "pdf")) return null;
    return URL.createObjectURL(blob);
  }, [blob, kind]);
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  if (!canPreview) {
    return (
      <PreviewNotice
        title={
          tooLargeToRead
            ? "Too large to preview here"
            : `No preview for ${fileExtension.replace(".", "").toUpperCase() || "this format"} files`
        }
        detail={
          tooLargeToRead
            ? "The file is shown in full when downloaded."
            : "Word and Excel files are archives; showing them here would need a converter. Download it to read it."
        }
        onDownload={onDownload}
        fileName={fileName}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13px] text-ink-muted">
        <Spinner className="h-4 w-4 animate-spin" />
        Loading {fileName}…
      </div>
    );
  }

  if (isError) {
    return (
      <PreviewNotice
        title="Could not read the file"
        detail="The document exists — the server did not return its contents. Downloading may still work."
        onDownload={onDownload}
        fileName={fileName}
      />
    );
  }

  if (kind === "text") {
    return (
      <pre className="w-full overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.7] text-ink">
        {text ?? ""}
      </pre>
    );
  }

  if (kind === "image" && objectUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- an object URL, not a served asset
    return <img src={objectUrl} alt={fileName} className="max-w-full rounded-lg" />;
  }

  if (kind === "pdf" && objectUrl) {
    return (
      <iframe
        src={objectUrl}
        title={fileName}
        className="h-[75vh] w-full rounded-lg border border-hairline"
      />
    );
  }

  return null;
}

function PreviewNotice({
  title,
  detail,
  fileName,
  onDownload,
}: {
  title: string;
  detail: string;
  fileName: string;
  onDownload: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-12">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
        <Warning className="h-4 w-4 text-amber-500" />
        {title}
      </div>
      <p className="max-w-md text-[12px] leading-relaxed text-ink-muted">{detail}</p>
      <button
        type="button"
        onClick={onDownload}
        className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-surface-2"
      >
        <Download className="h-3.5 w-3.5" />
        Download {fileName}
      </button>
    </div>
  );
}
