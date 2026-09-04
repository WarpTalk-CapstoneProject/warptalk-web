"use client";

/**
 * The in-meeting invite dialog. WT-552.
 *
 * The real one lives behind sign-in, a workspace, a running meeting and the host role, which
 * makes "does a mis-typed address actually stop the send?" an expensive question to ask.
 *
 * It renders the SAME component the People tab renders, so the chips, the disabled states and
 * the copy here are the ones a host sees. The invitation query 404s against the fake room id,
 * which is the honest empty case — `participantEmails` is passed in so the "Already here" state
 * is on screen without anyone having to join a meeting. Not linked from anywhere.
 */

import { useState } from "react";
import { InviteToMeetingDialog } from "@/components/rooms/live/side-panel/invite-to-meeting-dialog";
import { Button } from "@/components/ui/button";

export default function InviteToMeetingPreviewPage() {
  const [open, setOpen] = useState(true);

  return (
    <div className="min-h-dvh bg-surface-1 p-8">
      <h1 className="mb-2 text-lg font-semibold text-ink">Invite to this meeting</h1>
      <p className="mb-6 max-w-prose text-[13px] text-ink-subtle">
        Paste{" "}
        <code className="rounded bg-surface-2 px-1">
          here@x.com, new@x.com, new@x.com, nope
        </code>{" "}
        to put all four chip states on screen at once: already here, new, listed twice, and the
        one that blocks the Invite button.
      </p>

      <Button onClick={() => setOpen(true)}>Open the dialog</Button>

      <InviteToMeetingDialog
        open={open}
        onOpenChange={setOpen}
        roomId="00000000-0000-0000-0000-000000000000"
        participantEmails={["here@x.com"]}
        joinLink="https://app.warptalk.io.vn/room/00000000-0000-0000-0000-000000000000"
        onCopyLink={() => {}}
      />
    </div>
  );
}
