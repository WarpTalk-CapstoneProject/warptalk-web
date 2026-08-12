import { parseMeetingSummaryContent } from "@/types/meetingSummary";
import type { EndedRoomHistoryItem, RoomHistoryResponse } from "@/types/roomHistory";
import type { PagedResult, TranscriptDto, TranscriptSegmentDto } from "@/types/transcript";
import type {
  TranslationRoomArtifactDto,
  TranslationRoomDto,
  TranslationRoomHistoryItemDto,
  TranslationRoomParticipantDto,
} from "@/types/translationRoom";

export const MEETING_SUMMARY_SEED_WORKSPACE_SLUG = "fpt-sep490-su26";
export const MEETING_SUMMARY_SEED_WORKSPACE_ID = "summary-seed-workspace-fpt-sep490-su26";
export const MEETING_SUMMARY_SEED_ROOM_ID = "summary-seed-room-fpt-sep490-su26";
export const MEETING_SUMMARY_SEED_TRANSCRIPT_ID = "summary-seed-transcript-fpt-sep490-su26";

const CREATED_AT = "2026-08-11T01:45:00.000Z";
const STARTED_AT = "2026-08-11T02:00:00.000Z";
const ENDED_AT = "2026-08-11T02:38:00.000Z";
const DURATION_SECONDS = 38 * 60;

const SUMMARY_CONTENT = JSON.stringify({
  templateKey: "standup",
  summary:
    "The sprint sync focused on validating meeting-summary output, tightening the document access review flow, and preparing the workspace demo checklist. The team agreed to keep the current UI behavior stable while using this seed room to test citations, action items, artifact download states, and the post-meeting summary tab.",
  progress: [
    {
      owner: "Alice Smith",
      text: "Confirmed the room-detail summary tab can render a generated overview with cited sections.",
      atMs: 185000,
    },
    {
      owner: "Bob Johnson",
      text: "Finished the sample document import checks and verified the document library still opens review pages.",
      atMs: 512000,
    },
    {
      owner: "Diana Prince",
      text: "Reviewed the workspace-member seed set that will be used for access-policy testing.",
      atMs: 780000,
    },
  ],
  plans: [
    {
      owner: "Alice Smith",
      text: "Use the seeded meeting to QA summary copy, citation jumps, and artifact cards after every UI pass.",
      atMs: 1030000,
    },
    {
      owner: "Charlie Brown",
      text: "Record any mismatch between backend artifact status and frontend summary state in the integration notes.",
      atMs: 1285000,
    },
  ],
  blockers: [
    {
      owner: "Charlie Brown",
      text: "Backend summary regeneration can be tested only after the AI worker is available locally.",
      atMs: 1510000,
    },
  ],
  decisions: [
    {
      text: "Keep this seed data frontend-only so local UI testing does not mutate shared development data.",
      atMs: 1675000,
    },
    {
      text: "Treat the summary tab as the source of truth for structured meeting-summary rendering.",
      atMs: 1810000,
    },
  ],
  actionItems: [
    {
      owner: "Alice Smith",
      task: "Run a manual QA pass from Rooms to Summary and Artifacts using the seed room.",
      atMs: 1970000,
    },
    {
      owner: "Bob Johnson",
      task: "Compare generated-summary export content against the room history artifact card.",
      atMs: 2075000,
    },
    {
      owner: "Diana Prince",
      task: "Prepare a short test checklist for summary citation jumps before the demo.",
      atMs: 2160000,
    },
  ],
  openQuestions: [
    {
      text: "Should production expose a backend-owned demo workspace seed, or should demo data stay client-side?",
      atMs: 2210000,
    },
  ],
});

export const meetingSummarySeedRoom: TranslationRoomDto = {
  id: MEETING_SUMMARY_SEED_ROOM_ID,
  workspaceId: MEETING_SUMMARY_SEED_WORKSPACE_ID,
  hostId: "seed-user-alice",
  title: "Seed: AI Summary Review - SEP490 Sprint Sync",
  description:
    "Frontend seed room for testing meeting summaries, summary citations, transcript review, and retained artifacts.",
  translationRoomCode: "SUM-SEED",
  status: "ended",
  translationRoomType: "scheduled",
  maxParticipants: 12,
  sourceLanguage: "en",
  targetLanguages: ["vi", "ja"],
  scheduledAt: STARTED_AT,
  startedAt: STARTED_AT,
  endedAt: ENDED_AT,
  durationSeconds: DURATION_SECONDS,
  createdAt: CREATED_AT,
  settings: { requiresApproval: false },
  participantCount: 5,
  isHost: true,
};

export const meetingSummarySeedParticipants: TranslationRoomParticipantDto[] = [
  {
    id: "seed-participant-alice",
    translationRoomId: MEETING_SUMMARY_SEED_ROOM_ID,
    userId: "seed-user-alice",
    displayName: "Alice Smith",
    role: "host",
    speakLanguage: "en",
    listenLanguage: "vi",
    status: "left",
    joinedAt: STARTED_AT,
  },
  {
    id: "seed-participant-bob",
    translationRoomId: MEETING_SUMMARY_SEED_ROOM_ID,
    userId: "seed-user-bob",
    displayName: "Bob Johnson",
    role: "participant",
    speakLanguage: "en",
    listenLanguage: "vi",
    status: "left",
    joinedAt: "2026-08-11T02:01:00.000Z",
  },
  {
    id: "seed-participant-charlie",
    translationRoomId: MEETING_SUMMARY_SEED_ROOM_ID,
    userId: "seed-user-charlie",
    displayName: "Charlie Brown",
    role: "participant",
    speakLanguage: "en",
    listenLanguage: "ja",
    status: "left",
    joinedAt: "2026-08-11T02:02:00.000Z",
  },
  {
    id: "seed-participant-diana",
    translationRoomId: MEETING_SUMMARY_SEED_ROOM_ID,
    userId: "seed-user-diana",
    displayName: "Diana Prince",
    role: "participant",
    speakLanguage: "vi",
    listenLanguage: "en",
    status: "left",
    joinedAt: "2026-08-11T02:03:00.000Z",
  },
  {
    id: "seed-participant-demo",
    translationRoomId: MEETING_SUMMARY_SEED_ROOM_ID,
    userId: "seed-user-demo",
    displayName: "Demo User",
    role: "participant",
    speakLanguage: "ja",
    listenLanguage: "en",
    status: "left",
    joinedAt: "2026-08-11T02:05:00.000Z",
  },
];

export const meetingSummarySeedTranscript: TranscriptDto = {
  id: MEETING_SUMMARY_SEED_TRANSCRIPT_ID,
  workspaceId: MEETING_SUMMARY_SEED_WORKSPACE_ID,
  translationRoomId: MEETING_SUMMARY_SEED_ROOM_ID,
  version: 1,
  status: "finalized",
  sourceLanguage: "en",
  totalSegments: 8,
  totalDurationMs: DURATION_SECONDS * 1000,
  createdAt: STARTED_AT,
  updatedAt: ENDED_AT,
  finalizedAt: ENDED_AT,
};

export const meetingSummarySeedTranscriptSegments: TranscriptSegmentDto[] = [
  {
    id: "seed-segment-001",
    speakerParticipantId: "seed-participant-alice",
    speakerName: "Alice Smith",
    originalLanguage: "en",
    originalText:
      "Thanks everyone. Today I want us to validate the meeting-summary experience from the room list into the summary tab.",
    confidence: 0.97,
    startTimeMs: 155000,
    endTimeMs: 205000,
    sequenceOrder: 1,
  },
  {
    id: "seed-segment-002",
    speakerParticipantId: "seed-participant-bob",
    speakerName: "Bob Johnson",
    originalLanguage: "en",
    originalText:
      "The document import check is complete. I can still open the library, review metadata, and compare output artifacts.",
    confidence: 0.95,
    startTimeMs: 490000,
    endTimeMs: 545000,
    sequenceOrder: 2,
  },
  {
    id: "seed-segment-003",
    speakerParticipantId: "seed-participant-diana",
    speakerName: "Diana Prince",
    originalLanguage: "vi",
    originalText:
      "Phan danh sach thanh vien trong workspace da on de dung cho viec kiem tra access policy.",
    confidence: 0.94,
    startTimeMs: 755000,
    endTimeMs: 810000,
    sequenceOrder: 3,
  },
  {
    id: "seed-segment-004",
    speakerParticipantId: "seed-participant-alice",
    speakerName: "Alice Smith",
    originalLanguage: "en",
    originalText:
      "For the next pass, please use this seeded meeting as the baseline for summary copy, citations, and artifact cards.",
    confidence: 0.96,
    startTimeMs: 1010000,
    endTimeMs: 1065000,
    sequenceOrder: 4,
  },
  {
    id: "seed-segment-005",
    speakerParticipantId: "seed-participant-charlie",
    speakerName: "Charlie Brown",
    originalLanguage: "en",
    originalText:
      "The only blocker is backend summary regeneration. That part needs the AI worker running locally before it can be verified end to end.",
    confidence: 0.93,
    startTimeMs: 1490000,
    endTimeMs: 1545000,
    sequenceOrder: 5,
  },
  {
    id: "seed-segment-006",
    speakerParticipantId: "seed-participant-alice",
    speakerName: "Alice Smith",
    originalLanguage: "en",
    originalText:
      "Let's keep this data frontend-only for now so testing summary UI does not change shared development data.",
    confidence: 0.98,
    startTimeMs: 1660000,
    endTimeMs: 1705000,
    sequenceOrder: 6,
  },
  {
    id: "seed-segment-007",
    speakerParticipantId: "seed-participant-bob",
    speakerName: "Bob Johnson",
    originalLanguage: "en",
    originalText:
      "I will compare the summary export with the history artifact card and record anything inconsistent.",
    confidence: 0.94,
    startTimeMs: 2050000,
    endTimeMs: 2105000,
    sequenceOrder: 7,
  },
  {
    id: "seed-segment-008",
    speakerParticipantId: "seed-participant-diana",
    speakerName: "Diana Prince",
    originalLanguage: "en",
    originalText:
      "I will prepare the demo checklist and include a step for clicking citation timestamps back into the transcript.",
    confidence: 0.95,
    startTimeMs: 2145000,
    endTimeMs: 2190000,
    sequenceOrder: 8,
  },
];

export const meetingSummarySeedArtifacts: TranslationRoomArtifactDto[] = [
  {
    id: "seed-artifact-summary",
    translationRoomId: MEETING_SUMMARY_SEED_ROOM_ID,
    type: "summary_export",
    title: "AI summary",
    fileFormat: "json",
    fileSizeBytes: 5300,
    containsRawAudio: false,
    containsRawVideo: false,
    consentRequired: false,
    status: "completed",
    createdAt: ENDED_AT,
    content: SUMMARY_CONTENT,
  },
  {
    id: "seed-artifact-transcript",
    translationRoomId: MEETING_SUMMARY_SEED_ROOM_ID,
    type: "transcript_export",
    title: "Transcript export",
    fileFormat: "txt",
    fileSizeBytes: 8400,
    containsRawAudio: false,
    containsRawVideo: false,
    consentRequired: false,
    status: "completed",
    createdAt: ENDED_AT,
  },
  {
    id: "seed-artifact-recording",
    translationRoomId: MEETING_SUMMARY_SEED_ROOM_ID,
    type: "recording",
    title: "Audio recording",
    fileFormat: "mp3",
    fileSizeBytes: 3_780_000,
    containsRawAudio: true,
    containsRawVideo: false,
    consentRequired: true,
    status: "completed",
    createdAt: ENDED_AT,
  },
];

const parsedSummary = parseMeetingSummaryContent(SUMMARY_CONTENT);

export const meetingSummarySeedEndedRoom: EndedRoomHistoryItem = {
  id: meetingSummarySeedRoom.id,
  workspaceId: meetingSummarySeedRoom.workspaceId,
  hostId: meetingSummarySeedRoom.hostId,
  hostName: "Alice Smith",
  title: meetingSummarySeedRoom.title,
  description: meetingSummarySeedRoom.description,
  translationRoomCode: meetingSummarySeedRoom.translationRoomCode,
  status: "ended",
  startedAt: STARTED_AT,
  endedAt: ENDED_AT,
  durationSeconds: DURATION_SECONDS,
  sourceLanguage: meetingSummarySeedRoom.sourceLanguage ?? "en",
  targetLanguages: meetingSummarySeedRoom.targetLanguages,
  participants: meetingSummarySeedParticipants.map((participant) => ({
    id: participant.id,
    userId: participant.userId,
    displayName: participant.displayName,
    role: participant.role === "host" ? "host" : "participant",
    speakLanguage: participant.speakLanguage,
    listenLanguage: participant.listenLanguage,
    joinedAt: participant.joinedAt,
  })),
  participantCount: meetingSummarySeedParticipants.length,
  transcript: meetingSummarySeedTranscript,
  summary: parsedSummary
    ? {
        id: "seed-summary-structured",
        translationRoomId: MEETING_SUMMARY_SEED_ROOM_ID,
        summary: parsedSummary.summary,
        keyPoints: [],
        decisions: parsedSummary.decisions,
        actionItems: parsedSummary.actionItems,
        modelUsed: "seed-data",
        processingTimeMs: 0,
        generatedAt: ENDED_AT,
        insufficientData: parsedSummary.insufficientData,
        translations: parsedSummary.translations,
        templateKey: parsedSummary.templateKey,
        sections: parsedSummary.sections,
      }
    : undefined,
  artifacts: [
    {
      id: "seed-artifact-summary",
      type: "summary_export",
      title: "AI summary",
      description: "Frontend seed summary artifact.",
      status: "ready",
      format: "JSON",
      fileSizeBytes: 5300,
      createdAt: ENDED_AT,
      consentRequired: false,
      consentStatus: "not_required",
      content: SUMMARY_CONTENT,
      backendSource: "translation_room_summaries",
    },
    {
      id: "seed-artifact-transcript",
      type: "transcript_export",
      title: "Transcript export",
      description: "Frontend seed transcript artifact.",
      status: "ready",
      format: "TXT",
      fileSizeBytes: 8400,
      createdAt: ENDED_AT,
      consentRequired: false,
      consentStatus: "not_required",
      backendSource: "transcript_exports",
    },
    {
      id: "seed-artifact-recording",
      type: "recording",
      title: "Audio recording",
      description: "Frontend seed recording artifact.",
      status: "ready",
      format: "MP3",
      fileSizeBytes: 3_780_000,
      durationSeconds: DURATION_SECONDS,
      createdAt: ENDED_AT,
      consentRequired: true,
      consentStatus: "granted",
      backendSource: "translation_room_recordings",
    },
  ],
  retention: { kind: "not_configured" },
  consent: {
    recording: "granted",
    transcript: "not_required",
    summary: "not_required",
  },
};

export const meetingSummarySeedHistoryItem: TranslationRoomHistoryItemDto = {
  room: meetingSummarySeedRoom,
  participants: meetingSummarySeedParticipants,
  artifacts: meetingSummarySeedArtifacts,
};

export function isMeetingSummarySeedWorkspaceSlug(slug?: string | null) {
  return slug === MEETING_SUMMARY_SEED_WORKSPACE_SLUG;
}

export function isMeetingSummarySeedWorkspaceId(workspaceId?: string | null) {
  return workspaceId === MEETING_SUMMARY_SEED_WORKSPACE_ID;
}

export function isMeetingSummarySeedRoomId(roomId?: string | null) {
  return roomId === MEETING_SUMMARY_SEED_ROOM_ID;
}

export function isMeetingSummarySeedTranscriptId(transcriptId?: string | null) {
  return transcriptId === MEETING_SUMMARY_SEED_TRANSCRIPT_ID;
}

export function withMeetingSummarySeedRooms(rooms: TranslationRoomDto[]) {
  if (rooms.some((room) => room.id === MEETING_SUMMARY_SEED_ROOM_ID)) {
    return rooms;
  }
  return [meetingSummarySeedRoom, ...rooms];
}

export function getMeetingSummarySeedRoom(roomId?: string | null) {
  return isMeetingSummarySeedRoomId(roomId) ? meetingSummarySeedRoom : null;
}

export function getMeetingSummarySeedParticipants(roomId?: string | null) {
  return isMeetingSummarySeedRoomId(roomId) ? meetingSummarySeedParticipants : null;
}

export function getMeetingSummarySeedArtifacts(roomId?: string | null) {
  return isMeetingSummarySeedRoomId(roomId) ? meetingSummarySeedArtifacts : null;
}

export function getMeetingSummarySeedArtifactById(artifactId?: string | null) {
  return meetingSummarySeedArtifacts.find((artifact) => artifact.id === artifactId) ?? null;
}

export function getMeetingSummarySeedTranscriptByRoom(roomId?: string | null) {
  return isMeetingSummarySeedRoomId(roomId) ? meetingSummarySeedTranscript : null;
}

export function getMeetingSummarySeedTranscriptSegments(
  transcriptId?: string | null,
): PagedResult<TranscriptSegmentDto> | null {
  return isMeetingSummarySeedTranscriptId(transcriptId)
    ? {
        totalCount: meetingSummarySeedTranscriptSegments.length,
        items: meetingSummarySeedTranscriptSegments,
      }
    : null;
}

export function getMeetingSummarySeedHistoryResponse(options?: {
  page?: number;
  pageSize?: number;
  search?: string;
  artifactStatus?: EndedRoomHistoryItem["artifacts"][number]["status"];
  status?: "ended" | "cancelled";
}): RoomHistoryResponse {
  const page = options?.page && options.page > 0 ? Math.floor(options.page) : 1;
  const pageSize = options?.pageSize ?? 100;
  const normalizedSearch = options?.search?.trim().toLowerCase();
  const matchesSearch = normalizedSearch
    ? [
        meetingSummarySeedEndedRoom.title,
        meetingSummarySeedEndedRoom.translationRoomCode,
        meetingSummarySeedEndedRoom.hostName,
      ].some((value) => value.toLowerCase().includes(normalizedSearch))
    : true;
  const matchesStatus = !options?.status || options.status === meetingSummarySeedEndedRoom.status;
  const matchesArtifact = options?.artifactStatus
    ? meetingSummarySeedEndedRoom.artifacts.some(
        (artifact) => artifact.status === options.artifactStatus,
      )
    : true;
  const rooms = matchesSearch && matchesStatus && matchesArtifact ? [meetingSummarySeedEndedRoom] : [];

  return {
    rooms,
    total: rooms.length,
    page,
    pageSize,
  };
}
