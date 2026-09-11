"use client";

/**
 * SLOT: the left end of the widget dock. Owner: WT-525 t3.
 *
 * CONTRACT
 *   `export function DockSessionControls()` — no props; read from `useBridgeWidget()`.
 *   Renders Start/Stop translation and Pause/Resume transcript as `DockIconButton`s
 *   (dock-icon-button.tsx), left-aligned tooltips. Nothing else: Meet owns mic, camera and
 *   leaving, and the dock must not look like Meet's call bar.
 *
 *   Gate on `isHost` (Start/Stop and Pause are host-only on the server). Start = startRoom when
 *   the room is not yet in_progress/paused, then resume — the order bridge-overlay-controls.tsx
 *   uses; Stop = useStopTranslation. Pause = useSetTranscriptPaused(roomId), which invalidates
 *   the pause windows the context's `transcriptPaused` is read from; `transcriptPauseKnown`
 *   false means "not told yet", not "running".
 *
 * Stub until t3 lands: renders nothing.
 */

export function DockSessionControls() {
  return null;
}
