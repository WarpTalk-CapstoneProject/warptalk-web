"use client";

/**
 * SLOT: the header actions of the Meet widget (right end of the header row). Owner: WT-525 t3.
 *
 * CONTRACT
 *   `export function EndSessionButton()` — no props; read from `useBridgeWidget()`.
 *   The one exit in a bridge room: "End", with a confirmation, which ends the WarpTalk session
 *   (not the Google Meet call) and then calls `markEnded()` so the shell swaps the tabs and dock
 *   for `EndedView`. There is no Leave button in bridge rooms — leaving would orphan the room.
 *   The shell does not render this slot once `ended` is true. Tooltips here sit below the button
 *   (`tooltipPlacement="bottom"`, `tooltipAlign="end"` on DockIconButton) — the header is the top
 *   edge of the window.
 *
 * Stub until t3 lands: renders nothing.
 */

export function EndSessionButton() {
  return null;
}
