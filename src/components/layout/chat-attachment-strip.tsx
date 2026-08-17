"use client";

/**
 * WT-474 — the attachment row above the WarpBot composer.
 *
 * Shaped after Claude's and Codex's composers, and the shape carries an argument: an image shows a
 * THUMBNAIL because recognising a screenshot by sight is instant and by filename is not, while a
 * document shows a NAME, a type and a size because a PDF preview at 40px tells you nothing. Two
 * chip shapes rather than one, because the two kinds of file are identified differently.
 *
 * The "this message only" line is load-bearing, not decoration. Attachments are deliberately not
 * persisted (see ai_assistant_worker._attach_attachments), so a user who attaches once and then
 * asks a follow-up would otherwise get a confident answer about a file the model never received.
 * The limit is real, so the UI states it rather than letting it be discovered as a wrong answer.
 */

import { FileCsv, FilePdf, FileText, FileCode, X } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import {
  formatAttachmentSize,
  isImageAttachment,
  type ChatAttachment,
} from "@/lib/assistant/attachments";

function documentIcon(mimeType: string): ReactNode {
  if (mimeType === "application/pdf") return <FilePdf size={14} weight="duotone" />;
  if (mimeType === "text/csv") return <FileCsv size={14} weight="duotone" />;
  if (mimeType === "application/json") return <FileCode size={14} weight="duotone" />;
  return <FileText size={14} weight="duotone" />;
}

/** "PDF" / "CSV" / "Markdown" — the label a person uses, not the mime type. */
function typeLabel(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "text/csv":
      return "CSV";
    case "application/json":
      return "JSON";
    case "text/markdown":
      return "Markdown";
    case "text/plain":
      return "Text";
    default:
      return mimeType.split("/").pop()?.toUpperCase() ?? "File";
  }
}

export function ChatAttachmentStrip({
  attachments,
  onRemove,
}: {
  attachments: ChatAttachment[];
  onRemove: (index: number) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="px-1.5 pb-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {attachments.map((attachment, index) => {
          const isImage = isImageAttachment(attachment);

          return (
            <div
              key={`${index}-${attachment.name}-${attachment.size}`}
              className={
                isImage
                  ? "group relative size-12 overflow-hidden rounded-[8px] border border-border"
                  : "group relative flex items-center gap-2 rounded-[8px] border border-border bg-surface-2/60 py-1.5 pl-2 pr-6"
              }
            >
              {isImage ? (
                /* eslint-disable-next-line @next/next/no-img-element -- a base64 data URL that
                   never leaves this component; next/image would need a loader and a remote pattern
                   for something that has no URL at all. */
                <img
                  src={attachment.dataUrl}
                  alt={attachment.name}
                  className="size-full object-cover"
                />
              ) : (
                <>
                  <span className="grid size-7 shrink-0 place-items-center rounded-[6px] bg-surface-1 text-ink-muted">
                    {documentIcon(attachment.mimeType)}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-[150px] truncate text-[12px] font-medium leading-tight text-ink">
                      {attachment.name}
                    </span>
                    <span className="block text-[10px] leading-tight text-ink-subtle">
                      {typeLabel(attachment.mimeType)} ·{" "}
                      {formatAttachmentSize(attachment.size)}
                    </span>
                  </span>
                </>
              )}

              <button
                type="button"
                onClick={() => onRemove(index)}
                title={`Remove ${attachment.name}`}
                className={
                  isImage
                    ? "absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    : "absolute right-1 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-surface-1 hover:text-ink"
                }
              >
                <X size={8} weight="bold" />
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-[10px] text-ink-subtle">
        Sent with this message only — WarpBot cannot see it in later questions.
      </p>
    </div>
  );
}
