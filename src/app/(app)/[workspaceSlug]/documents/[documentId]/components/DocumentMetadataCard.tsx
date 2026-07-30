"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface WorkspaceMemberItem {
  userId: string;
  fullName: string;
  email: string;
  roleName: string;
}

interface WorkspaceDocumentData {
  id: string;
  status: string;
  sizeBytes: number;
  fileExtension: string;
  ingestionStatus: string;
  uploadedBy?: string | null;
  createdAt: string;
}

interface DocumentMetadataCardProps {
  doc: WorkspaceDocumentData;
  membersList: WorkspaceMemberItem[];
  formatBytes: (bytes: number) => string;
}

export function DocumentMetadataCard({ doc, membersList, formatBytes }: DocumentMetadataCardProps) {
  const uploaderName = membersList.find((m) => m.userId === doc.uploadedBy)?.fullName || "System / Uploader";

  return (
    <Card className="border-hairline bg-surface-1 shadow-sm">
      <CardHeader className="border-b border-hairline px-5 py-4">
        <CardTitle className="text-sm font-semibold">Document Properties</CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted">Status</span>
          <Badge
            variant="outline"
            className={`text-[9px] font-mono uppercase rounded px-1.5 py-0.5 ${
              doc.status?.toLowerCase() === "public" || doc.status?.toLowerCase() === "active"
                ? "bg-primary/5 text-primary border-primary/20"
                : doc.status?.toLowerCase().includes("pending")
                ? "bg-amber-500/5 text-amber-500 border-amber-500/20"
                : doc.status?.toLowerCase() === "rejected"
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : "bg-surface-3 border-hairline text-ink-muted"
            }`}
          >
            {doc.status}
          </Badge>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted">File Size</span>
          <span className="font-mono text-ink font-semibold">{formatBytes(doc.sizeBytes)}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted">File Format</span>
          <span className="uppercase text-ink font-semibold">{doc.fileExtension.replace(".", "") || "N/A"}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted">Ingestion</span>
          <span className="capitalize text-ink font-semibold">{doc.ingestionStatus.toLowerCase()}</span>
        </div>

        <div className="flex items-center justify-between text-xs border-t border-hairline pt-3">
          <span className="text-ink-muted">Uploaded By</span>
          <span className="text-ink font-semibold">{uploaderName}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-muted">Uploaded At</span>
          <span className="text-ink font-semibold">{new Date(doc.createdAt).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
