"use client";

import { useBridgeConsentPrompt } from "@/hooks/use-bridge-consent-prompt";
import { WINDOWS_CAPTURE_CONSENT } from "@/lib/desktop/virtual-audio";

/**
 * The one control on this window that is not a server fact: may WarpTalk listen to your browser?
 *
 * WHY IT IS RELAYED RATHER THAN CALLED
 *   Every other control here is a mutation and a poll, because translation, the dub voice and clone
 *   consent are all state the server holds. This one is not: the consent is per meeting and per
 *   machine, it gates a process loopback that only the desktop main window can run, and there is no
 *   endpoint to ask. The state lives in the main window's PersistentMeetingSession, which publishes
 *   snapshots on BROADCAST_CHANNELS.BRIDGE_CAPTURE_CONSENT; this panel renders the last snapshot and
 *   posts back what the host pressed. See bridge-capture-consent-relay.ts for why main validates
 *   every intent rather than trusting the press.
 *
 *   It is asked HERE because the main window is behind Google Meet and behind this popup. The same
 *   question in the same wording opened there and went unseen, and the far side of the call was
 *   never translated with nothing anywhere saying why.
 *
 * WHY IT IS INLINE AND NOT A DIALOG
 *   A modal in a 460px always-on-top window covers the live transcript the host is reading, over a
 *   call that is already running. That is a thing people clear off the screen, not a thing they
 *   read — and a consent prompt that is dismissed unread is worse than no prompt, because it
 *   produces an answer. So it takes its place in the strip, under the Start button that caused it,
 *   and the transcript keeps running beside it.
 *
 * WHY THE SELECT IS NATIVE
 *   Same reason as the voice picker next to it: a portalled Radix listbox has nowhere to open in a
 *   window this size, while the menu a native <select> raises is not bound by the window at all.
 *
 * The wording is imported, never retyped. It is the whole control, it is tested where it lives, and
 * a second copy in JSX is how the tested one stops being the one users read.
 */
export function BridgeCaptureConsentPanel({ roomId }: { roomId: string }) {
  const { view, selectSource, decide, reconsider } = useBridgeConsentPrompt(roomId);

  if (view.kind === "hidden") return null;

  if (view.kind === "listening") {
    return (
      <p className="text-[11px] leading-relaxed text-ink-muted">
        Listening to {view.sourceName ?? "your browser"} for the other side of the meeting.{" "}
        <button
          type="button"
          onClick={() => decide(false)}
          className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Stop listening
        </button>
      </p>
    );
  }

  if (view.kind === "declined") {
    return (
      <p className="text-[11px] leading-relaxed text-ink-muted">
        The other side is not being translated. WarpTalk is not listening to your browser.{" "}
        <button
          type="button"
          onClick={() => reconsider()}
          className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Listen to my browser
        </button>
      </p>
    );
  }

  const noSources = !view.loadingSources && view.sources.length === 0;

  return (
    // Framed in the primary colour because it is the only thing in this strip that is WAITING on
    // the host: the controls above it report, this one asks, and the meeting is silent until it is
    // answered.
    <div
      role="group"
      aria-label={WINDOWS_CAPTURE_CONSENT.title}
      className="space-y-2 rounded-lg border border-primary bg-primary/5 p-3"
    >
      <p className="text-[11px] font-semibold leading-snug text-ink">
        {WINDOWS_CAPTURE_CONSENT.title}
      </p>
      <p className="text-[11px] leading-relaxed text-ink-muted">{WINDOWS_CAPTURE_CONSENT.body}</p>
      <p className="text-[11px] font-medium leading-relaxed text-ink">
        {WINDOWS_CAPTURE_CONSENT.action}
      </p>

      <div className="space-y-1">
        {/* "Browser", not "window": every window of one browser resolves to the same process, and
            the capture takes that process and its children. Naming a window here would promise a
            precision the capture does not have, directly under a sentence that correctly warns
            about the other tabs. */}
        <label className="block text-[11px] text-ink-muted" htmlFor="bridge-capture-source">
          Browser to capture
        </label>
        <select
          id="bridge-capture-source"
          value={view.selectedSourceId ?? ""}
          onChange={(event) => {
            if (event.target.value) selectSource(event.target.value);
          }}
          disabled={view.loadingSources || view.sources.length === 0}
          className="h-7 w-full min-w-0 rounded-md border border-border bg-surface-1 px-1.5 text-[11px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          <option value="">
            {view.loadingSources
              ? "Finding open windows..."
              : "Choose the browser your meeting is in"}
          </option>
          {view.sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
        {noSources ? (
          <p className="text-[10px] leading-tight text-ink-subtle">
            Open your meeting in a browser, then start translation again.
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => decide(false)}
          className="h-7 rounded-lg border border-border bg-surface-1 px-3 text-[11px] font-medium text-ink transition hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {WINDOWS_CAPTURE_CONSENT.decline}
        </button>
        <button
          type="button"
          disabled={!view.canConfirm}
          onClick={() => decide(true)}
          className="h-7 min-w-0 flex-1 rounded-lg bg-primary px-3 text-[11px] font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {WINDOWS_CAPTURE_CONSENT.confirm}
        </button>
      </div>
    </div>
  );
}
