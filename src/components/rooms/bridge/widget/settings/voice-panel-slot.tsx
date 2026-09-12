"use client";

/**
 * SLOT: the body of the widget's "Voice" sub-panel. WT-525 t4 left it empty on purpose.
 *
 * Another session is building a shared `VoicePanel` (`mode: "meeting" | "bridge"`) for both the
 * meeting's settings menu and this window. It mounts HERE, replacing the placeholder below, and
 * this file is the only one that needs to change for it — the flyout around it stays as it is.
 *
 * Two rules for whoever mounts it:
 *   - Voice state lives in the main window (voice on/off, the listen voice, the clone consent), so
 *     a change made here goes over the relay (`useBridgeWidgetRelayClient`: `setVoiceEnabled`, and
 *     new intents in lib/meeting/bridge-widget-relay for the rest), not through this window's hub.
 *   - Picking a LISTEN voice must never call `onChangeVoiceCloneConsent(false)`. The native bar's
 *     `selectProviderVoice` does, and that is a known bug: what you hear and whether you consent
 *     to your own voice being cloned are two different decisions.
 */

export function VoicePanelSlot() {
  return (
    <>
      {/* <VoicePanel mode="bridge" /> mounts here. */}
      <p className="px-2.5 pb-2 pt-0.5 text-[12px] leading-snug text-ink-muted">
        Voice options are coming to this window.
      </p>
    </>
  );
}
