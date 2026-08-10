export function calculateMeetingDurationSeconds(
  createdAt: string,
  endedAt?: string | null,
  nowMs = Date.now(),
): number {
  const createdMs = Date.parse(createdAt);
  const endMs = endedAt ? Date.parse(endedAt) : nowMs;

  if (!Number.isFinite(createdMs) || !Number.isFinite(endMs)) return 0;

  return Math.max(0, Math.floor((endMs - createdMs) / 1000));
}
