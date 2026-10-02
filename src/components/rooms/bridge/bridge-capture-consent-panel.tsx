"use client";

import { useState } from "react";

import { useBridgeConsentPrompt } from "@/hooks/use-bridge-consent-prompt";
import { useBridgeRecordingPrompt } from "@/hooks/use-bridge-recording-relay";
import {
  BRIDGE_RECORD_CHOICE,
  CABLE_WHILE_ASKING_PROMPT,
  LISTEN_SCOPE_COPY,
} from "@/lib/audio/browser-capture-consent";
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
 * WT-910: WHAT "STOP LISTENING" STOPS
 *   One thing: the browser capture that hears the OTHER side of the call. Not translation, not the
 *   user's own microphone or dub, not the recording. The line used to name only the permission, so
 *   the press read as "stop WarpTalk"; both the listening and the declined state now say what goes
 *   quiet, what does not, and how to come back (LISTEN_SCOPE_COPY, tested where it lives). The
 *   button itself is not widened — stopping translation is the dock's Stop.
 *
 * WT-910: THE RECORDING CHECKBOX
 *   A bridged Meet call is recorded by default, opt-out (PO, 2026-10-01; lib/meeting/
 *   bridge-recording). The choice sits beside the question that starts the capture, because the
 *   recording starts when the capture does, and it travels with the same press — main validates
 *   it with the answer. Shown only to someone who may control the bridge (`canRecord`); for
 *   anybody else the press says nothing about recording and nothing is started.
 *
 * The wording is imported, never retyped. It is the whole control, it is tested where it lives, and
 * a second copy in JSX is how the tested one stops being the one users read.
 */
export function BridgeCaptureConsentPanel({
  roomId,
  canRecord = false,
}: {
  roomId: string;
  /** Room host or bridge capturer (`canControlBridge`): may be offered the recording checkbox. */
  canRecord?: boolean;
}) {
  const { view, selectSource, decide, reconsider } = useBridgeConsentPrompt(roomId);
  const { view: recordingView } = useBridgeRecordingPrompt(roomId);
  // Checked by default: the PO's decision is default-on, opt-out. Local to this window on purpose —
  // it is a form field until the press, and the press is what main is told.
  const [record, setRecord] = useState(true);
  /** What a press in the ask says about recording: the box for those shown it, nothing otherwise. */
  const recordChoice = canRecord ? { record } : undefined;
  const recordingOn = recordingView.kind === "recording";

  if (view.kind === "hidden") return null;

  if (view.kind === "listening") {
    return (
      // PERMISSION, NOT A LIVE READING. This says what the host allowed, because that is the only
      // thing the snapshot actually knows. Whether a capture is running at this instant is a
      // separate fact the main window holds and does not publish: the idle reaper stops the inbound
      // leg without touching the answer, and so does a failed open or a dropped connection. A line
      // reading "Listening to Chrome" through any of those would be the same lie this relay exists
      // to remove, only pointing the other way.
      <div className="space-y-0.5">
        <p className="text-[11px] leading-relaxed text-ink-muted">
          WarpTalk may listen to {view.sourceName ?? "your browser"} for the other side of the
          meeting.{" "}
          <button
            type="button"
            onClick={() => decide(false)}
            aria-describedby="bridge-stop-listening-effect"
            className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {LISTEN_SCOPE_COPY.stop}
          </button>
        </p>
        {/* Said BEFORE the press, beside the button: which capture it stops and what it leaves
            running. With a cable the far side is not lost, and saying it would be is the opposite
            mistake. */}
        <p id="bridge-stop-listening-effect" className="text-[10px] leading-snug text-ink-subtle">
          {view.cableAvailable ? LISTEN_SCOPE_COPY.stopEffectWithCable : LISTEN_SCOPE_COPY.stopEffect}
          {recordingOn ? ` ${LISTEN_SCOPE_COPY.recordingUnaffected}` : null}
        </p>
      </div>
    );
  }

  if (view.kind === "declined") {
    return (
      // WT-910: this used to say "The other side is not being translated" in every case — false
      // while the cable carries Meet (WT-900), and silent about the half that keeps working.
      <p className="text-[11px] leading-relaxed text-ink-muted">
        {view.viaCable ? LISTEN_SCOPE_COPY.declinedWithCable : LISTEN_SCOPE_COPY.declined}
        {recordingOn ? ` ${LISTEN_SCOPE_COPY.recordingUnaffected}` : null}{" "}
        {LISTEN_SCOPE_COPY.resumeLead}{" "}
        <button
          type="button"
          onClick={() => reconsider()}
          className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {LISTEN_SCOPE_COPY.resume}
        </button>
      </p>
    );
  }

  if (view.compact) {
    // WT-900. The far side is already arriving through the cable, so nothing is waiting on this
    // answer: one line, no frame, no picker (main has already chosen the likeliest browser, and
    // Switch is offered only for a choice main will honour). Not a prompt that covers the
    // transcript - the question stays answerable without being in the way.
    return (
      <div
        role="group"
        aria-label={WINDOWS_CAPTURE_CONSENT.title}
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug text-ink-muted"
      >
        <span className="min-w-0 flex-1">{CABLE_WHILE_ASKING_PROMPT.text}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* WT-910: the cable already carries the call, so either answer leaves a capture running
              and either answer carries the recording choice. Label only, to keep the one line. */}
          {canRecord ? (
            <RecordChoice id="bridge-record-choice-compact" checked={record} onChange={setRecord} />
          ) : null}
          <button
            type="button"
            disabled={!view.canConfirm}
            onClick={() => decide(true, recordChoice)}
            className="h-6 rounded-md bg-primary px-2 text-[11px] font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {CABLE_WHILE_ASKING_PROMPT.confirm}
          </button>
          <button
            type="button"
            onClick={() => decide(false, recordChoice)}
            className="h-6 rounded-md border border-border bg-surface-1 px-2 text-[11px] font-medium text-ink transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {CABLE_WHILE_ASKING_PROMPT.decline}
          </button>
        </span>
        {/* WT-916: its own full-width row under the one-line ask, so the buttons keep their line. */}
        {canRecord ? (
          <span id="bridge-record-choice-compact-meet" className="basis-full text-[10px] leading-snug text-ink-subtle">
            {BRIDGE_RECORD_CHOICE.meetNotice}
          </span>
        ) : null}
      </div>
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

      {canRecord ? (
        <RecordChoice
          id="bridge-record-choice"
          checked={record}
          onChange={setRecord}
          hint={`${BRIDGE_RECORD_CHOICE.hint} ${BRIDGE_RECORD_CHOICE.meetNotice}`}
        />
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => decide(false, recordChoice)}
          className="h-7 rounded-lg border border-border bg-surface-1 px-3 text-[11px] font-medium text-ink transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {WINDOWS_CAPTURE_CONSENT.decline}
        </button>
        <button
          type="button"
          disabled={!view.canConfirm}
          onClick={() => decide(true, recordChoice)}
          className="h-7 min-w-0 flex-1 rounded-lg bg-primary px-3 text-[11px] font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {WINDOWS_CAPTURE_CONSENT.confirm}
        </button>
      </div>
    </div>
  );
}

/**
 * "Record this meeting" — checked by default, opt-out (WT-910).
 *
 * A native checkbox for the reason the select above is native: nothing to portal, nothing to
 * restyle, and a control every screen reader already knows how to announce.
 */
function RecordChoice({
  id,
  checked,
  onChange,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    // Spans, not a div and a p: the compact ask mounts this inside a <span> row.
    <span className="block min-w-0">
      <label htmlFor={id} className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="size-3.5 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        {BRIDGE_RECORD_CHOICE.label}
      </label>
      {hint ? (
        <span id={`${id}-hint`} className="block pl-5 text-[10px] leading-snug text-ink-subtle">
          {hint}
        </span>
      ) : null}
    </span>
  );
}
