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
- File names come from `recordFileName`:
  `{Meeting title} - Transcript[ (LANG)] - yyyy-MM-dd.docx|.txt`. The title is `room.title`; the date
  is the **meeting's** own start (WT-311(c)), the same source the duration chip counts from. The
  language is included only when the reader chose a translation — never for "as spoken".
  A title over 80 characters is cut at a word and marked with an ellipsis, character for character
  the server's `DocumentFileName.Truncate`: a transcript and a minutes document of the same meeting
  have to be filed under the same spelling of its name.
  A **recording's** name is the server's, set by `Content-Disposition` on the presigned link, so the
  client sets none.

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
- A meeting with several recordings still cannot be seeked into — that needs each file's duration,
  which the backend does not store yet (WT-655).

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
- [ ] The record has no Artifacts tab, and nothing links to one.
