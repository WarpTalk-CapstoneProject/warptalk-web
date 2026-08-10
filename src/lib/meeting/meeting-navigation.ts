/**
 * Where the host who just pressed "End meeting" lands.
 *
 * This module used to export `buildTranscriptReviewPath`, returning
 * `/{slug}/transcript?room={id}` — the workspace-wide transcript archive filtered by room. That
 * was the only thing `handleExit("end")` ever navigated to, and it meant the per-room wrap-up
 * page at `app/(app)/[workspaceSlug]/rooms/[id]/ended/page.tsx` — recording/summary artifact
 * cards that refresh every 5 seconds while they are still generating, plus the artifacts,
 * feedback and history links — was fully built but unreachable from anywhere in the app.
 *
 * `buildTranscriptReviewPath` had exactly one caller (that one), so it is replaced here rather
 * than duplicated: leaving it exported and uncalled would just be dead code. If a transcript-
 * archive deep link is wanted again, add it back as its own helper beside this one.
 */
export function buildMeetingEndedPath(
  workspaceSlug: string | null | undefined,
  roomId: string,
): string {
  const slug = workspaceSlug?.trim() || "workspace";
  return `/${slug}/rooms/${encodeURIComponent(roomId)}/ended`;
}
