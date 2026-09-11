"use client";

/**
 * SLOT: the WarpBot tab of the Meet widget. Owner: WT-525 t5.
 *
 * CONTRACT
 *   `export function WarpBotPane()` — no props; read from `useBridgeWidget()` (`roomId`, `room`,
 *   `segments` if the answer needs the transcript).
 *   A private 1-to-1 assistant, the same pieces as global-chatbot.tsx. The shell renders it in a
 *   `relative flex min-h-0 flex-1 flex-col` panel between the tabs and the dock, and keeps it
 *   mounted (hidden) while the Transcript tab shows, so a half-typed question survives a switch.
 *   The pane owns its scroller and its composer.
 *
 * Stub until t5 lands.
 */

export function WarpBotPane() {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
      <p className="text-sm text-ink-muted">WarpBot will answer your questions here.</p>
    </div>
  );
}
