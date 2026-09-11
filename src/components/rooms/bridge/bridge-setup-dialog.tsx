"use client";

/**
 * The device setup wizard, where the meeting can actually reach it. WT-578.
 *
 * WHAT WAS WRONG
 *   `BridgeSetupWizard` was written in full — three steps, a Homebrew command, a live tone probe —
 *   and its only caller was `/dev/bridge-setup-preview`. In a real EXTERNAL_BRIDGE room the entire
 *   response to "your virtual microphone is missing" was one `toast.error`, which says what is
 *   wrong, stays for four seconds, and offers nothing to do about it. So the one screen that could
 *   fix the problem was reachable only by a developer who knew a URL.
 *
 * WHY A DIALOG AND NOT A PAGE
 *   The devices can drop at any point — a reboot, an app that grabs the driver, an OS update — and
 *   the user is mid-call in Google Meet when it happens. Navigating them out of the meeting to fix
 *   their audio is how you lose the meeting. A dialog opens over the room and closes back into it,
 *   from before Start Translation and from the middle of a live call alike.
 *
 * WHY IT NEVER OPENS ITSELF TWICE
 *   The opening is the caller's decision, not this component's: a dialog that reopened on every
 *   failed device read would fight the user who just dismissed it. See the single-shot ref in
 *   persistent-meeting-session.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BridgeSetupWizard } from "@/components/rooms/bridge/bridge-setup-wizard";

export function BridgeSetupDialog({
  open,
  onOpenChange,
  onReady,
  /**
   * True while translation is already running, which changes what finishing the wizard means.
   *
   * Reopened mid-call the wizard is a repair, not a launch: there is nothing left to start, and a
   * button promising to start it would either do nothing visible or restart a session that is
   * already live.
   */
  translationStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReady: () => void;
  translationStarted: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Wider than the default and scrollable: the wizard is three stacked steps with a device
        table in the last one, and a laptop in a meeting has a short viewport.
      */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Set up your external meeting</DialogTitle>
          <DialogDescription>
            Install the virtual audio devices this meeting needs and point Google Meet at them.
          </DialogDescription>
        </DialogHeader>

        <BridgeSetupWizard
          readyLabel={translationStarted ? "Back to the meeting" : "Start translating"}
          onReady={() => {
            onOpenChange(false);
            onReady();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
