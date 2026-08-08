"use client";

import { useState } from "react";
import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEndMeetingForAll } from "@/hooks/use-meeting";
import { getErrorMessage } from "@/lib/errors";
import type { TranslationRoomDto } from "@/types/translationRoom";
import { MeetingTimer } from "@/components/rooms/live/meeting-timer";

export function MeetingStageTimer({
  createdAt,
  endedAt,
}: Pick<TranslationRoomDto, "createdAt" | "endedAt">) {
  return (
    <div className="absolute left-4 top-4 z-30 rounded-full border border-border/70 bg-surface-1/90 px-2.5 py-1 text-[12px] font-medium text-ink shadow-sm backdrop-blur">
      <MeetingTimer createdAt={createdAt} endedAt={endedAt} />
    </div>
  );
}

// `MeetingMinimizeControl` lived here — the round button over the video that shrank the call
// into the floating panel (WT-246). Removed at the owner's request. Its entire implementation
// was `router.push` back to the rooms list, because the session lives in the app layout and
// the panel appears on its own for any route that is not the live one; so leaving the room by
// any means still minimises the call, exactly as it did before the button was added.

export function MeetingExitControl({
  room,
  isHost,
  onExit,
}: {
  room: TranslationRoomDto;
  isHost: boolean;
  onExit: (action: "leave" | "end") => void;
}) {
  const endForAll = useEndMeetingForAll(room.id);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Leave meeting"
          className="grid h-12 w-12 place-items-center rounded-full border border-border/50 bg-surface-1/80 text-destructive shadow-sm outline-none backdrop-blur-xl transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <SignOut className="h-[18px] w-[18px]" weight="bold" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="top"
          sideOffset={8}
          className="w-48 rounded-[8px] border-border bg-surface-1 text-ink"
        >
          <DropdownMenuItem
            onClick={() => setShowLeaveDialog(true)}
            className="cursor-pointer hover:bg-surface-2"
          >
            Leave Meeting
          </DropdownMenuItem>
          {isHost ? (
            <DropdownMenuItem
              onClick={() => setShowEndDialog(true)}
              className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              End Meeting for All
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="rounded-xl border-border bg-surface-1 text-ink sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Leave Meeting</DialogTitle>
            <DialogDescription className="pt-2 text-ink-subtle">
              Are you sure you want to leave the meeting?
              {isHost
                ? " You are the active host. The meeting will continue without an active host unless you end it for everyone."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowLeaveDialog(false)}
              className="border-border bg-surface-2 text-ink hover:bg-surface-3"
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => onExit("leave")}>
              Leave Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="rounded-xl border-border bg-surface-1 text-ink sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>End Meeting for All</DialogTitle>
            <DialogDescription className="pt-2 text-ink-subtle">
              This will end the meeting for everyone, kick all participants out,
              and finalize the artifacts and billing. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowEndDialog(false)}
              className="border-border bg-surface-2 text-ink hover:bg-surface-3"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await endForAll.mutateAsync();
                  onExit("end");
                } catch (error: unknown) {
                  toast.error(getErrorMessage(error, "Failed to end meeting"));
                }
              }}
            >
              End for Everyone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
