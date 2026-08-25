"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface DocumentActorProps {
  label: "Uploader" | "Approver";
  /**
   * Null when there is nobody to name — the actor left the workspace, or is past the page of
   * members the caller fetched. Both are normal, and the `!member` branch below is the whole
   * answer; findDocumentActor returns null rather than undefined, so it is accepted here too.
   */
  member?: {
    fullName: string;
    email: string;
    avatarUrl?: string | null;
  } | null;
  showLabel?: boolean;
}

export function DocumentActor({
  label,
  member,
  showLabel = true,
}: DocumentActorProps) {
  if (!member) {
    if (!showLabel) {
      return (
        <span
          className="text-[11px] font-medium text-ink-muted"
          title={`${label} unavailable`}
        >
          -
        </span>
      );
    }

    return (
      <span
        className="text-[10px] text-ink-muted"
        title={`${label} unavailable`}
      >
        {label}: -
      </span>
    );
  }

  const name = member.fullName || member.email;
  return (
    <div
      className="flex min-w-0 items-center gap-1.5"
      title={`${label}: ${name}`}
    >
      <Avatar size="sm">
        {member.avatarUrl ? (
          <AvatarImage src={member.avatarUrl} alt={name} />
        ) : null}
        <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="hidden min-w-0 flex-col xl:flex">
        {showLabel ? (
          <span className="text-[9px] uppercase tracking-wide text-ink-muted">
            {label}
          </span>
        ) : null}
        <span className="max-w-24 truncate text-[10px] font-medium text-ink">
          {name}
        </span>
      </div>
    </div>
  );
}
