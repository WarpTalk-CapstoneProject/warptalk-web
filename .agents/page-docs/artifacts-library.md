# Artifacts Library (`/{workspaceSlug}/artifacts`)

The workspace's written record — transcripts, AI summaries and minutes — as a personal library.

## Current behavior (2026-09-30 redesign)

- **Kind tabs:** Transcripts (default) · AI summaries · Minutes. There is no "All records" tab.
- **Scope tabs inside each kind:** All · Yours · Shared with you.
  - All = every document of that kind the viewer can read.
  - Yours = documents of meetings the viewer hosted.
  - Shared with you = readable documents of meetings someone else hosted.
- **One card = one document.** The thumbnail is the first page of the `.docx` that document downloads as (`DocumentPageThumbnail`): A4 page, Calibri, kind label, bold title, the header table (Date · Duration · Host · Participants · Language · Workspace), then turns or sections. Minutes use the **global** layout (MINUTES OF MEETING, status line, control table), never the Vietnamese NĐ30 form. The paper stays white in dark mode.
- Below the thumbnail: meeting title, then `You | host chip · Edited …`, plus a pill for a minutes state or a summary still being written.
- **Grid / List** toggle. Kind, scope and layout are all in the URL (`?kind=summary&scope=mine&view=list`); defaults are omitted.
- **Search by title only:** meeting name and room code, plus a minutes number. It never searches the body. The server gets the same term, and the client applies the title rule to what comes back.
- Cards link to `/artifacts/{roomId}?kind=…`.

## What is NOT listed

The page is personal for **every role, Owner/Admin included**:
- **Withheld documents** (HOST_ONLY, not shared) have no card, no tab and no count.
- **Transcripts with no speech** ("Nobody spoke") are not listed.
- **Failed or expired artifacts** are not listed.
- **Summaries still being written are listed**, with a "Writing…" pill.

Why: `ArtifactAccessHelper.HasAccessToRoomArtifacts` grants a body to the host, or to a participant/invitee when the room shares with participants, and never on the workspace role. The Owner/Admin widening of the room list therefore only added locked cards: 11 of 12 in the report.

## Data flow

- `useArtifactLibrary(workspaceId, { search, viewerId })`:
  - `useRoomHistory(..., { scope: "mine" })` calls `GET translation-rooms/history?scope=mine`. The backend maps it to `RoomTimelineScope.Mine`, the same boundary as My Meetings (WT-333).
  - The workspace minutes list is narrowed to the same meetings, plus minutes of meetings the viewer hosted.
- `buildArtifactLibrary` returns `LibraryEntry[]`. Each entry carries `rawBody`, the stored content unflattened, which the thumbnail and the `.docx` download rebuild summary sections from.
- The pure selection rules live in `src/lib/meeting/artifact-library.ts`, tested in `__tests__/artifact-library.test.ts`: `isListableEntry`, `entryScope`, `entryTitleMatches`, `listLibrary`, `libraryCounts`, `entryStartedAt`.
- The document models are `src/lib/documents/saved-record-documents.ts`, the same ones the downloads use.

## Files

- `src/app/(app)/[workspaceSlug]/artifacts/page.tsx`: tabs, toolbar, grid/list, empty states.
- `src/components/artifacts/artifact-card.tsx`: `ArtifactCard` and `ArtifactRow`.
- `src/components/artifacts/document-page-thumbnail.tsx`: the `.docx` first page in HTML.
- `src/hooks/use-artifact-library.ts`, `src/hooks/use-room-history.ts`, `src/services/room-history.service.ts`, `src/services/translation-room.service.ts`: the `scope` parameter.
- `src/lib/meeting/artifact-library.ts`: selection rules and `rawBody`.
- `src/components/artifacts/summary-reading-reader.tsx`: reads and downloads from `rawBody`.
- `messages/{en,vi,ja}/artifacts.json`
- `src/app/dev/records-library-preview/page.tsx`: fixture preview, not linked.

## Known limitations

- History is read one page at a time (100 meetings). Older meetings are not listed yet. A document-level endpoint (`GET translation-rooms/documents` with `scope`, `canOpen` filtered before paging, and a `preview`) is the planned follow-up.
- Minutes of a meeting beyond the loaded history page appear only when the viewer hosted it.
- The access icon from the design study (Only you / Shared with participants) is not shown: the history payload carries no room access level.

## Testing checklist

- [ ] `/artifacts` opens on Transcripts · All · Grid; the tab counts match the cards.
- [ ] As a workspace Owner, meetings you neither hosted, joined nor were invited to do not appear.
- [ ] A HOST_ONLY transcript of a meeting you joined does not appear; after the host shares it, it appears under Shared with you.
- [ ] A meeting where nobody spoke has no transcript card.
- [ ] A summary being written shows "Writing…" and fills in without a reload.
- [ ] Minutes thumbnails show the global layout.
- [ ] Searching a word that is only in the body returns nothing; the title or room code finds the meeting.
- [ ] Grid/List and the tabs survive a reload (URL).
- [ ] Dark mode: the page thumbnails stay white; the card chrome follows the theme.
