"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { SpinnerGap } from "@phosphor-icons/react/dist/ssr";

import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * The old address of the live meeting, kept only to forward.
 *
 * Every workspace URL carries its slug now, so the meeting moved to
 * `/{slug}/rooms/{id}/live`. This path stays because links to it are already out in the
 * world — in a browser tab someone left open, in a message sent to a colleague — and a
 * dead link to a meeting in progress is the worst moment to discover a rename.
 *
 * The slug comes from the workspace the person already has open. Without one there is no
 * meeting to show them, so they go to the workspace picker rather than to a URL that would
 * 404 on arrival.
 */
export default function LegacyRoomRedirectPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const router = useRouter();
  const workspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);

  useEffect(() => {
    router.replace(
      workspaceSlug ? `/${workspaceSlug}/rooms/${roomId}/live` : "/workspace",
    );
  }, [router, roomId, workspaceSlug]);

  return (
    <div className="grid h-full place-items-center text-ink-muted">
      <SpinnerGap className="size-5 animate-spin" aria-label="Opening meeting" />
    </div>
  );
}
