# Google Meet bridge: when the popup may be raised

Desktop popup over Google Meet (`/desktop-transcript/{roomId}`) and the main window's meeting
session, for `EXTERNAL_BRIDGE` rooms. Fix popspam1002 (2026-10-02).

## Principle (PO)

WarpTalk follows Meet silently. The popup is never raised (shown + focused, with the OS notification
"Your translated meeting is ready") for a bridge room whose Meet call is not on screen or has been
left. Ending the room when Meet is left is WT-913's job, not this one's; this rule holds with or
without it.

## Who raises the popup

Every raise goes through the desktop's `openTranscriptWindow` (restore + show + focus, and the
notification when `announce` is on). Web callers:

| Caller | When | Repeats? |
| --- | --- | --- |
| `useBridgeConsentHost` (`src/hooks/use-bridge-consent-host.ts`) | loopback consent question open and the popup has not acked it | **yes - the loop below** |
| `useBridgeTrigger` (`src/hooks/use-bridge-trigger.ts`) | the trigger points at a new target, or moves forward a phase after the user closed it (`nextBridgeWindow`) | no, once per target/phase |
| `PersistentMeetingSession` | once per mount of a bridge room | no |
| room pages / audio bridge panel | the user opened them | no |

## The bug (prod, desktop 0.4.9, 2026-10-02)

The loopback consent question (WT-900) stays `required` until the host answers it. Hosts who have a
cable are asked quietly (`isCompactConsentAsk`) and often never answer. The raise loop
(`nextConsentRaise`) then ran, for the life of the room:

1. the host closes the popup without answering;
2. at the next check (every `CONSENT_POPUP_RECHECK_MS` = 60 s) no `ack` comes back within the grace;
3. `raise` -> `openTranscriptWindow(roomId)` -> popup shown, focused, notification;
4. the reopened popup acks; the next `check` reset `unansweredRaises` to 0;
5. back to 1.

`CONSENT_POPUP_MAX_UNANSWERED_RAISES` never tripped, because every raise was acked. The room never
ends when Meet is left (WT-913 not on prod), so the question stayed open after the call and the
popup kept coming back over Chrome.

## The rules now (`src/lib/meeting/bridge-capture-consent-relay.ts`, pure, tested)

- `isBridgeMeetCallOnScreen({ sensor, roomMeetCode })` - the desktop Meet sensor sees this room's
  call (a sighting whose code names another call does not count; a missing code proves nothing).
  No reading at all (browser tab, macOS, desktop without the sensor, first poll pending) is
  "unknown" and counts as on screen, so those hosts keep the old behaviour. Where the desktop reads
  Meet's call state (WT-911, `useBridgeMeetFollow().callPhase`, code-checked by `trustedMeetPhase`)
  it comes first: `left` (or `leftCall`, i.e. during WT-913's 30 s prompt) is off screen even if the
  tab still shows Meet's "You left" page; `lobby` / `in-call` are on screen; `unknown` / no phase
  (older desktop, macOS, background tab) falls back to the URL sensor.
- With WT-913 merged, leaving Meet also makes `bridgeListening` false, so the consent question goes
  `not-required` and the loop stops; the gate above is what holds during the prompt and on desktops
  without the call-state sensor.
- `nextConsentRaise` returns `hold` instead of `raise` (and instead of `use-main`) while Meet is not
  on screen. Holding spends nothing; the hook re-decides as soon as Meet is back on screen (and at
  the recheck as a backstop).
- `CONSENT_POPUP_MAX_RAISES_PER_QUESTION` (3) raises per question in total, acked or not. Past it
  the question moves to the main window's modal (`use-main`) and the popup is not raised again.
- `ConsentRaiseBudget` / `consentRaiseBudgetFor` - the count lives in the hook per room and
  survives the loop effect restarting (`asking` / `popupAvailable` flicker). It resets only on an
  answer (`granted` / `declined`) or another room; `not-required` (fallback, device change) does not
  reset it.

## Wiring

- `PersistentMeetingSession` computes `consentMeetOnScreen` from its `meetSensor` prop (handed down
  by the app shell's `useBridgeTrigger`) and the room's `externalMeetingUrl`, and passes it to
  `useBridgeConsentHost` as `meetOnScreen`.
- `useBridgeConsentHost` mirrors `meetOnScreen` and the budget into refs before every decision, and
  pokes the running loop when `meetOnScreen` turns true.

## Known limitations

- After a main-window reload while Meet is already gone, the desktop sensor reports nothing (it
  only reports changes), so the reading is "unknown" and up to the per-question budget may still be
  raised. The session's once-per-mount open is not gated on Meet either.
- The trigger's phase-forward reopen (`nextBridgeWindow`) is not gated on Meet; it does not repeat.

## Testing checklist

- `npm run test:bridge-capture-consent-relay` (includes the replayed prod sequence).
- Desktop: join a bridge, leave the consent question unanswered, close Meet's tab, close the popup:
  it must not come back. With Meet on screen, closing it brings it back at most 3 times per question.

## Stale room blocks the next Meet call (prod incident 2026-10-03)

### What happened

Meet `jkm-bfek-dio` claimed room A. The backend hung briefly, the room query timed out, and the
session carrying A was torn down about 41 s in - popup, idle reaper and Meet-left countdown with it -
so A was never ended and the shell's room list kept it with no `endedAt`. The trigger then picked A
by clock alone for its whole one-hour tail: Meet `uys-xppr-xjd` re-opened the popup for OLD room A
(no claim), and Meet `nht-fzkw-igv` got no popup at all.

### What changed, and why

1. **The sighting narrows the selection** (`selectTriggerMeeting` in
   `src/lib/meeting/bridge-trigger.ts`). New args `observedMeetCode`, `preferredRoomId`. Order:
   translating room wins; then the trigger window; then, with an observed code, rooms with that code
   if any, else rooms whose KNOWN code differs drop out (code-less rooms stay); then the preferred
   room (the hook's latch, `seenRoomId`) if it survived; else nearest start. No code and no
   preferred = the old rule. A stale room for another call can no longer hide the `offer`.
2. **The latch is written with the NEW sighting's code** (`sightingLatchRoomId`, used by
   `src/hooks/use-bridge-trigger.ts`). The sensor callback used to latch the last render's
   selection on any visible sighting (`setSeenRoomId(meetingRoomIdRef.current)`), which latched the
   old room to `ready`. A second path re-latches when the claimed room reaches the room list while
   Meet stays on screen (presence events fire only on change), so a later hidden-tab sighting (no
   code) prefers the new room, not the old one.
3. **One claim per call, not per code forever** (`claimKeyAfterTrigger` in
   `src/lib/meeting/bridge-auto-room.ts`, used by `use-bridge-auto-room.ts`). The key resets on
   `upcoming`/`ready`/`running`, NOT on `idle`, so re-opening a Meet link after its room ended
   claims again while a failed claim is still toasted once per call.
4. **The room list is refreshed whenever the session closes** (`handleMeetingClosed` in
   `src/app/(app)/layout.tsx`): every exit - TranslationRoomEnded, the WT-899 status poll, the stale
   retire, Leave/End - goes through `onMeetingClosed`, which now invalidates `["translationRooms"]`.
5. **A timeout no longer tears down a live session** (`isRestoredMeetingStale` in
   `src/lib/meeting/meeting-session-lifecycle.ts`). Only 403/404/410 retire it; timeouts, 5xx and
   network errors hold ("absence is not evidence", as `canConnectToRoom`). The render guard in
   `persistent-meeting-session.tsx` is now `!room` instead of `roomQuery.isError || !room`, so a
   failed refetch with the last good room in hand keeps the meeting mounted.
6. **A failed End after the Meet-left countdown is retried** (`bridge-meet-follow.ts`:
   `leave-failed` event, `meetLeaveRetryDelayMs` 5 s doubling to 60 s,
   `meetLeaveFailureRetryable`). The leave stays pending until the exit lands; `handleExit` now
   resolves `{ kind: "done" | "busy" | "failed", status }`. Stops on Keep open, rejoining, or a
   definitive 4xx. Only the first failure is toasted; the popup says "Could not end the room yet.
   Trying again in Ns." (`retrying: true` on the prompt).
7. **Tab closed = Meet ended** (PO). A `left` reading with a desktop `reason` of `tab-closed`,
   `tab-navigated`, `window-closed` or `browser-gone` (`MeetCallTabGoneReason` in
   `src/lib/desktop/bridge.ts`) runs the same 30 s countdown; only the wording changes ("The Google
   Meet tab was closed. End the WarpTalk room?", `meetLeft.titleTabClosed` / `keptTabClosed` in
   en/vi/ja). `cause` and `retrying` are optional fields on the relay's `meetLeave`; a desktop that
   never sends these reasons, and a snapshot without them, read exactly as before.

### Known limitations / tech debt (PO 2026-10-03)

- User in Meet A (not translating) opens a second Meet tab B: the selection follows the sighting,
  so the trigger moves to B (or offers B) and back to A when A's tab is in front. There is no
  "bridge room this window already carries" in the selection; only a translating room is pinned.
- The trigger's latch (`seenRoomId`) is never cleared; it only matters while that room is still in
  its window and not ruled out by a code.
- Retrying the End runs only while this main window (and the session) is alive.

### Testing checklist

- `npm run test:bridge-trigger` (includes the replayed three-call incident),
  `npm run test:bridge-auto-room`, `npm run test:meeting-session-lifecycle`,
  `npm run test:bridge-widget-relay`, `npm run test:bridge-trigger-meet-code`,
  `npm run test:contracts`.
- Desktop: open Meet X (room A claimed), kill the network/backend for ~1 min - the popup and the
  session must survive. Leave Meet X with the backend down: the countdown must say it is retrying
  and end A once the backend is back. Open Meet Y with A still open: a new room B must be claimed
  and its popup opened, never A's. Switch tabs: the popup stays on B.
- Desktop with the tab-closed reasons: close the Meet tab mid-call - "The Google Meet tab was
  closed" with the 30 s countdown. Older desktop: the old "You left the Meet call" text.
