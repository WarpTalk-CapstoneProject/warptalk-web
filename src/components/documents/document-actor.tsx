"use client";

import { UserChip } from "@/components/user/user-chip";

interface DocumentActorProps {
  label: "Uploader" | "Approver";
  /**
   * Null when there is nobody to name — the actor left the workspace, or is past the page of
   * members the caller fetched. Both are normal, and the `!member` branch below is the whole
   * answer; findDocumentActor returns null rather than undefined, so it is accepted here too.
   */
  member?: {
    userId?: string | null;
    fullName: string;
    email: string;
    avatarUrl?: string | null;
    roleName?: string | null;
  } | null;
}

export function DocumentActor({ label, member }: DocumentActorProps) {
  if (!member) {
    return (
      <span className="text-[10px] text-ink-muted" title={`${label} unavailable`}>
        {label}: —
      </span>
    );
  }

  const name = member.fullName || member.email;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="hidden text-[9px] uppercase tracking-wide text-ink-muted xl:block">
        {label}
      </span>
      {/* The face and the name are one control now. This was a div with a title attribute — the
          only way to learn anything about the person who uploaded a document was to hover it and
          read back the same name it was already showing. */}
      <UserChip
        user={{
          userId: member.userId,
          name,
          email: member.email,
          avatarUrl: member.avatarUrl,
          role: member.roleName,
        }}
        variant="text"
        size="sm"
        className="max-w-32 text-[10px] text-ink"
      />
    </div>
  );
}
