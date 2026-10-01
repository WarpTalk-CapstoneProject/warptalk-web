# Recap downloads (meeting record)

How a reader takes a copy of a meeting away, on `/{workspaceSlug}/rooms/{id}`.

## Current Behavior

- The record has **two** tabs: **Recap** and **Minutes**. The third one, **Artifacts**, is gone.
  It listed a meeting's files as rows named after their file type — "recording", "transcript
  export", "summary export" — beside tabs that render those very things in full. Every download now
  hangs off the surface that shows what it is a copy of.
- **Transcript** (Recap, transcript toolbar): `Download` is a menu with **Word document (.docx)**
  and **Plain text (.txt)**. Both hand over the transcript *as it is on screen* — the language being
  read, the Clean/Verbatim wording, the session and pause dividers, the speaker turns and the
  language chips — and both are always in the **Reading** shape, whatever layout is on screen. Chat
  and Timeline are postures for watching a meeting go by, not documents.
- **Summary** (Recap, reading rail control row): the download icon writes a Word file of the summary
  **as shown** — the current template and language rendering, the overview, and every section with
  its citation times. A reader looking at their own rendering (`rendering && !rendering.isCanonical`)
  gets a file that says so, and its name carries that language. Offered only when the summary is
  ready; it no longer fetches the server's `summary_export` artifact, which was the host's published
  summary whatever the reader had switched to.
- **Recording** (Recap, reading rail pip header): a download icon beside Hide/Show, using the same
  flow the record has always used — `useArtifactDownload().downloadArtifact`, consent stop included.
  A meeting with **more than one** recording still has no player (the page cannot say which file a
  moment belongs to), and the pip now opens anyway to offer `Recording 1`, `Recording 2`… as
  separate downloads.
  That header icon is the **only** recording download. The player's control bar used to carry a
  second one calling the same flow; it was removed (WT-894).
- **Player** (`MeetingRecordingPlayer`): the video frame is shown as recorded, nothing overlaid. The
  controls sit on their own light card below it. Marks are hidden until the pointer is over the
  timeline (or it has keyboard focus); then the track thickens and the dots appear.
- **Marks on the timeline** (`recording-marks.ts`, built in `ReadingRail`): one per summary point
  that carries a moment — decisions (green), action items (amber), open questions and blockers
  (indigo), narrative sentences of the traceable template (grey), other template sections
  (neutral). They come from the same points the rail draws, so a reader's own rendering puts its
  own moments on the bar. A mark sits on the transcript row the jump lands on (the earliest row any
  of the point's moments resolves to), and clicking it does what clicking the point's time in the
  rail does. Points closer than 1.5% of the recording share one dot with a count; its tooltip lists
  each point. No summary, or a summary whose points carry no moments, means no marks — there is no
  per-turn fallback (a 37-minute meeting used to get several hundred dots). Speaker lanes and
  user bookmarks are later work.
- **What the recording itself looks like** (`/egress/composite`, the page LiveKit's recorder opens):
  a camera-off person is drawn like the live meeting's camera-off tile — white tile, grey avatar,
  "Camera is off" pill, mic badge top-right — not a per-person coloured block. The face is the
  person's own avatar when their client published it as LiveKit participant metadata
  (`{"avatarUrl":"https://…"}`, set by `LocalMediaController` after connect; the join token carries
  `canUpdateOwnMetadata`). The page only draws a Google-hosted picture or the API's
  `/api/v1/auth/profile/avatar/` route, through `AvatarImage`; anything else, or a picture that
  fails to load, shows initials.
- File names come from `recordFileName`:
  `{Meeting title} - Transcript[ (LANG)] - yyyy-MM-dd.docx|.txt`. The title is `room.title`; the date
  is the **meeting's** own start (WT-311(c)), the same source the duration chip counts from. The
  language is included only when the reader chose a translation — never for "as spoken".
  A title over 80 characters is cut at a word and marked with an ellipsis, character for character
  the server's `DocumentFileName.Truncate`: a transcript and a minutes document of the same meeting
  have to be filed under the same spelling of its name.
  A **recording's** name is the server's, set by `Content-Disposition` on the presigned link, so the
  client sets none.
- Speaker names in both transcript downloads go through the same `speakerLabels` as the screen
  (`transcriptSpeakerDisplayName`): a Google Meet bridge line prints the Meet person, or the
  localized "Google Meet participants", never the stand-in's id or its "External Meeting" seat. Each
  Meet person is a separate turn. See `transcript-speaker-identity.md`.

## Files Affected

- `src/lib/documents/record-documents.ts` — the contract: `TranscriptDocumentModel`,
  `SummaryDocumentModel`, `RecordDocumentMeta`.
- `src/lib/documents/transcript-document-model.ts`,
  `src/lib/documents/summary-document-model.ts` — pure builders that turn what is on screen into
  those models, with tests in `__tests__/` (`npm run test:record-document-models`).
- `src/lib/documents/record-file-name.ts` — `recordFileName`.
- `src/lib/documents/transcript-docx.ts`, `summary-docx.ts`, `record-document-layout.ts` — the
  renderers (`buildTranscriptDocx`, `buildSummaryDocx`, `transcriptPlainText`), imported lazily from
  the click handlers so no reader pays for a document library to read a meeting.
- `src/components/rooms/meeting-transcript-panel.tsx` — the Download menu (shadcn `DropdownMenu`).
- `src/components/rooms/meeting-reading-rail.tsx` — the summary download, the recording download,
  and the meeting title/start threaded down to both.
- `src/components/rooms/meeting-record-panels.tsx` — `useArtifactDownload`, the player, and the
  per-recording buttons. `ArtifactsPanel` was deleted here.
- `src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx` — `MeetingRecordTab` is
  `"recap" | "minutes"`; the record section takes `meetingTitle` and `meetingStartedAt`.
- `src/lib/meeting/meeting-artifacts.ts` — `playableRecordings`, the one answer the player, the seek
  guard and the multi-recording notice share.
- `src/services/translation-room.service.ts`, `src/lib/ui/download-artifact.ts` —
  `artifactDownload(id, "attachment")` and the anchor click that saves it without a blank tab.

## Backend Contract

- `GET /room-artifacts/{id}/download` takes an optional `disposition`. Only
  `disposition=attachment` makes the presigned link carry
  `Content-Disposition: attachment; filename=…; filename*=UTF-8''…`. The default stays inline,
  because the in-page `<video>` reads its source from the same endpoint.
- Nothing else is fetched for a download: the transcript's and the summary's documents are written
  in the browser, from the rows the page is already rendering.

## Known Limitations

- The retained files that are nobody's reading surface (debug logs, audio samples) are only listed
  on the workspace's Artifacts library page.
- The avatar in a recording needs the backend's `canUpdateOwnMetadata` grant (warptalk-backend
  `LiveKitTokenService`) deployed first or together; without it `setMetadata` is refused and every
  tile shows initials. It also needs `NEXT_PUBLIC_API_URL` to be a public https origin, so uploaded
  avatars never appear in recordings made against a local `http://localhost` API.
- A meeting with several recordings still cannot be seeked into — that needs each file's duration,
  which the backend does not store yet (WT-655).
- **WT-683's "owed outputs" placeholder rows are gone with the tab, deliberately.** `pendingOutputs`
  and `artifactDownloadFormat` were deleted rather than moved: the first said which outputs an ended
  meeting is still owed ("Processing" inside the 15-minute window, "Not produced" after it), the
  second said which format a row's click would hand over. Each output now answers for itself where
  the reader already is — "Still writing this up" above Recap, the summary rail's generating state,
  the player's "Recording is being processed" — so nothing was lost by removing them. They did not
  move to the workspace Artifacts library either: that page lists what WarpTalk *wrote*, as cards a
  person reads, searches and cites, and a card for a document that does not exist (one per meeting
  that never produced a summary, for the life of the workspace) is not a document. If a surface ever
  needs the rule again, it is in this file's history and in WT-683.

## Testing Checklist

- [ ] Transcript `Download` opens a two-item menu; Escape and a click outside close it.
- [ ] A `.txt` and a `.docx` of the same meeting hold the same turns, dividers and language chips as
      the Reading layout, from Chat and Timeline as well.
- [ ] Reading the transcript in Japanese names the file `… - Transcript (JA) - yyyy-MM-dd.docx`;
      "as spoken" names it with no language.
- [ ] The summary download follows the template/language picker, and a non-published rendering says
      so inside the file.
- [ ] The summary download is absent while the summary is generating or missing.
- [ ] The recording's download button saves the file under the server's name, with no blank tab, and
      records consent on the first press.
- [ ] A meeting with two recordings shows `Recording 1` / `Recording 2` and no player.
- [ ] The player shows one download (in the pip header), controls below the frame, and no marks
      until the pointer is over the timeline.
- [ ] Hovering the timeline shows one dot per cited summary point (not per sentence), coloured by
      kind; points close together show as one numbered dot listing them; clicking seeks the video
      and lights the same rail point and transcript row a click in the rail would.
- [ ] A meeting without a summary shows no dots.
- [ ] In a recording, a person who turned the camera on mid-meeting appears on video; one with the
      camera off shows their avatar (or initials), "Camera is off" and a mic badge.
- [ ] The record has no Artifacts tab, and nothing links to one.
