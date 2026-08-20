"use client";

/**
 * What the meetings gave you to do.
 *
 * WHY THIS PAGE EXISTS
 *   Action items were captured and went nowhere — the complaint the review made about the AI
 *   output being impractical, and what every survey of this category reports about the whole
 *   product class. A task that lives only inside the minutes of the meeting that produced it is a
 *   task you have to remember which meeting produced in order to find.
 *
 *   So the list is keyed on the PERSON, not the meeting, and every row names the meeting it came
 *   from: "write the release note" means nothing without it.
 *
 * WHY IT SHOWS DONE AND DROPPED AT ALL
 *   A list that only ever shows outstanding work gives no way to see that something was decided
 *   against rather than forgotten. DROPPED is a real outcome and the filter says so.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare, Square, Spinner, XSquare } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import {
  WorkspaceFilterPill,
  WorkspacePage,
  WorkspaceToolbar,
} from "@/components/workspace/page-chrome";
import { cn } from "@/lib/utils";
import { PagePlaceholder } from "@/components/workspace/page-placeholder";
import { meetingActionItemService } from "@/services/meeting-action-item.service";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { ActionItemStatus, MeetingActionItemDto } from "@/types/meetingActionItem";

type Filter = "OPEN" | "DONE" | "ALL";

export default function WorkspaceTasksPage() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const [filter, setFilter] = useState<Filter>("OPEN");

  const query = useQuery({
    // Every filter shares one fetch. The lists are small and a person's own work is not worth a
    // round trip per pill.
    queryKey: ["action-items", "mine", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => (await meetingActionItemService.mine(workspaceId!)).data,
  });

  const items = useMemo(() => query.data ?? [], [query.data]);
  const openCount = items.filter((item) => item.status === "OPEN").length;

  const shown = useMemo(() => {
    if (filter === "ALL") return items;
    if (filter === "OPEN") return items.filter((item) => item.status === "OPEN");
    return items.filter((item) => item.status !== "OPEN");
  }, [items, filter]);

  async function setStatus(item: MeetingActionItemDto, status: ActionItemStatus) {
    try {
      await meetingActionItemService.updateStatus(item.id, status);
      await query.refetch();
    } catch {
      toast.error("Could not update the item.");
    }
  }

  return (
    <WorkspacePage>
      <WorkspaceToolbar
        filters={
          <>
            <WorkspaceFilterPill
              label="Open"
              selected={filter === "OPEN"}
              onClick={() => setFilter("OPEN")}
              count={openCount}
            />
            <WorkspaceFilterPill
              label="Closed"
              selected={filter === "DONE"}
              onClick={() => setFilter("DONE")}
            />
            <WorkspaceFilterPill
              label="All"
              selected={filter === "ALL"}
              onClick={() => setFilter("ALL")}
            />
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        {query.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-[13px] text-ink-muted">
            <Spinner size={14} className="animate-spin" />
            Loading…
          </div>
        ) : shown.length === 0 ? (
          <PagePlaceholder
            kind="tasks"
            title={
              filter === "OPEN"
                ? "Nothing open"
                : "No tasks in this state yet"
            }
            description={
              filter === "OPEN"
                ? "Every task from your meetings is closed."
                : "Tasks appear here when their meeting records an action item."
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setStatus(item, item.status === "OPEN" ? "DONE" : "OPEN")}
                  aria-label={item.status === "OPEN" ? "Mark done" : "Reopen"}
                  className="mt-[2px] shrink-0 text-ink-subtle hover:text-ink"
                >
                  {item.status === "DONE" ? (
                    <CheckSquare size={16} weight="fill" className="text-semantic-success" />
                  ) : item.status === "DROPPED" ? (
                    <XSquare size={16} className="text-ink-subtle" />
                  ) : (
                    <Square size={16} />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-[13px] text-ink",
                      item.status !== "OPEN" && "text-ink-muted line-through",
                    )}
                  >
                    {item.task}
                  </p>
                  {/* The meeting is what makes a cross-meeting list readable, and it links back
                      to the minutes the commitment is recorded in. */}
                  <Link
                    href={`/${workspaceSlug}/rooms/${item.translationRoomId}/ended`}
                    className="text-[11px] text-ink-subtle hover:text-ink"
                  >
                    {item.roomTitle || "Untitled meeting"}
                  </Link>
                </div>

                {item.status === "OPEN" ? (
                  <button
                    type="button"
                    onClick={() => setStatus(item, "DROPPED")}
                    className="shrink-0 text-[11px] text-ink-subtle hover:text-ink"
                  >
                    Drop
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </WorkspacePage>
  );
}
