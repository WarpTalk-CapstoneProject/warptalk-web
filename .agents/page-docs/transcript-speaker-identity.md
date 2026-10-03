# Transcript speaker identity (incl. the Google Meet side of a bridge room)

Who said a transcript line, how that name is printed, and how lines are grouped by speaker, on
every transcript surface: the live transcript panel, the caption lane, the bridge popup's transcript,
the meeting record (`/{workspaceSlug}/rooms/{id}`: Chat / Reading / Timeline layouts, talk time in
the reading rail) and the `.txt` / `.docx` downloads.

## What changed and why

In an EXTERNAL_BRIDGE room everybody on the Google Meet side is ONE participant: the stand-in
`BRIDGE_STAND_IN_USER_ID` (`…b21d`). The roster calls that seat "External Meeting". The gateway puts
the real person on each segment instead: `speakerName` is the Meet speaker read off Meet's captions
when confidence ≥ 0.6, otherwise "Google Meet participants". After the meeting a relabel job rewrites
the saved names from Google's transcript, with **no realtime event**.

Two bugs followed:

1. **Name.** `resolveTranscriptSpeakerName` preferred the roster name, so the live transcript said
   "External Meeting" for every Meet line.
2. **Identity.** Every grouping keyed the speaker by participant id (`speakerParticipantId ??
   speakerName`, or `speakerId` live). All Meet people share one id, so "Lan / Minh / Lan" merged into
   one turn under Lan's name, with one colour and one talk-time share.

## Current behavior

- One pure module, `src/lib/transcript/speaker-identity.ts`, holds the rule:
  - `transcriptSpeakerKey(segment)`: who spoke, as a key. Stand-in = `id::name` (case-folded),
    one key per Meet person, with the unattributed lines sharing one key. Everyone else is unchanged:
    participant id, else display name.
  - `transcriptSpeakerDisplayName(id, name, labels?)`: stand-in = the Meet person, else the
    far-side fallback label. The roster's "External Meeting", the wire fallback and any GUID
    (old saved lines hold `…b21d` as the name) all count as "nobody". Everyone else = recorded name,
    else the unknown label.
  - `localizeFarSideSpeakerName`: swaps only the wire fallback for the reader's label.
- The fallback label is `meetingTranscript.speaker.googleMeetParticipants` (en/vi/ja).
  `BRIDGE_FAR_SIDE_FALLBACK_NAME` is the backend's wire value, used only for matching and as the
  default when no label is passed in (the live store, which resolves names on arrival).
- Live: `resolveTranscriptSpeakerName` answers for the stand-in before it reads the roster. Utterance
  merge (`groupTranscriptSegments`) and caption speaker runs (`live-subtitle-overlay`) key by
  `transcriptSpeakerKey`. Faces come from `transcriptIdentityFor` / `useTranscriptSpeakerIdentity`, which
  build the stand-in's face from the line's name (initials per Meet person) and keep only the
  seat's language. Video tiles still use `identityFor`, because a tile *is* the seat. The bridge
  popup's bubble follows the same rule as the in-meeting panel.
- Record: `groupSavedTranscriptSegments`, `groupIntoSpeakerTurns`, `speakingShares` key by
  `transcriptSpeakerKey`. `resolveTranscriptSpeaker` gives each Meet person their own `id`, which
  drives the colour, and never a face. The panel builds `speakerLabels` once and passes it to rows,
  turns, the `.txt` (`assembleTranscriptText`) and the `.docx` model (`buildTranscriptDocumentModel`'s
  `speakerLabels`).
- Late far-speaker name (hub event `TranscriptSegmentSpeakerNamed { segmentId, speakerName }`, see
  below).
- Relabel pickup: `useTranscriptSegments` sets `refetchOnMount` / `refetchOnWindowFocus` explicitly.
  With the shared 60 s `staleTime`, the record re-reads its segments when the reader comes back
  and picks up the relabelled names without a hard reload. There is no polling.

## Late far-speaker name (`TranscriptSegmentSpeakerNamed`)

**Why.** Meet's captions name a new speaker about a second after their first words. So the first
line after a change of speaker is finalized with nobody on it and goes out as "Google Meet
participants", although it is the line that most needs a name. PO decision: show it at once,
unchanged, then rename it in place. The ai worker looks again at ~+1 s / ~+2.5 s and publishes at
most one late name per segment, only at confidence ≥ 0.6. The gateway broadcasts
`TranscriptSegmentSpeakerNamed { segmentId, speakerName }` to `translationRoom:{roomId}`, and
TranscriptService writes the same name onto the saved row.

**Rule** (`applyLateFarSpeakerName` in `speaker-identity.ts`, pure, one rule for every holder of
live lines):

- Only the line with that `segmentId` (GUID compared case-insensitively). Unknown id → the same
  array back. Nothing is created.
- Only a stand-in line, and only while it names nobody (`bridgeFarSideSpeakerName` null: the wire
  fallback, "External Meeting", a GUID, empty). A real name is never overwritten.
- A late name that is itself "nobody" changes nothing. Idempotent: a repeat returns the same array.
- Text, translations, clock and the segment id stay. Grouping needs nothing extra:
  `transcriptSpeakerKey` reads the name, so on the next render the line leaves the unnamed run and
  joins its person's turn. React keys stay the segment ids, so nothing is drawn twice.

**Where it is applied:**

- In-meeting: `persistent-meeting-session.tsx` registers the handler next to
  `TranscriptSegmentReceived`. The store action `nameTranscriptSegmentSpeaker` renames in both lanes
  (caption + transcript) and returns `{}` when neither changed. It is not behind the transcript gate,
  because it adds no line. It goes away with the connection (`connection.stop()` in the effect
  cleanup), like every other handler on it.
- A revision of the same segment (`mergeTranscriptSegment`) keeps the name:
  `revisedFarSideSpeakerName` does not let a copy carrying the fallback take a named Meet line back
  to "nobody". A revision with a real name of its own still wins.
- Bridge popup (`use-bridge-widget-state.ts`): it registers the same handler on its hub connection.
  That handler is silent today, because the popup never joins the room group. The popup picks the
  name up from the saved transcript poll, because TranscriptService updated the row.
- Saved-row backstop (`buildCatchUpTranscript`): a live line that still says nobody adopts the saved
  row's name by the same rule (`lateFarSpeakerNameFor`), in one pass over the live lines. This covers
  a client that missed the event, for example during a reconnect, once its saved segments refetch.
- Old backends never send the event. Every line then keeps the fallback, as before.

## Files affected

- `src/lib/transcript/speaker-identity.ts` (new), `__tests__/speaker-identity.test.ts` (new)
- `src/lib/transcript/transcript-display.ts`: `resolveTranscriptSpeakerName`,
  `groupIntoSpeakerTurns(segments, labels?)`, `belongsToSameUtterance`,
  `belongsToSameSavedUtterance`
- `src/lib/transcript/document-reading.ts`: `speakingShares(lines, labels?)`
- `src/lib/transcript/speaker-color.ts`: `resolveTranscriptSpeaker(id, name, directory?, labels?)`
- `src/lib/transcript/transcript-language.ts`: `assembleTranscriptText(..., labels?)`
- `src/lib/documents/transcript-document-model.ts`: `speakerLabels` option
- `src/lib/meeting/participant-identity.ts`: `transcriptIdentityFor`
- `src/components/rooms/live/meeting-identity-context.tsx`: `useTranscriptSpeakerIdentity`
- `src/components/rooms/live/side-panel/transcript-panel.tsx`, `live-subtitle-overlay.tsx`
- `src/components/rooms/meeting-transcript-panel.tsx`, `meeting-reading-rail.tsx`
- `src/components/rooms/bridge/widget/transcript/widget-transcript-bubble.tsx`: the popup over Meet
  draws its bubbles exactly like the in-meeting panel (`localizeFarSideSpeakerName` +
  `useTranscriptSpeakerIdentity`); its grouping goes through `groupTranscriptSegments`
- `src/hooks/use-transcripts.ts`
- `messages/{en,vi,ja}/meetingTranscript.json`: `speaker.googleMeetParticipants`
- `scripts/check-transcript-speaker-contract.mjs`: rule 6
- Late name: `speaker-identity.ts` (`applyLateFarSpeakerName`, `lateFarSpeakerNameFor`,
  `revisedFarSideSpeakerName`), `src/types/realtime.ts` (`TranscriptSegmentSpeakerNamedDto`),
  `src/stores/translationRoom-store.ts` (`nameTranscriptSegmentSpeaker`, `mergeTranscriptSegment`),
  `persistent-meeting-session.tsx` (handler), `use-bridge-widget-state.ts` (handler + revision),
  `transcript-catch-up.ts` (saved-row backstop), `__tests__/far-speaker-late-name.test.ts` (in
  `test:transcript-speaker`)

## Known limitations

- Two Meet people with the same display name are one speaker. Meet gives the client nothing better.
- The colour is derived from the per-person key, so two Meet people can still share one of the six
  colours. The name and the initials still tell them apart.
- Saved Markdown bodies (`saved-record-documents.ts`) are server text and group by the printed name.
  They are already distinct per Meet person once the server writes real names.

## Testing checklist

- [ ] Live bridge room: a Meet line shows the Meet speaker's name, never "External Meeting".
      Unattributed lines show "Google Meet participants" (in vi: "Người tham gia Google Meet").
- [ ] Two Meet people alternating are separate bubbles, separate caption runs, separate turns,
      separate colours/initials and separate talk-time rows.
- [ ] After the meeting's relabel job, switch away from the record tab and back (> 60 s later). The
      names update without a reload.
- [ ] `.txt` and `.docx` downloads print the Meet person, or the localized fallback, never `…b21d`.
- [ ] Late name, in a real call with at least two people on the Meet side: when the speaker changes,
      the first line appears as "Google Meet participants" and is renamed to the new speaker
      within about 1–3 s. It joins that person's bubble without a duplicate, and its translation
      stays under it. A line that already had a name is never renamed.
- [ ] Late name, after the meeting: the record shows the same name on that line (the saved row was
      updated), and the bridge popup shows it on its next poll.
- [ ] `npm run test:transcript-speaker` passes.
