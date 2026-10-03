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
- Relabel pickup: `useTranscriptSegments` sets `refetchOnMount` / `refetchOnWindowFocus` explicitly.
  With the shared 60 s `staleTime`, the record re-reads its segments when the reader comes back
  and picks up the relabelled names without a hard reload. There is no polling.

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
- [ ] `npm run test:transcript-speaker` passes.
