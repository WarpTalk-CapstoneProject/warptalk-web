"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { SpinnerGap } from "@phosphor-icons/react/dist/ssr";

import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * WT-364 — `/rooms/{id}`, the address notifications have been sending people to.
 *
 * `ArtifactsFinalizationWorker` builds `{frontendBaseUrl}/rooms/{room.Id}` for the
 * "your summary is ready" notification. Every workspace URL carries a slug, so the real page is
 * `/{slug}/rooms/{id}` and this one simply did not exist: clicking the notification produced a
 * bare 404, with no hint that the meeting was fine and only the link was wrong.
 *
 * Fixing the worker is not enough on its own. Notifications already sent carry the old URL, they
 * sit in people's inboxes for as long as the retention allows, and a link that 404s forever is
 * exactly what this ticket is about. So the address is made to work rather than merely stopped
 * from being minted.
 *
 * It lands on the room DETAIL page, not `/live` like the singular `/room/{id}` redirect beside
 * it: this notification fires when a meeting's artifacts are finished, so the summary is what
 * the reader came for and the meeting is over.
 */
export default function LegacyRoomsRedirectPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const router = useRouter();
  const workspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);

  useEffect(() => {
    // Without a workspace open there is no room to show, so the picker is the honest
    // destination — the same choice the singular redirect makes.
    router.replace(
      workspaceSlug ? `/${workspaceSlug}/rooms/${roomId}` : "/workspace",
    );
  }, [router, roomId, workspaceSlug]);

  return (
    <div className="grid h-full place-items-center text-ink-muted">
      <SpinnerGap className="size-5 animate-spin" aria-label="Opening meeting" />
    </div>
  );
}
