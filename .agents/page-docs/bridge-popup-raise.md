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
  "unknown" and counts as on screen, so those hosts keep the old behaviour.
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
