# Google Meet bridge: recording the call

Desktop popup over Google Meet (`/desktop-transcript/{roomId}`) and the main window's meeting
session, for `EXTERNAL_BRIDGE` rooms. PO decisions 2026-10-01 and 2026-10-02 (WT-910, WT-916).

## What it is

Google Meet refuses its own recording, so WarpTalk records a bridged call. Default ON, opt-out.
Native meetings are unchanged: recording is never started for you there.

- The popup's listening prompt carries a checked "Record this meeting" checkbox. Only someone who
  was shown it and left it checked causes a recording. The main window's fallback consent modal and
  the direct device path have no checkbox, so they never auto-record.
- The recording starts when capture starts (the inbound leg opens), not when translation starts,
  and only once this window has joined the meeting (see "Order of events").
- Only the room host or the capturer may start or stop it; the server refuses everyone else.
- People who are only in Google Meet cannot see WarpTalk's REC chip. The host tells them: a helper
  line under the checkbox, and a one-time "Recording started. Tell everyone in the call." notice.
- "Stop listening" does not stop the recording.

## Server contract

- `POST /meetings/rooms/{roomId}/join` creates the meeting service's `MeetingRoom` row. Nothing
  else creates it.
- `POST /meetings/rooms/{roomId}/recording` — the same endpoint the native button calls.
  - `404` when the `MeetingRoom` row does not exist yet.
  - `403` in a bridge room for anyone but the host or the capturer.
  - `503` when the room type cannot be determined (fails closed, also for native rooms while the
    translation-room lookup is down and the cache is cold). Treat as temporary.
  - A quota failure currently arrives as a `500`.

## Desktop contract

- `armMeetWindowCapture(roomId)` → `{ ok: true, sourceName } | { ok: false, reason }`. After
  `ok: true`, the next `getDisplayMedia({ video: true, audio: false })` from the main window within
  10 s resolves with the Meet window and no dialog. Only works while the loopback capture is
  running. Older desktops lack the method.

## How it works

### Pure rules — `src/lib/meeting/bridge-recording.ts`

- `bridgeAutoRecordingDecision` — bridge room, inbound leg open, a `record === true` choice,
  `canControl`, not already recording. One attempt per answer (the choice's token): a re-render, a
  reconnect of the leg, or a host who stopped the recording by hand never start it again.
- `shouldPublishMeetWindow` — the Meet window stays published only while there is a recording and
  the call is still being captured.
- `shouldShowRecordingStartNotice` — once per recording start, host/capturer only.
- WT-916 (B20) retry: `classifyBridgeRecordingStartFailure`, `bridgeRecordingFailurePlan`,
  `shouldKeepBridgeRecordingRetry`, and the decision's optional `retryDue`. See "When the start fails".

### Main window — `src/components/rooms/live/persistent-meeting-session.tsx`

- `bridgeInboundOpen` gates the automatic start. It requires `meetingSession`, because the inbound
  leg connects with its own bridge token and does not wait for the join.
- `BridgeMeetWindowPublisher` (inside `<LiveKitRoom>`) exposes `publishMeetWindow(roomId)` and
  `unpublishMeetWindow()`. The track is named `meet-window`.
- `useBridgeRecordingHost` publishes the recording state to the popup and handles Stop.

### Popup — `src/components/rooms/bridge/widget/`

- `recording-chip.tsx` — REC chip for every participant, Stop for host and capturer.
- `recording-start-notice.tsx` — the one-time reminder.

### Egress — `src/app/egress/composite/page.tsx`

When a `meet-window` video track is present it fills the frame; everyone's audio is still mixed.
Without it the layout is the usual grid.

## Order of events

1. The main window opens the room and calls join. This creates the `MeetingRoom` row.
2. The capturer answers the listening prompt in the popup (with the checkbox value).
3. The inbound leg opens.
4. Once joined and the leg is open: arm the Meet window, publish it, call the recording endpoint.

## When the start fails (WT-916, B20)

Before this, any failure spent the answer's one attempt and showed one toast in the hidden main
window: a 404 while the join was still in flight meant the call was never recorded although the box
was checked. Now the client retries on its own (the backend fix that lets the bridge token create
the row is separate).

The failure is read with the app's existing helpers: `getErrorStatus` (lib/api/retry-policy) and
`apiErrorCode` (lib/api/errors).

| Failure | Class | What happens |
| --- | --- | --- |
| 404 (no `MeetingRoom` row yet), 503, 502, 504, 408, 429, no response | transient | retry |
| 403, 400, 409, 401, 500 (today's quota failure), anything else | terminal | give up at once |
| a code containing QUOTA, BUDGET, BILLING, CREDIT, PAYMENT, SUBSCRIPTION or EXHAUSTED, whatever the status | terminal | give up at once |

- Backoff before attempts 2 to 5: 2 s, 5 s, 15 s, 30 s. After the 5th failure it gives up
  (`exhausted`). Retries are silent, apart from a `console.warn`.
- One answer is still one chain. `handledToken.attempts` counts the attempts. A due retry (`retryDue`)
  opens the `already-handled` gate only for the next attempt of the same answer. Every other gate still
  runs, so no retry fires once the recording is on, the answer changed or was opted out, capture closed,
  the user lost control, or the room changed.
- While a retry waits, `shouldKeepBridgeRecordingRetry` runs on every change. Once it says no, the retry
  is cancelled and does not come back, even if capture reopens. Timers are cleared on unmount and on a
  room change.
- A refusal is not retried. A recording stopped by hand is not restarted.
- Giving up is reported once, in two places: a toast in main (the server's reason via
  `getErrorMessage`), and the relay snapshot's optional `failed: { reason }`. That field is kept only
  when not recording, trimmed, capped at 200 chars, and dropped if malformed. The relay version did not
  change.
- Popup: `recording-start-notice.tsx` uses the same notice slot (never the dock row) for
  "Recording didn't start · {reason}" with "Try again". Only the host and the capturer see it
  (`bridgeRecordingFailedView`). The line shows only while it is true: same answer, not recording,
  capture open, user in control.
- "Try again" sends a new intent `{ v: 1, kind: "retry", roomId }`, which is parsed strictly. Main
  accepts it only when `canStop && !recording && failed`. It then starts a fresh chain for the same
  answer (attempts reset, retry attempt 1), and the decision is checked again.

Files: `src/lib/meeting/bridge-recording.ts`, `src/hooks/use-bridge-recording-relay.ts`,
`src/components/rooms/live/persistent-meeting-session.tsx` (recording block only),
`src/components/rooms/bridge/widget/recording-start-notice.tsx`,
`src/lib/audio/browser-capture-consent.ts` (copy), tests in
`src/lib/meeting/__tests__/bridge-recording{,-retry}.test.ts` (`npm run test:bridge-recording`).

Testing checklist (runtime, not done yet): start a bridge room while the join is slow, and the
recording should start within a few seconds. Make the start fail with a 403: one toast, plus the popup
line for the host. Press "Try again" after a give-up. Opt out, or stop listening, while a retry waits:
nothing starts.

## Known gaps (2026-10-02, not run on a real desktop yet)

- WT-916 retry: during the wait between attempts the Meet window is unpublished, and each attempt
  publishes it again. A reload of main loses a pending retry and the `failed` line, along with the
  choice.

- When Meet leaves its tab (Picture-in-Picture or a tab switch) the capture stays on the original
  window and would record another tab. Decision: stop publishing the video until the Meet tab is
  back. Not wired yet; it needs the desktop's `onMeetCallState` signal.
- A reload of the main window mid-meeting loses the record choice and the REC chip while the
  server-side recording continues.
- A LiveKit reconnect drops the `meet-window` track and does not publish it again.
- Not verified that the bridge room's join token allows publishing a screen-share track.
