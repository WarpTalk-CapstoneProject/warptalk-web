# Google Meet bridge: text-only mode

Desktop popup over Google Meet (`/desktop-transcript/{roomId}`) and the main window's meeting
session, for `EXTERNAL_BRIDGE` rooms. PO decision 2026-10-01.

## What it is

Two ways to be in a Meet call with WarpTalk, chosen per participant:

| Mode | Meet's microphone | What the far side hears | Needs |
| --- | --- | --- | --- |
| **Translated voice** (`voice`) | VB-CABLE ("CABLE Output") | WarpTalk's dub of you | VB-CABLE |
| **Your own voice** (`text`, text-only) | your real mic | your real voice | nothing |

In text mode WarpTalk still transcribes and translates everything: the transcript, the translated
text and the far side translated back to you (inbound) keep working. The server synthesizes no dub
of you for the far side, and the web plays **nothing** into a cable.

## Server contract (backend #509, ai #215, infra #266 — not merged at the time of writing)

- `POST /translation-rooms/bridge/claim` — optional `audioMode: "voice" | "text"` (omitted keeps the
  current mode; first claim = voice). Response `audioMode` (mode in force), participant
  `isBridgeTextOnly`. Claim never fails over the mode.
- `PUT /translation-rooms/{id}/bridge/audio-mode` `{ mode }` → `{ roomId, userId, mode,
  translationActive }`. Voice → text always; text → voice is `409 BRIDGE_AUDIO_MODE_LOCKED` while a
  translation session is active. Own row only, any participant (no host check).
- Participant DTO: `isBridgeTextOnly`.

## Desktop contract (desktop #45, merged)

- `VirtualAudioStatus.bridgeModes` (`textOnly.possible`, `voice.cableInstalled`, ...).
- `VirtualAudioStatus.endpointLabels` (desktop `feat/bridge-desktop-verdicts`) — the endpoint labels
  to match in `enumerateDevices` per leg (`outboundSink`, `meetMicrophone`, `inboundCapture`,
  `meetSpeaker`), the provider ids and `inboundOptional`. Optional.

## One verdict — `src/lib/desktop/bridge-verdict.ts`

The desktop's status is the single answer; every web caller reads it through this module:
`bridgeVoicePossible` (`voice.possible`), `bridgeTextOnlyPossible`, `bridgeCableInstalled`,
`bridgeLoopbackCapable` (`textOnly.possible`, plus `voice.cableInstalled` in voice mode),
`bridgeDevicesReady` and `readBridgeVerdict`. Device labels: `bridgeDeviceLabelsFor(status)` in
`virtual-bridge-check.ts` (the desktop's `endpointLabels`, platform from `status.platform`).

- Each old web derivation survives only as a `FALLBACK` for a desktop build without the field, with
  a comment saying when it can be deleted.
- The wizard's tone probe only DOWNGRADES (`bridgeDevicesReadyWithProbe`): desktop ready + probe
  heard nothing → not ready; it never turns a desktop "no" into "yes".
- The inbound path has one owner, `decideBridgeInbound` (`bridge-tiers.ts`). The session and the
  setup wizard both call it; the wizard gets the session's `inboundDeviceId` (via
  `BridgeSetupDialog`), not its own tone probe.
- The popup re-reads the status on focus as before, through the same helpers (`bridgeModeSupport`,
  `bridgeDeviceLabelsFor`).
- `startAudioCapture({ ..., mode: "text-only" })` — the loopback capture of Meet's OUTPUT (the far
  side) without the VB-CABLE gate. It does not record the user's mic; the main window's own LiveKit
  mic does that, as before.
- `setMeetMicStream(enabled)` / `onMeetMicState` — which microphone the Meet browser records from
  (`cable` / `real` / `unknown` / `ambiguous`).

## How it works

### Pure rules — `src/lib/meeting/bridge-audio-mode.ts`

- `bridgeModeSupport(status)` — via `readBridgeVerdict`: `voice` is the desktop's `voice.possible`
  (old desktop builds: the cable alone), `text` its `textOnly.possible`.
- `preferredBridgeAudioMode` — voice where the cable is installed, text where it is not and
  text-only works, voice otherwise (old desktop builds: voice only).
- `claimAudioModeFor(status)` — the claim sends `"text"` only where voice cannot run, otherwise
  nothing (never `"voice"`: a reload's claim would undo a text pick made before Start).
- `resolveBridgeAudioMode` — store (claim / switch) → participant row → voice.
- `bridgeAudioModeChange` / `canChooseBridgeAudioMode` — the one-way rule while live.
- `bridgeOutboundSinkDeviceId` — the cable device for FilteredRoomAudio; **null in text mode**.
- `bridgeLoopbackCaptureMode` — `"text-only"` for the desktop capture in text mode.
- `bridgeMeetMicMismatch` — text + Meet on the cable, or voice + Meet on the real mic.

### Main window — `persistent-meeting-session.tsx`

- Mode = `useBridgeAudioModeStore` (written by the claim in `use-bridge-auto-room.ts` and by a
  switch) → my participant row `isBridgeTextOnly` → voice.
- `canCaptureBrowserLoopback(status, { textOnly })` (`bridge-tiers.ts`, delegating to
  `bridgeLoopbackCapable`) — text mode does not need the cable, only the desktop's
  `textOnly.possible`. The inbound path itself comes from `decideBridgeInbound`.
- The loopback capture asks for `mode: bridgeLoopbackCaptureMode(...)`. A voice → text switch does
  not restart a running capture.
- FilteredRoomAudio's `bridgeOutboundDeviceId` goes through `bridgeOutboundSinkDeviceId` — null in
  text mode, so neither the dub nor the raw mic is played into the cable.
- The "cannot reach Google Meet yet" toast + wizard for a missing cable are skipped in text mode
  and on a machine that would start in text (`missingCableIsAProblem`).
- `handleSetBridgeAudioMode` — the relay's `set-audio-mode`: re-checks the one-way rule, calls the
  PUT, stores the answer; a 409 `BRIDGE_AUDIO_MODE_LOCKED` stores `text`.
- The setup wizard (`bridge-setup-wizard.tsx`, `audioMode` prop) in text mode: no driver step, no
  tone test; asks for the REAL mic in Meet and recommends headphones.

### Relay — `bridge-widget-relay.ts`

- Snapshot `audioMode?` (dropped when unreadable; absent from older main windows).
- Intent `set-audio-mode { mode }`. Sent only to a main window whose snapshot carries `audioMode`
  (`canRelayAudioMode`). No protocol version bump.

### Popup

- `audio-mode-choice.tsx` — `BridgeAudioModeChoice` ("How Meet hears you": Translated voice / Your
  own voice) and `BridgeMeetMicNotice`. A pick is relayed and confirmed from the next snapshot
  (`useRelayedSwitch`); a refusal or the lock is toasted in the popup.
- Start step (`start-step.tsx`) — the chooser under the language, before Start. A room still on
  voice on a machine with no cable is moved to text once.
- Settings → "Meet hears you" (`settings-flyout.tsx`) — once live only Translated voice → Your own
  voice is enabled; the other option is greyed with "You can switch back ... after translation
  stops".
- Text mode shows the headphones advice (speakers play the call; the real mic can pick it up —
  server-side leak dedupe covers only part of it).
- The Meet-mic notice (widget shell and start step): text + Meet on the cable ("Meet can't hear
  you") or voice + Meet on the real mic ("Meet hears you untranslated"), with the allowed switch.
  Watched only while a main window runs the room.
- Strings: `rooms.bridgeWidget.audioMode.*`, `rooms.bridgeWidget.meetMic.*` (en / vi / ja).

## Files

`src/lib/meeting/bridge-audio-mode.ts` (new), `src/stores/bridge-audio-mode-store.ts` (new),
`src/components/rooms/bridge/widget/audio-mode-choice.tsx` (new),
`src/lib/desktop/bridge.ts`, `src/lib/desktop/bridge-tiers.ts`,
`src/lib/audio/bridge-inbound-source.ts`, `src/lib/meeting/bridge-widget-relay.ts`,
`src/lib/meeting/bridge-capturer.ts`, `src/services/translation-room.service.ts`,
`src/lib/api/endpoints.ts`, `src/types/translationRoom.ts`, `src/hooks/use-bridge-auto-room.ts`,
`src/hooks/use-bridge-widget-relay-host.ts`, `src/lib/auth/session-scoped-state.ts`,
`src/components/rooms/live/persistent-meeting-session.tsx`,
`src/components/rooms/bridge/bridge-setup-{wizard,dialog}.tsx`,
`src/components/rooms/bridge/widget/{start-step,settings-flyout,widget-shell,widget-context,use-bridge-widget-state}.tsx/ts`,
`src/components/rooms/bridge/widget/settings/use-bridge-widget-relay-client.ts`,
`messages/{en,vi,ja}/rooms.json`.

## Tests

- `npm run test:bridge-audio-mode` — the pure rules.
- `npm run test:bridge-widget-relay` — now includes `bridge-widget-relay-audio-mode.test.ts`.
- `npm run test:bridge-tiers` — text-only loopback capability.
- `npm run test:bridge-text-only` — contract: no outbound cable in text mode, the loopback asks for
  `"text-only"`, no text → voice while live, the popup never calls the endpoint, the claim never
  sends `"voice"`.

## Testing checklist

- [ ] No VB-CABLE, Windows with loopback: the claim sends `text`; the start step shows "Your own
      voice" selected, "Translated voice" greyed; no "cannot reach Google Meet" toast; the far side
      is transcribed (text-only loopback starts).
- [ ] Cable installed: voice by default; switching to text before Start and back works.
- [ ] Live in voice: Settings → Meet hears you → Your own voice works; Translated voice is then
      greyed until Stop.
- [ ] Text mode: nothing plays into "CABLE Input" (check with a recorder on CABLE Output).
- [ ] Meet set to CABLE Output in text mode → "Meet can't hear you" notice; Meet on the real mic in
      voice mode → "Meet hears you untranslated" with "Use my own voice".
- [ ] Older main window (no `audioMode` in its snapshot): the chooser is not shown / not switchable.

## Known limitations / notes for maintainers

- The popup's participant row is read once; the main window's snapshot is the authority for the
  mode whenever one is connected.
- A voice → text switch keeps a loopback capture that was started in voice mode (no restart).
- The Meet-mic state is per browser process, not per tab: another tab recording a mic counts.
- The mode is not shown in the main window's own UI (the popup is the bridge UI since WT-868).
