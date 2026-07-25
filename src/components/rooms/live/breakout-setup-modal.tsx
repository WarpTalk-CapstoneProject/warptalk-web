"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Shuffle, Trash } from "@phosphor-icons/react/dist/ssr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useStartBreakouts } from "@/hooks/use-breakouts";
import type { TranslationRoomParticipantDto } from "@/types/translationRoom";

interface GroupDraft {
  label: string;
  userIds: string[];
}

/**
 * Host-only breakout room setup: type group labels, assign participants (manual checkboxes
 * per group, or "Split evenly" to auto-distribute everyone), optionally set a countdown, and
 * start. Deliberately simple — no real drag-and-drop, per the scoped-down ticket.
 */
export function BreakoutSetupModal({
  open,
  onOpenChange,
  roomId,
  participants,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  participants: TranslationRoomParticipantDto[];
  onStarted?: () => void;
}) {
  const startBreakouts = useStartBreakouts(roomId);
  const [groups, setGroups] = useState<GroupDraft[]>([
    { label: "Group 1", userIds: [] },
    { label: "Group 2", userIds: [] },
  ]);
  const [durationMinutes, setDurationMinutes] = useState<string>("10");

  function addGroup() {
    setGroups((current) => [...current, { label: `Group ${current.length + 1}`, userIds: [] }]);
  }

  function removeGroup(index: number) {
    setGroups((current) => current.filter((_, i) => i !== index));
  }

  function renameGroup(index: number, label: string) {
    setGroups((current) => current.map((g, i) => (i === index ? { ...g, label } : g)));
  }

  function toggleParticipant(index: number, userId: string, checked: boolean) {
    setGroups((current) =>
      current.map((g, i) => {
        if (i === index) {
          return { ...g, userIds: checked ? [...g.userIds, userId] : g.userIds.filter((id) => id !== userId) };
        }
        // A participant can only belong to one group — selecting them here drops any other assignment.
        return checked ? { ...g, userIds: g.userIds.filter((id) => id !== userId) } : g;
      })
    );
  }

  function splitEvenly() {
    if (groups.length === 0) return;
    const next = groups.map((g) => ({ ...g, userIds: [] as string[] }));
    participants.forEach((participant, i) => {
      next[i % next.length].userIds.push(participant.userId);
    });
    setGroups(next);
  }

  async function handleStart() {
    const nonEmptyGroups = groups.filter((g) => g.userIds.length > 0);
    if (nonEmptyGroups.length === 0) {
      toast.error("Assign at least one participant to a group.");
      return;
    }

    const parsedMinutes = Number(durationMinutes);
    const durationSeconds =
      durationMinutes.trim() && Number.isFinite(parsedMinutes) && parsedMinutes > 0
        ? Math.round(parsedMinutes * 60)
        : undefined;

    try {
      await startBreakouts.mutateAsync({
        groups: nonEmptyGroups.map((g) => ({ label: g.label.trim() || "Group", userIds: g.userIds })),
        durationSeconds,
      });
      toast.success("Breakout rooms started.");
      onOpenChange(false);
      onStarted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start breakout rooms.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-1 border-border text-ink rounded-xl sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Breakout Rooms</DialogTitle>
          <DialogDescription className="text-ink-subtle pt-1">
            Split participants into smaller groups, each with its own room. Everyone returns to the main room when you end breakouts (or the timer runs out).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] text-ink-subtle">
            <span>Duration (minutes, optional)</span>
            <Input
              type="number"
              min={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="h-8 w-20 bg-surface-2 border-border text-ink"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={splitEvenly}
            className="gap-1.5 bg-surface-2 hover:bg-surface-3 text-ink border-border"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Split evenly
          </Button>
        </div>

        <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1">
          {groups.map((group, index) => (
            <div key={index} className="rounded-lg border border-border bg-surface-2/50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Input
                  value={group.label}
                  onChange={(e) => renameGroup(index, e.target.value)}
                  className="h-8 flex-1 bg-surface-1 border-border text-ink text-[13px] font-medium"
                />
                <span className="whitespace-nowrap text-[11px] text-ink-tertiary">{group.userIds.length} assigned</span>
                {groups.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeGroup(index)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle hover:bg-destructive/10 hover:text-destructive"
                    title="Remove group"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              {participants.length === 0 ? (
                <p className="text-[12px] text-ink-tertiary">No participants to assign yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {participants.map((participant) => (
                    <label key={participant.userId} className="flex cursor-pointer items-center gap-2 text-[12px] text-ink">
                      <Checkbox
                        checked={group.userIds.includes(participant.userId)}
                        onCheckedChange={(checked) => toggleParticipant(index, participant.userId, Boolean(checked))}
                      />
                      <span className="truncate">{participant.displayName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addGroup}
          className="w-fit gap-1.5 bg-surface-2 hover:bg-surface-3 text-ink border-border"
        >
          <Plus className="h-3.5 w-3.5" />
          Add group
        </Button>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-surface-2 hover:bg-surface-3 text-ink border-border">
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={startBreakouts.isPending}>
            {startBreakouts.isPending ? "Starting…" : "Start Breakout Rooms"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
