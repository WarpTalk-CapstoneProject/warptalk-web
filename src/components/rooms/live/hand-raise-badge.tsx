"use client";

/** Small ✋ badge for a participant tile/list row whose hand is currently raised. */
export function HandRaiseBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[12px] shadow-sm ${className ?? ""}`}
      title="Hand raised"
      aria-label="Hand raised"
    >
      ✋
    </span>
  );
}
