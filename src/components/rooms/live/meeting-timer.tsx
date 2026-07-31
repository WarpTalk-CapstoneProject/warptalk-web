"use client";

import { useEffect, useState } from "react";
import { calculateMeetingDurationSeconds } from "@/lib/meeting-duration";

/**
 * Meeting duration is derived from persisted lifecycle timestamps, never from a
 * stored duration. Active meetings tick from createdAt to now; ended meetings are
 * frozen at endedAt.
 */
export function MeetingTimer({
  createdAt,
  endedAt,
  className,
}: {
  createdAt: string;
  endedAt?: string | null;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endedAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [endedAt]);

  const elapsedSeconds = calculateMeetingDurationSeconds(createdAt, endedAt, now);
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  const label = [hours, minutes, seconds].map((unit) => String(unit).padStart(2, "0")).join(":");

  return (
    <span
      className={`text-[11px] font-medium text-ink-subtle ${className ?? ""}`}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {label}
    </span>
  );
}
