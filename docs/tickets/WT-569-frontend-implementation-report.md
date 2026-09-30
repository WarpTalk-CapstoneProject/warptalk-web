# WT-569 Frontend Implementation Report

## Scope

WT-569 asks for a centralized transcript and meeting-summary repository for both personal and workspace lookup:

- Personal route: `/artifacts`
- Workspace route: `/workspace/[slug]/artifacts` in the ticket wording; current app routing convention is `/{workspaceSlug}/...`, so the concrete app route should be `src/app/(app)/[workspaceSlug]/artifacts/page.tsx`
- Tabs: Yours / Personal and Workspace / Shared
- Filters: search, date range, artifact type: transcript TXT/JSON, summary, audio/video record
- Meeting Minutes Hub and DOCX export administrative standard
- Permissions must remain correct

WT-588 is supporting UX context: default meeting-record reading should be transcript-first, summary/action rail, compact player in the rail, bidirectional source sync, document-mode transcript layout at about 66ch, grouped speaker turns, 56px timestamp gutter, and responsive behavior at `>=1280`, `1024-1280`, and `<1024`.

No Linear ticket was created. This report only inspects frontend scope in `warptalk-web`; no backend or DOCX implementation was edited.

## Current Frontend State

### Routes

- `src/app/(app)/[workspaceSlug]/history/page.tsx`
  - Existing workspace-level finished-meeting archive.
  - Lists ended/cancelled rooms, search by title/code/host/language, filters all/completed/cancelled/with outputs.
  - Shows a selected meeting detail rail with retained outputs and inline preview/download.
  - Uses `useRoomHistory(activeWorkspaceId)`.

- `src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx`
  - Existing room detail surface.
  - Includes `MeetingRecordSection` with tabs: Transcript, Summary, Minutes, Artifacts.
  - Uses `useTranscriptByRoom`, `useTranscriptSegments`, `useTranscriptTranslations`, `useEndedRoomRecord`.
  - Has WT-588-adjacent work already: transcript-first tab, record expand control, recording player on Transcript/Summary, summary citation jumps to transcript, minutes citations jump to transcript.

- `src/app/(app)/[workspaceSlug]/documents/page.tsx`
  - Existing workspace document repository, not meeting artifacts.
  - Useful visual/table/filter patterns but should not absorb meeting artifacts, because its API and permission model are workspace documents.

- Current branch and `origin/development` both do not have:
  - `src/app/(app)/artifacts/page.tsx`
  - `src/app/(app)/[workspaceSlug]/artifacts/page.tsx`
  - Any room-level `src/app/(app)/[workspaceSlug]/rooms/[id]/artifacts/page.tsx`

### Components and Helpers

- `src/components/rooms/meeting-record-panels.tsx`
  - Reusable enough for record detail: `SummaryPanel`, `ArtifactsPanel`, `MeetingRecordingPlayer`, `MeetingRecordTabButton`, `useArtifactDownload`.
  - Currently tied to one `EndedRoomHistoryItem`, not a repository list.

- `src/components/rooms/meeting-transcript-panel.tsx`
  - Strong transcript reader/editor component.
  - Already supports chat/document/timeline layouts, language selection, correction, copy/export.
  - Document mode is not yet the WT-588 dedicated repository reading surface: it still renders as part of room detail and carries edit/live-meeting concerns.

- `src/components/rooms/artifact-content.tsx`
  - Parses summary JSON into readable summary sections and falls back to raw text.
  - Good candidate to extract/extend for repository previews.

- `src/lib/meeting/meeting-artifacts.ts`
  - Canonical artifact labels, status labels, download format, playable recording detection.
  - Needs extension if backend introduces distinct transcript JSON artifacts or video/audio split types.

- `src/lib/meeting/record-sharing.ts`
  - Correctly models current record access: `HOST_ONLY` vs `ALL_PARTICIPANTS`.
  - Important: it treats unknown access levels as not shared. Current tests explicitly assert `WORKSPACE` is not shared.

- `src/lib/meeting/room-history-mapping.ts`
  - Shared artifact state, duration, retention, summary state, polling and pagination helpers.
  - Notes that artifact retention is not truly implemented server-side today.

### Services and Hooks

- `src/services/room-history.service.ts`
  - Maps `/translation-rooms/history` into `EndedRoomHistoryItem`.
  - Supports `workspaceId`, status, search, page/pageSize, and client-side artifact status.
  - Only exposes workspace-ended history, not personal cross-workspace lookup.

- `src/hooks/use-room-history.ts`
  - Query key is workspace-first and filter-aware.
  - Polls while artifacts are processing or newly-ended records are expected.
  - Does not currently drive URL-backed filters/paging in the history page.

- `src/services/my-meetings.service.ts` and `src/hooks/use-my-meetings.ts`
  - Existing personal timeline source via `/translation-rooms/my-meetings`.
  - Carries artifacts on each meeting, but it is date-windowed by month and includes upcoming/live/past, not a repository of retained artifacts.

- `src/services/meeting-minutes.service.ts`, `src/hooks/use-meeting-minutes.ts`, `src/components/rooms/minutes-panel.tsx`
  - Existing meeting minutes lifecycle and DOCX download per room.
  - No centralized minutes hub yet.

## Gap Analysis

### 1. Centralized artifact routes are missing

There is no personal `/artifacts` route and no workspace `/{workspaceSlug}/artifacts` route. The nearest route, `/{workspaceSlug}/history`, is meeting-centric rather than artifact-centric.

### 2. Existing data model is meeting-first

`EndedRoomHistoryItem` nests artifacts inside meetings. WT-569 needs an artifact repository row model that can list transcript, summary, recording, and minutes records directly while still linking back to the meeting.

Recommended frontend row shape:

```ts
type MeetingArtifactKind =
  | "transcript_txt"
  | "transcript_json"
  | "summary"
  | "recording_audio"
  | "recording_video"
  | "minutes_docx";

type MeetingArtifactRepositoryItem = {
  id: string;
  roomId: string;
  workspaceId: string;
  workspaceSlug?: string;
  meetingTitle: string;
  hostName: string;
  createdAt: string;
  endedAt?: string;
  kind: MeetingArtifactKind;
  status: RoomArtifactStatus;
  visibility: "personal" | "workspace" | "host_only" | "participants";
  formatLabel: string;
  fileSizeBytes?: number;
  source: RoomHistoryArtifact["backendSource"] | "meeting_minutes";
};
```

This should be derived client-side at first from existing meeting history only if backend has no repository endpoint. Long-term, a backend endpoint should return this shape directly because permissions, cross-workspace personal scope, artifact type/date filtering, and total counts are server concerns.

### 3. Personal vs workspace tab semantics are not backed by current frontend APIs

Current options:

- Workspace/shared source: `translationRoomService.history({ workspaceId })`
- Personal source: `translationRoomService.myMeetings({ workspaceId, from, to })`

That means current frontend can only build "Yours" inside the active workspace unless it loops all workspaces and month windows. A real `/artifacts` personal route likely needs backend support for "my retained meeting artifacts across workspaces".

### 4. Artifact type filter cannot be exact yet

Current `RoomArtifactType` is:

- `transcript_export`
- `summary_export`
- `recording`
- `debug_log`
- `audio_sample`

WT-569 wants:

- Transcript TXT
- Transcript JSON
- Summary
- Audio/Video Record

Current frontend does not know whether `recording` is audio or video except maybe through format/content type from download, and `artifactDownloadFormat()` deliberately displays transcript and summary as `TXT` because current download behavior serves them as plain text. A JSON transcript filter needs either backend artifact metadata or a separate transcript export list per transcript.

### 5. Meeting Minutes Hub is per-room only

`MinutesPanel` supports draft/edit/sign/approve/download for one room. There is no list of minutes across meetings, no minutes status counts, no route-level "hub", and no workspace-level minutes service.

### 6. DOCX export standard is server-side

Frontend has `meetingMinutesService.downloadDocx(roomId)` only. The template keys `vn-nd30` and `global-en` are not selectable or visible in frontend. If WT-569 requires a professional DOCX export standard, the frontend can expose template/status/download UX, but template rendering and compliance belong to backend/DOCX scope.

### 7. WT-588 is partly implemented but not in repository form

Room detail has transcript-first record reading and player/summary sync, but it is not the exact Option C layout:

- Summary/action content is a tab, not a persistent right rail.
- Recording player is above Transcript/Summary content, not compact PiP/player in rail.
- Transcript document mode exists, but default layout state inside `MeetingTranscriptArtifact` is currently `"chat"`, not WT-588 transcript-primary document surface.
- The route-level record area has an expand button, not the stated `>=1280` two-column repository reader with rail width rules.

## Proposed Frontend File Changes

### New Files

- `src/app/(app)/artifacts/page.tsx`
  - Personal artifact repository route for `/artifacts`.
  - If current app route grouping requires authenticated app chrome, verify `(app)/layout.tsx` supports a non-workspace child. If not, create a redirect to active workspace until backend personal API exists.

- `src/app/(app)/[workspaceSlug]/artifacts/page.tsx`
  - Workspace artifact repository route for `/{workspaceSlug}/artifacts`.
  - Use active workspace id from `useWorkspaceStore`, same pattern as `history/page.tsx`.

- `src/components/artifacts/artifact-repository-page.tsx`
  - Shared page shell for Personal and Workspace modes.
  - Owns tabs, filters, table/list, empty/loading/error states.

- `src/components/artifacts/artifact-repository-table.tsx`
  - Dense, scan-friendly rows: artifact kind, meeting, host, date, visibility/status, format, actions.

- `src/components/artifacts/artifact-preview-panel.tsx`
  - Detail/preview panel.
  - For transcript: use a read-only extraction of `MeetingTranscriptArtifact` or link to room record until the transcript-reader extraction is done.
  - For summary: reuse/extract `ArtifactContentView`.
  - For recording: reuse `MeetingRecordingPlayer`.
  - For minutes: show minutes status and DOCX download.

- `src/components/artifacts/artifact-filters.tsx`
  - Search, date range, type filter, status/visibility filter if product wants it.
  - Prefer `FilterChip`, `FilterChipGroup`, and `ExpandingSearchDock` for consistency.

- `src/services/artifact-repository.service.ts`
  - Facade over current APIs first.
  - Later replace internals with backend `/artifacts` endpoints without touching pages.

- `src/hooks/use-artifact-repository.ts`
  - TanStack Query hooks with workspace/personal scope in key.

- `src/types/artifactRepository.ts`
  - Row/query/filter DTOs and normalized frontend item shape.

- `src/lib/artifacts/artifact-repository-mapping.ts`
  - Pure mapping from `EndedRoomHistoryItem` / `MyMeetingItem` / minutes DTO into repository rows.
  - Unit-test this rather than testing the page for mapping logic.

- `src/lib/artifacts/__tests__/artifact-repository-mapping.test.ts`
  - Assert type mapping, date filtering inputs, visibility labels, no cross-workspace cache leakage, and no duplicate rows.

### Existing Files to Modify

- `src/components/layout/linear-sidebar.tsx`
  - Add workspace nav entry: `Artifacts` or `Meeting records`, route `/${slug}/artifacts`.
  - Decide whether it sits near `History` or under `Documents`. Recommendation: main nav near `History`, because these are meeting outputs, not uploaded knowledge documents.

- `src/lib/api/endpoints.ts`
  - Add `artifacts` endpoints only when backend exists.
  - If no backend endpoint exists, do not fake endpoint constants; keep the facade over existing services.

- `src/services/room-history.service.ts`
  - Possibly expose `mapHistoryItem` or keep mapping private and map repository rows from public `EndedRoomHistoryItem`.

- `src/components/rooms/meeting-transcript-panel.tsx`
  - Extract read-only transcript document renderer only if the repository preview must render transcript inline.
  - Avoid dragging correction/finalize/live-meeting behavior into the central repository.

- `src/components/rooms/artifact-content.tsx`
  - Move `readableArtifactBody`/summary rendering into a shared artifact preview helper if repository needs identical summary preview.

- `src/components/rooms/meeting-record-panels.tsx`
  - Keep `MeetingRecordingPlayer` and `useArtifactDownload` reusable.
  - Avoid changing room detail behavior unless implementing WT-588 Option C for the room page too.

## Implementation Steps

1. Add a pure repository mapping layer.
   - Flatten `EndedRoomHistoryItem.artifacts` into artifact rows.
   - Add synthetic `minutes_docx` rows only after deciding how to fetch minutes status without one request per room.
   - Keep meeting-level fields on each row so the table can search/sort without drilling.

2. Build workspace repository route first.
   - Use `useRoomHistory(activeWorkspaceId, { page, pageSize, status: "ended", search })`.
   - Apply type/date filters client-side only for first pass, but document that totals are not exact until backend supports server filters.
   - Link every row to `/${workspaceSlug}/rooms/${roomId}`.

3. Add repository UI.
   - Toolbar: tabs Personal/Workspace, search, date range, artifact type chips/select.
   - Table: artifact, meeting, date, owner/host, status, visibility, actions.
   - Preview panel: summary text preview, transcript opens room Transcript tab or inline read-only transcript if extracted, recording play/download, minutes download.

4. Add personal route.
   - Minimum safe version: redirect or scope to active workspace's `my-meetings` until backend supplies cross-workspace personal repository.
   - Better version: fetch all member workspaces and current-month/past windows carefully, but this can be expensive and still incomplete.

5. Add navigation.
   - Workspace sidebar entry to `/${slug}/artifacts`.
   - Optional global entry for `/artifacts` only after the route has a real personal scope.

6. Add Meeting Minutes Hub.
   - If backend has a list endpoint, show minutes rows/status directly.
   - Without list endpoint, keep minutes inside meeting record and add only a "Minutes" artifact row when data is already present or fetched on preview.
   - Expose DOCX download with current `meetingMinutesService.downloadDocx(roomId)`.

7. Align WT-588 reading surface.
   - For repository preview, default transcript view should be document mode, not chat mode.
   - Implement layout with `>=1280` transcript + 320-360px rail, `1024-1280` 320px rail with PiP hidden/collapsed, `<1024` stacked.
   - Keep summary/action rail and compact player in the preview/detail surface.

8. Replace facade internals when backend endpoints land.
   - Preserve component/query contracts.
   - Move search/date/type filtering and total counts server-side.

## Permissions Notes

- Do not infer visibility from row presence alone. Existing code distinguishes "artifact row exists" from "content shared with this viewer".
- Keep `isArtifactWithheld()` handling for preview/download.
- Preserve `record-sharing.ts` behavior unless backend expands access vocabulary. Current tests intentionally treat `WORKSPACE` as not shared.
- Workspace repository must key queries by workspace id first, following `use-room-history.ts`, to avoid cache bleed.
- Personal route should not aggregate workspace history by guessing if the backend has stricter participant-based rules.

## Risks

- Client-side flattening can give wrong totals for artifact-type/date filters because pagination is meeting-based, not artifact-based.
- Fetching personal artifacts by looping workspaces and month windows can miss older artifacts or produce expensive initial loads.
- Minutes hub can become N+1 if it calls `getByRoom` for every room.
- Transcript JSON vs TXT cannot be reliably filtered with current `RoomArtifactType` metadata.
- Recording audio vs video cannot be reliably split unless backend sends recording media type.
- WT-588 inline transcript preview should not reuse correction/finalize controls in a repository context.

## Test Plan

- Unit tests:
  - `src/lib/artifacts/__tests__/artifact-repository-mapping.test.ts`
  - Mapping from transcript/summary/recording artifacts to repository kinds.
  - Unknown artifact types are excluded or mapped conservatively.
  - Visibility/status labels use existing helpers.
  - Date range filtering uses artifact `updatedAt || createdAt`, not room `createdAt`.

- Existing tests to run:
  - `src/lib/meeting/__tests__/record-sharing.test.ts`
  - `src/lib/meeting/__tests__/meeting-artifacts.test.ts` if present; otherwise add one for new type labels.
  - `src/lib/meeting/__tests__/room-history-mapping.test.ts`
  - `src/types/__tests__/minutes-pairing.test.ts`

- UI/manual tests:
  - Workspace member can see only shared/allowed records.
  - Host sees draft/private records and can still navigate to room record.
  - Summary artifact preview parses JSON into readable text, not raw JSON.
  - Withheld artifact shows neutral withheld state, not generic error.
  - DOCX download uses server filename when available.
  - Responsive checks at 1366px, 1100px, and 390px.

## Safe Patch Recommendation

Do not implement the full WT-569 frontend until the backend scope for personal `/artifacts`, workspace/shared filters, transcript JSON, recording media type, and minutes list is confirmed.

A safe small frontend patch is:

1. Add `src/types/artifactRepository.ts`.
2. Add `src/lib/artifacts/artifact-repository-mapping.ts` with tests.
3. Add `src/components/artifacts/artifact-repository-page.tsx` behind workspace-only data from `useRoomHistory`.
4. Add `src/app/(app)/[workspaceSlug]/artifacts/page.tsx`.
5. Add sidebar nav entry.

Hold `/artifacts` personal route and Meeting Minutes Hub until there is a backend endpoint or an explicit acceptance that the first version is active-workspace-only.
