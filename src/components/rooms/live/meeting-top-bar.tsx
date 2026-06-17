"use client";

import { useState } from "react";
import { Broadcast, Stop, Play, SignOut } from "@phosphor-icons/react/dist/ssr";
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
import { getLanguageName } from "@/lib/languages";
import type { TranslationRoomDto } from "@/types/translationRoom";

export function MeetingTopBar({
  room,
  isHost,
  sourceLanguage,
  targetLanguage,
  onExit,
  warptalkStarted,
  onStartWarptalk,
  onStopWarptalk,
}: {
  room: TranslationRoomDto;
  isHost: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  onExit: (action: "leave" | "end") => void;
  warptalkStarted: boolean;
  onStartWarptalk: () => void;
  onStopWarptalk: () => void;
}) {
  const endForAll = useEndMeetingForAll(room.id);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);

  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <Broadcast className="h-4 w-4 text-ink-subtle" />
            <span className="max-w-[200px] truncate">{room.title}</span>
            <span className="text-ink-tertiary">/</span>
            <span className="text-ink-subtle">
              {getLanguageName(sourceLanguage)} to {getLanguageName(targetLanguage)}
            </span>
          </div>
          <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${warptalkStarted ? "bg-red-50 text-red-600" : "bg-surface-2 text-ink-subtle"}`}>
            <div className={`h-1.5 w-1.5 rounded-full ${warptalkStarted ? "bg-destructive" : "bg-slate-400"}`} />
            {warptalkStarted ? "Live Translation" : "Translation Ready"}
          </div>
          {isHost ? (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-subtle border border-border">
              Host
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isHost && (
            <button
              type="button"
              onClick={warptalkStarted ? onStopWarptalk : onStartWarptalk}
              className={`flex h-7 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium transition-colors shadow-sm ${
                warptalkStarted
                  ? "bg-surface-3 text-ink hover:bg-surface-4"
                  : "bg-primary text-white hover:bg-primary-hover"
              }`}
            >
              {warptalkStarted ? <Stop className="h-3.5 w-3.5" weight="fill" /> : <Play className="h-3.5 w-3.5" weight="fill" />}
              {warptalkStarted ? "Stop Translation" : "Start Translation"}
            </button>
          )}
          <div className="h-4 w-[1px] bg-surface-3 mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-destructive transition-colors hover:bg-destructive/10 outline-none"
            >
              <SignOut className="h-4 w-4" weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-surface-1 border-border rounded-[8px] text-ink">
              <DropdownMenuItem onClick={() => setShowLeaveDialog(true)} className="cursor-pointer hover:bg-surface-2">
                Leave Meeting
              </DropdownMenuItem>
              {isHost && (
                <DropdownMenuItem onClick={() => setShowEndDialog(true)} className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer">
                  End Meeting for All
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Leave Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="bg-surface-1 border-border text-ink rounded-xl sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Leave Meeting</DialogTitle>
            <DialogDescription className="text-ink-subtle pt-2">
              Are you sure you want to leave the meeting?
              {isHost && " You are the active host. The meeting will continue without an active host unless you end it for everyone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)} className="bg-surface-2 hover:bg-surface-3 text-ink border-border">Cancel</Button>
            <Button variant="destructive" onClick={() => onExit("leave")}>Leave Room</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* End Dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="bg-surface-1 border-border text-ink rounded-xl sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>End Meeting for All</DialogTitle>
            <DialogDescription className="text-ink-subtle pt-2">
              This will end the meeting for everyone, kick all participants out, and finalize the artifacts and billing. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowEndDialog(false)} className="bg-surface-2 hover:bg-surface-3 text-ink border-border">Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              try {
                await endForAll.mutateAsync();
                onExit("end");
              } catch (e: any) {
                toast.error(e.message || "Failed to end meeting");
              }
            }}>End for Everyone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
