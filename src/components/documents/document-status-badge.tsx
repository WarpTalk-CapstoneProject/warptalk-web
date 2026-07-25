"use client";

import React from "react";
import { CheckCircle, Loader2, AlertCircle, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type DocumentStatus = "uploading" | "processing" | "transcribing" | "ready" | "completed" | "failed" | "error";

interface DocumentStatusBadgeProps {
  status: DocumentStatus | string;
  progressPercent?: number;
}

export function DocumentStatusBadge({ status, progressPercent }: DocumentStatusBadgeProps) {
  const normalizedStatus = (status || "ready").toLowerCase();

  if (normalizedStatus === "uploading") {
    return (
      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30 gap-1.5 text-[11px] font-medium">
        <UploadCloud className="h-3 w-3 animate-bounce" />
        <span>Uploading {progressPercent !== undefined ? `${progressPercent}%` : ""}</span>
      </Badge>
    );
  }

  if (normalizedStatus === "processing" || normalizedStatus === "transcribing") {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 gap-1.5 text-[11px] font-medium">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Processing {progressPercent !== undefined ? `${progressPercent}%` : ""}</span>
      </Badge>
    );
  }

  if (normalizedStatus === "failed" || normalizedStatus === "error") {
    return (
      <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 gap-1.5 text-[11px] font-medium">
        <AlertCircle className="h-3 w-3" />
        <span>Failed</span>
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 gap-1.5 text-[11px] font-medium">
      <CheckCircle className="h-3 w-3" />
      <span>Ready</span>
    </Badge>
  );
}
