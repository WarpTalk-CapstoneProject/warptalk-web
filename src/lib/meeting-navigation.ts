export function buildTranscriptReviewPath(
  workspaceSlug: string | null | undefined,
  roomId: string,
): string {
  const slug = workspaceSlug?.trim() || "workspace";
  return `/${slug}/transcript?room=${encodeURIComponent(roomId)}`;
}
