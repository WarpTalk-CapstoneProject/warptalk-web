"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface DocumentActorProps {
  label: "Uploader" | "Approver";
  member?: {
    fullName: string;
    email: string;
    avatarUrl?: string | null;
  };
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
    <div className="flex min-w-0 items-center gap-1.5" title={`${label}: ${name}`}>
      <Avatar size="sm">
        {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt={name} /> : null}
        <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="hidden min-w-0 flex-col xl:flex">
        <span className="text-[9px] uppercase tracking-wide text-ink-muted">{label}</span>
        <span className="max-w-24 truncate text-[10px] font-medium text-ink">{name}</span>
      </div>
    </div>
  );
}
