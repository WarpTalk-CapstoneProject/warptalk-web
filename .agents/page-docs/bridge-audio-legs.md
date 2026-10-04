# Google Meet bridge: the two audio legs

In a bridge room (WarpTalk attached to a Google Meet call, desktop app) the main window plays
audio to two different places at once:

- **Outbound** — the host's own dub (or, before the first dub, the host's raw microphone) goes
  into the virtual cable that Meet uses as its microphone, so the Meet side hears it.
- **Inbound** — the Meet side's dub (bot `ai-interpreter-{lang}-{standInId}`) goes to the host's
  real speakers through the page's normal `<AudioTrack>` elements in `FilteredRoomAudio`.

## What changed (2026-10-04, "they hear my dub, I hear none of theirs")

The outbound dub used to be played by an `<audio>` element whose sink was the cable
(`setSinkId`). Chromium renders **every remote WebRTC audio track in a page through one shared
output**, and `setSinkId` on any element playing such a track moves the whole mix. So the Meet
side's dub, meant for the host's speakers, went into Meet's microphone too, and the host heard
nothing. It stayed there even after the dub's element was removed, for as long as any remote track
was attached.

Measured on the desktop's own Electron (42.11.3, Chrome 148) with two remote tracks:

| Setup | Cable | Speakers |
|---|---|---|
| Old: dub element `setSinkId(cable)`, other track on default | both tracks | no session at all |
| Old, then dub element removed | other track, stuck | nothing |
| New: dub through WebAudio, other track on default | dub only | other track only |
| Local track (raw mic) element `setSinkId(cable)`, remote track on default | mic only | remote track only |
| New without the muted keep-alive element | digital silence | — |

Now:

- A **remote** track (the dub) is never given a sink. `playRemoteTrackToDevice` keeps it decoding
  with a muted `<audio>` element (without one WebAudio receives silence) and plays it through an
  `AudioContext` created on no device (`{ sinkId: { type: "none" } }`), moved to the cable with
  `setSinkId`, and only then connected — so it never passes through the default output. A device
  that has gone rejects at `setSinkId`; a context the browser will not start is reported after 2 s
  instead of left silent.
- A **local** track (the host's raw microphone, `bridge-outbound-mic.tsx`) keeps the element with
  the cable as its sink (`playTrackToDevice`); the measurement shows it does not move the remote mix.
- `useTrackOnDevice(track, device, onError, message, source)` picks the path from `source`
  (`"remote"` for the dub, `"local"` by default). `openBridgeLegs` uses the remote path too.

## main.log line for the inbound leg

The log used to name only the outbound leg ("Meet now hears ..."), so "I hear no dub" could not be
told apart from "no dub was produced". `FilteredRoomAudio` now reports, once the stand-in is known
(never in a native meeting), a `[bridge] You ...` line on every change, which the desktop keeps in
`main.log`:

- headline: `dub` (with the bot identity), `no-dub`, `text` ("You hear" on Text),
  `not-translating`, `same-language`;
- the facts behind it: voice on/off, translation running or not, the listen language, and every
  dub of the stand-in in the room in any language, each `wanted` / `not wanted` and
  `subscribed` / `not subscribed`.

Rules in `src/lib/meeting/bridge-mic-device.ts`: `isDubOfSpeaker`, `bridgeInboundDub`,
`describeInboundDubChange`. Wired through `onBridgeInboundDubChange` →
`persistent-meeting-session.tsx` (`console.warn`, bridge rooms only).

## Files

- `src/lib/audio/bridge-audio-legs.ts` — `playTrackToDevice` (local), `playRemoteTrackToDevice`
  (remote), `DevicePlayback`, `openBridgeLegs`.
- `src/components/rooms/live/bridge-outbound-audio.tsx` — `BridgeOutboundAudio` (dub, `"remote"`),
  `useTrackOnDevice`.
- `src/components/rooms/live/filtered-room-audio.tsx` — inbound line.
- `src/components/rooms/live/persistent-meeting-session.tsx` — `handleBridgeInboundDubChange`.
- `src/lib/meeting/bridge-mic-device.ts` — inbound rules.

## Tests

- `npm run test:bridge-audio-legs` — the remote path never calls `setSinkId` on an element, the
  context goes none → cable → connect, stop releases once, a missing device and a context that
  will not start are errors, the local path is unchanged, and the dub component passes `"remote"`
  while the raw-mic component does not.
- `npm run test:bridge-mic-device` — `isDubOfSpeaker`, the five inbound states, the log line.

## Testing checklist

- Bridge call, voice mode, host listens in a language other than the Meet side's: the Meet side
  speaks and the host hears the dub on their speakers; the Meet side still hears the host's dub.
- `main.log` shows `[bridge] You now hear the Meet side's translated voice (ai-interpreter-...)`.
- Switch "You hear" to Text: the line changes to `"You hear" is on Text`.
- Unplug or disable the cable mid-call: the outbound error is shown, not a silent leg.

## Known limitations / notes for maintainers

- What Chromium does with sinks cannot be unit-tested; the tests hold the rule that follows from
  the measurement. Do not give any element playing a remote track a sink other than the page's.
- Needs `AudioContext.setSinkId` (Chromium 110+). Without it the outbound leg reports that the
  browser cannot choose an output device.
- Not yet verified on a live Meet call at the time of writing.
