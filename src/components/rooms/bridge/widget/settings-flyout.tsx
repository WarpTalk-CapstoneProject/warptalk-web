"use client";

/**
 * SLOT: the right end of the widget dock. Owner: WT-525 t4.
 *
 * CONTRACT
 *   `export function SettingsFlyout()` — no props; read from `useBridgeWidget()`.
 *   The settings button (a `DockIconButton` with `hasPopup`, `expanded`, `tooltipAlign="end"`)
 *   and the flyout it opens: voice, noise filter and the rest of the rows MeetingControlBar's
 *   settings menu has that apply here. The shell renders this inside a right-aligned
 *   `flex items-center gap-1.5` group, so it may render more than one button (e.g. Text only /
 *   Voice + Text) without touching the shell. Open the flyout upward; the dock is `relative`.
 *   Native `<select>` over portalled listboxes in this window — see bridge-overlay-controls.tsx.
 *
 * Stub until t4 lands: renders nothing.
 */

export function SettingsFlyout() {
  return null;
}
