"use client";

/**
 * The right-hand panel's contents: who is in this workspace, and who is around right now.
 *
 * What was here before was a placeholder that never became anything — a header reading
 * "Properties" above the sentence "Select an item to view its properties and actions", with no
 * page anywhere publishing an item for it to describe. It was 260px of furniture that had been
 * waiting for a feature since it was written.
 *
 * Members is what the space is worth spending on: presence is the one fact that changes while
 * you are looking at it, and it belongs beside the work rather than behind a click on the
 * Members page. Online first — a roster sorted by name buries the two people you could actually
 * talk to under twenty who are not there.
 *
 * NOT the Members page in miniature. There is no invite, no role editing, no removal here: those
 * are decisions, they have a page, and a 260px column is the wrong place to make one by mistake.
 * A row links to that page instead.
 */

import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarPresenceDot, PresenceLabel } from "@/components/presence/presence-dot";
import { usePresence } from "@/hooks/use-presence";
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { usePresenceStore } from "@/stores/presence-store";
import type { PresenceState } from "@/types/presence";
import type { WorkspaceMemberDto } from "@/types/workspace";

/** One request for the whole roster, so a member row costs nothing extra. */
const PANEL_PAGE_SIZE = 100;

export function WorkspaceMembersPanel({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string | null;
  workspaceSlug: string | null;
}) {
  const membersQuery = useWorkspaceMembers(workspaceId ?? undefined, 1, PANEL_PAGE_SIZE);
  const members = membersQuery.data?.items ?? [];

  usePresence(members.map((member) => member.userId));
  const presenceStates = usePresenceStore((store) => store.states);

  // Online first, then by name. Sorting purely by name is what makes a roster useless: the
  // people you can reach right now are scattered through it.
  const ordered = [...members].sort((a, b) => {
    const aOnline = isAround(presenceStates[a.userId]);
    const bOnline = isAround(presenceStates[b.userId]);
    if (aOnline !== bOnline) return aOnline ? -1 : 1;
    return (a.fullName || a.email).localeCompare(b.fullName || b.email);
  });

  const onlineCount = members.filter((member) => isAround(presenceStates[member.userId])).length;

  if (!workspaceId) {
    return (
      <p className="text-[12px] text-ink-muted">
        Pick a workspace to see who is in it.
      </p>
    );
  }

  if (membersQuery.isLoading) {
    return <p className="text-[12px] text-ink-muted">Loading members…</p>;
  }

  if (membersQuery.isError) {
    // Distinct from an empty workspace on purpose: "nobody is here" and "we could not ask" lead
    // to opposite conclusions.
    return (
      <p className="text-[12px] text-ink-muted">
        Could not load the member list.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-ink-subtle">
        {onlineCount > 0
          ? `${onlineCount} of ${members.length} around now`
          : `${members.length} member${members.length === 1 ? "" : "s"}`}
      </p>

      <ul className="flex flex-col gap-0.5">
        {ordered.map((member) => (
          <MemberRow key={member.id} member={member} workspaceSlug={workspaceSlug} />
        ))}
      </ul>
    </div>
  );
}

function MemberRow({
  member,
  workspaceSlug,
}: {
  member: WorkspaceMemberDto;
  workspaceSlug: string | null;
}) {
  const row = (
    <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-2">
      <div className="relative size-7 shrink-0">
        <Avatar className="size-7 rounded-lg border border-border/50">
          <AvatarImage src={member.avatarUrl ?? undefined} alt={member.fullName} />
          <AvatarFallback className="rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
            {(member.fullName || member.email).charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <AvatarPresenceDot userId={member.userId} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] text-ink">{member.fullName || member.email}</p>
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[11px] capitalize text-ink-muted">
            {member.roleName?.toLowerCase() || "member"}
          </span>
          <PresenceLabel userId={member.userId} />
        </div>
      </div>
    </div>
  );

  if (!workspaceSlug) return <li>{row}</li>;

  return (
    <li>
      <Link href={`/${workspaceSlug}/members`} className="block">
        {row}
      </Link>
    </li>
  );
}

/** "Around" is anyone not Offline — being in a meeting still means they are here. */
function isAround(state: PresenceState | undefined) {
  return state === "Online" || state === "InMeeting";
}
