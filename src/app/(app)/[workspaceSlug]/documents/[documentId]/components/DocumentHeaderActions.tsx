"use client";

import Link from "next/link";
import { ArrowLeft, Check, X, Download, Spinner } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";

interface DocumentHeaderActionsProps {
  workspaceSlug: string;
  docName: string;
  docStatus: string;
  canApproveDocuments: boolean;
  isPendingApproval: boolean;
  isApproving: boolean;
  isDownloading: boolean;
  onApprove: (approve: boolean) => Promise<void>;
  onDownload: () => Promise<void>;
}

export function DocumentHeaderActions({
  workspaceSlug,
  docName,
  docStatus,
  canApproveDocuments,
  isPendingApproval,
  isApproving,
  isDownloading,
  onApprove,
  onDownload,
}: DocumentHeaderActionsProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-hairline pb-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/${workspaceSlug}/documents`}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-surface-1 text-ink-muted hover:bg-surface-2 transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-foreground truncate max-w-md">{docName}</h1>
            <Badge
              variant="outline"
              className={`text-[9px] font-mono uppercase rounded px-1.5 py-0.5 ${
                docStatus?.toLowerCase() === "public" || docStatus?.toLowerCase() === "active"
                  ? "bg-primary/5 text-primary border-primary/20"
                  : docStatus?.toLowerCase().includes("pending")
                  ? "bg-amber-500/5 text-amber-500 border-amber-500/20"
                  : docStatus?.toLowerCase() === "rejected"
                  ? "bg-destructive/10 text-destructive border-destructive/20"
                  : "bg-surface-3 border-hairline text-ink-muted"
              }`}
            >
              {docStatus}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {canApproveDocuments && isPendingApproval && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onApprove(true)}
              disabled={isApproving}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white px-3 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {isApproving ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              <span>Approve</span>
            </button>
            <button
              onClick={() => onApprove(false)}
              disabled={isApproving}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-destructive hover:bg-destructive/90 text-xs font-semibold text-white px-3 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {isApproving ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              <span>Reject</span>
            </button>
          </div>
        )}
        <button
          onClick={onDownload}
          disabled={isDownloading}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary hover:bg-primary-hover text-xs font-semibold text-white px-3.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
        >
          {isDownloading ? <Spinner className="h-3.5 w-3.5 animate-spin text-white" /> : <Download className="h-3.5 w-3.5" />}
          <span>Download</span>
        </button>
      </div>
    </div>
  );
}
