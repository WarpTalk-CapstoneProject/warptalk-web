"use client";

/**
 * SLOT: the language pill in the widget dock, after the separator. Owner: WT-525 t4.
 *
 * CONTRACT
 *   `export function DockLanguagePill()` — no props; read from `useBridgeWidget()`.
 *   Shows `readerLanguage` (null = not known yet) and lets the user pick one language — what they
 *   speak and what everyone else is translated into for them. A pick calls
 *   `hub.invoke("SetSpeakLanguage" | "SetListenLanguage", roomId, code)` (only while
 *   `connectionState === "live"`) and `setReaderLanguage(code)`; read the `hub` note in
 *   widget-context.tsx before relying on the change sticking.
 *   The pill may shrink (`min-w-0`, ellipsis) — it is the one flexible item in the dock row. A
 *   menu opens upward: the dock is the positioning context (`relative`) and sits at the bottom
 *   edge of the window.
 *
 * Stub until t4 lands: renders nothing.
 */

export function DockLanguagePill() {
  return null;
}
