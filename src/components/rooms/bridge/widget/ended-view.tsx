"use client";

/**
 * SLOT: what replaces the tabs and the dock once the session has been ended from the widget.
 * Owner: WT-525 t3.
 *
 * CONTRACT
 *   `export function EndedView()` — no props; read from `useBridgeWidget()`.
 *   The shell renders it, below the header, in place of the tabs and the dock whenever `ended`
 *   is true, inside a `flex min-h-0 flex-1 flex-col` region. The design: "Session ended — your
 *   Google Meet call is still going", what was saved (transcript, summary), Open recap and Close.
 *
 * Stub until t3 lands: the one sentence that must be true of any version of this screen.
 */

export function EndedView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 px-4 py-4">
      <p className="text-sm font-semibold text-ink">WarpTalk session ended</p>
      <p className="text-xs leading-relaxed text-ink-muted">
        Your Google Meet call is still going.
      </p>
    </div>
  );
}
