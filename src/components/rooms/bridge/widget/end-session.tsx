"use client";

/**
 * SLOT: the header actions of the Meet widget (right end of the header row). Owner: WT-525 t3.
 *
 * CONTRACT
 *   `export function EndSessionButton()` — no props; read from `useBridgeWidget()`.
 *   The one exit in a bridge room: "End", with a confirmation, which ends the WarpTalk session
 *   (not the Google Meet call) and then calls `markEnded()` so the shell swaps the tabs and dock
 *   for `EndedView`. The shell does not render this slot once `ended` is true.
 *
 * WHY THERE IS NO LEAVE
 *   Leave only marks the host LEFT. In a bridge room the stand-in seat never disconnects, so the
 *   room would stay open — translating, billing and holding its LiveKit room — with nobody who
 *   can see it. End is the only way out that actually closes anything, so it is the only one
 *   offered. check-bridge-overlay-contract.mjs fails the build if a Leave appears in this folder.
 *
 * WHAT END DOES: PATH A, THE SAME TWO CALLS AS "END MEETING FOR ALL"
 *   MeetingExitControl (meeting-top-bar.tsx) and handleExit("end") (persistent-meeting-session)
 *   together make these two calls, in this order, and so does this:
 *     1. useEndMeetingForAll — MeetingService deletes the LiveKit room and publishes the
 *        `__MEETING_END__` sentinel that makes the AI worker write the summary;
 *     2. useEndTranslationRoom — the room becomes ENDED and finalization (billing, artifacts)
 *        runs.
 *   Only the first is not enough: the room would stay IN_PROGRESS with nothing in it. Only the
 *   second is not enough either: nothing would tell the summary worker the meeting is over.
 *
 * WHY A POPOVER AND NOT THE APP'S DIALOG
 *   The window is 460px wide and floats over the user's call. A modal that dims the whole window
 *   for a two-button question hides the transcript they may want to glance at before deciding; a
 *   popover anchored to the button says the same thing where they were already looking. It is
 *   still a dialog to assistive tech (the popover primitive gives it role=dialog), and Escape and
 *   a click outside both close it.
 */

import { useRef, useState } from "react";
import { SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useEndMeetingForAll } from "@/hooks/use-meeting";
import { useEndTranslationRoom } from "@/hooks/use-translationRooms";
import { getErrorMessage } from "@/lib/api/errors";
import { canJoinTranslationRoom } from "@/lib/meeting/translation-room-access";
import { cn } from "@/lib/utils";

import { useBridgeWidget } from "./widget-context";

export function EndSessionButton() {
  const { roomId, room, isHost, markEnded } = useBridgeWidget();
  const endForAll = useEndMeetingForAll(roomId);
  const endRoom = useEndTranslationRoom();
  const [open, setOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  /**
   * Whether step 1 has already landed from this window.
   *
   * If step 2 fails, pressing End again must not repeat step 1: the LiveKit room is already gone
   * (a second delete is harmless), but a second `__MEETING_END__` asks the AI worker for a second
   * summary of the same meeting.
   */
  const meetingEndedRef = useRef(false);

  // A non-host bridge participant should not exist — the room has the host and the stand-in — and
  // both endpoints refuse anybody else. Nothing rather than a button that can only fail.
  if (!isHost) return null;

  async function endSession() {
    if (ending) return;
    setEnding(true);
    try {
      // Already over — ended from the main window, or reaped. There is nothing to end, and
      // sending step 1 again would ask for another summary; the widget just says so.
      const alreadyOver = room !== undefined && !canJoinTranslationRoom(room.status);

      if (!alreadyOver) {
        if (!meetingEndedRef.current) {
          try {
            await endForAll.mutateAsync();
            meetingEndedRef.current = true;
          } catch (error) {
            // MeetingExitControl's handling: nothing has changed yet, so say why and stop.
            toast.error(getErrorMessage(error, "Failed to end meeting"));
            return;
          }
        }

        try {
          await endRoom.mutateAsync(roomId);
        } catch (error) {
          // handleExit's handling, with the message helper MeetingExitControl uses (an axios
          // error's own `message` is "Request failed with status code 409"). The popover stays
          // open so End can be pressed again; `meetingEndedRef` keeps that retry to step 2.
          toast.error(getErrorMessage(error, "Failed to end the WarpTalk session"));
          return;
        }
      }

      // No success toast: EndedView replacing the whole window IS the confirmation, and a toast
      // on top of it would say the same thing twice in 460px.
      setOpen(false);
      markEnded();
    } finally {
      setEnding(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Not while ending: a click outside mid-request would hide the only place a failure is
        // explained, with the request still running behind it.
        if (!next && ending) return;
        setOpen(next);
      }}
    >
      <PopoverTrigger
        className={cn(
          // A small text button, not a DockIconButton: an icon for "end" is a hang-up or a door,
          // and either one, sitting above Meet's own red hang-up, reads as leaving the call.
          "h-7 rounded-md border border-border bg-surface-1 px-2.5 text-xs font-semibold text-ink transition-colors",
          "hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          "aria-expanded:bg-surface-3",
        )}
      >
        End
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        // Narrower than the primitive default so it fits a 320px-wide window with its margin.
        className="w-[272px] gap-2 border-border bg-surface-1 p-3 text-ink"
      >
        <PopoverTitle className="text-[13px] font-semibold text-ink">
          End WarpTalk session?
        </PopoverTitle>
        <PopoverDescription className="text-xs leading-relaxed text-ink-muted">
          {/* WT-587: an ephemeral room saves nothing, and promising a saved transcript there is
              the one sentence on this screen the system would not keep. */}
          {room?.settings?.saveTranscript === false
            ? "Translation stops. Nothing from this meeting is saved. Your Google Meet call keeps going."
            : "Translation stops and the transcript and summary are saved. Your Google Meet call keeps going."}
        </PopoverDescription>
        <div className="mt-1 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={ending}
            className="border-border bg-surface-2 text-ink hover:bg-surface-3"
          >
            Cancel
          </Button>
          {/* The app's destructive variant — a red wash with red text, not a filled red block. The
              same reason as dock-icon-button.tsx: this window sits right above Meet's filled red
              hang-up, and nothing in it should look like that button. */}
          <Button variant="destructive" size="sm" onClick={() => void endSession()} disabled={ending}>
            {ending ? <SpinnerGap size={13} className="animate-spin" aria-hidden="true" /> : null}
            End session
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
