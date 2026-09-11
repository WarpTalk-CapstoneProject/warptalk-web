"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * WT-605. The one thing a host is asked before the record stops.
 *
 * ONLY ON THE WAY IN — RESUMING IS NOT ASKED ABOUT
 *   The two directions are not symmetrical. Pausing gives up speech that is happening right now
 *   and cannot be recovered afterwards; resuming only starts writing again, costs nothing, and
 *   loses nothing if it was a mis-click. A dialog on that side would be a keystroke charged for
 *   nothing, and paid every time — which is how people learn to dismiss this one without reading
 *   it. See handleToggleTranscriptPause, which is where the asymmetry is enforced.
 *
 * ONE SENTENCE, AND WHY IT IS THE ONE
 *   This is the only moment a host is warned before losing data, so the sentence has to carry both
 *   halves of the ruling of 2026-09-10 and nothing else. The first half is the loss and its full
 *   extent — not "not shown", not "paused", but nothing written and nothing stored, because a host
 *   who believes the words are being kept somewhere and merely hidden will pause a conversation
 *   they needed. The second half is what does NOT stop, because a host who thinks pausing takes
 *   the meeting down with it will never press this at all, and WT-605 introduced a separate event
 *   pair precisely so the two could not be confused.
 *
 *   A paragraph explaining both would not be read at the moment it is shown; the product owner
 *   asked for a single sentence, and this is the shortest one that still says both.
 *
 * The confirm button names the ACTION rather than agreeing with the question. "OK" under a
 * yes/no title is answered by muscle memory; "Pause transcript" is the last chance to notice which
 * of the two switches is about to move.
 */
export function TranscriptPauseConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** A pause/resume request is already in flight — see the control's own pending state. */
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl border-border bg-surface-1 text-ink sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Pause the transcript?</DialogTitle>
          <DialogDescription className="pt-2 text-ink-subtle">
            Nothing said from now on is written to the transcript or stored — translation,
            dubbing and voice clone keep running.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border bg-surface-2 text-ink hover:bg-surface-3"
          >
            Cancel
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            Pause transcript
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
