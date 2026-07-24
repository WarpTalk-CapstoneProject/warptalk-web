"use client";

import { useEffect, useRef, useState } from "react";
import { Broadcast, Lock, SignOut, UsersFour } from "@phosphor-icons/react/dist/ssr";
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
import { MeetingTimer } from "@/components/rooms/live/meeting-timer";

export function MeetingTopBar({
  room,
  isHost,
  sourceLanguage,
  targetLanguage,
  onExit,
  warptalkStarted,
  isLocked,
  breakoutInfo,
  onBreakoutFinalMinute,
}: {
  room: TranslationRoomDto;
  isHost: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  onExit: (action: "leave" | "end") => void;
  warptalkStarted: boolean;
  /** WT-04: shows a 🔒 chip when the host has locked the room. */
  isLocked?: boolean;
  /** Breakout rooms (scoped-down): shows a persistent "Breakout: Group X — N:NN remaining"
   * chip while active. null/undefined hides it. */
  breakoutInfo?: { label: string; startedAt: string | null; durationSeconds: number | null } | null;
  /** Fired once, the moment the breakout countdown crosses into its final minute. */
  onBreakoutFinalMinute?: () => void;
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
            <span className="text-ink-tertiary">/</span>
            <MeetingTimer startedAt={room.startedAt} />
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
          {isLocked ? (
            <span
              title="Room is locked — new joiners are blocked"
              className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200"
            >
              <Lock className="h-3 w-3" weight="fill" />
              Locked
            </span>
          ) : null}
          {breakoutInfo ? (
            <BreakoutIndicator
              label={breakoutInfo.label}
              startedAt={breakoutInfo.startedAt}
              durationSeconds={breakoutInfo.durationSeconds}
              onEnterFinalMinute={onBreakoutFinalMinute}
            />
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
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

/**
 * Persistent "Breakout: Group X — N:NN remaining" chip. Ticks its own countdown from
 * startedAt + durationSeconds (same self-ticking pattern as MeetingTimer) rather than relying
 * on the parent to re-render every second. Fires onEnterFinalMinute exactly once when the
 * countdown crosses into its last 60 seconds — the parent uses that to surface a
 * "returning to main room soon" toast.
 */
function BreakoutIndicator({
  label,
  startedAt,
  durationSeconds,
  onEnterFinalMinute,
}: {
  label: string;
  startedAt: string | null;
  durationSeconds: number | null;
  onEnterFinalMinute?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt || !durationSeconds) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt, durationSeconds]);

  const remainingSeconds =
    startedAt && durationSeconds
      ? Math.max(0, Math.floor((new Date(startedAt).getTime() + durationSeconds * 1000 - now) / 1000))
      : null;

  const firedFinalMinuteRef = useRef(false);
  useEffect(() => {
    firedFinalMinuteRef.current = false;
  }, [startedAt, durationSeconds]);
  useEffect(() => {
    if (remainingSeconds !== null && remainingSeconds <= 60 && !firedFinalMinuteRef.current) {
      firedFinalMinuteRef.current = true;
      onEnterFinalMinute?.();
    }
  }, [remainingSeconds, onEnterFinalMinute]);

  const remainingLabel =
    remainingSeconds !== null
      ? `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")} remaining`
      : null;

  return (
    <span
      title="Breakout rooms are in progress"
      className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary border border-primary/20"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      <UsersFour className="h-3 w-3" weight="fill" />
      Breakout: {label}
      {remainingLabel ? ` — ${remainingLabel}` : ""}
    </span>
  );
}
