"use client";

import { useEffect, useState } from "react";

/**
 * Elapsed meeting time, computed from `startedAt` (not from this component's mount
 * time) so a page refresh mid-meeting still shows the correct duration. Ticks every
 * second. Renders "Not started" while the room has no startedAt yet.
 */
export function MeetingTimer({ startedAt, className }: { startedAt?: string | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) {
    return <span className={`text-[11px] font-medium text-ink-subtle ${className ?? ""}`}>Not started</span>;
  }

  const startedMs = new Date(startedAt).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((now - startedMs) / 1000));
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
