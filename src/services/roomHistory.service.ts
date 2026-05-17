import type {
  EndedRoomHistoryItem,
  RoomArtifactStatus,
  RoomHistoryResponse,
} from "@/types/roomHistory";

const MOCK_NOW = "2026-05-16T12:00:00.000Z";

const roomHistoryMock: EndedRoomHistoryItem[] = [
  {
    id: "7b092f2c-6b2f-4eb3-9ac9-2fd1a40b4f10",
    workspaceId: "8ed42f8b-08a8-445c-ba32-4ec1350394c5",
    hostId: "5809ea2c-c22f-4386-b70f-dbf1aa997ca4",
    hostName: "William Chen",
    title: "Global Strategy Sync",
    description: "Post-meeting artifacts from the roadmap and expansion strategy session.",
    translationRoomCode: "GSS-7X2Q",
    status: "ended",
    startedAt: "2026-05-16T12:00:00.000Z",
    endedAt: "2026-05-16T12:42:18.000Z",
    durationSeconds: 2538,
    sourceLanguage: "en",
    targetLanguages: ["es", "vi", "ja"],
    participantCount: 12,
    participants: [
      {
        id: "p-host",
        userId: "5809ea2c-c22f-4386-b70f-dbf1aa997ca4",
        displayName: "William Chen",
        role: "host",
        speakLanguage: "en",
        listenLanguage: "en",
        joinedAt: "2026-05-16T11:59:20.000Z",
        leftAt: "2026-05-16T12:43:00.000Z",
      },
      {
        id: "p-sofia",
        userId: "85167d46-9d93-4c59-a742-81770c5ee607",
        displayName: "Sofia Rivera",
        role: "participant",
        speakLanguage: "es",
        listenLanguage: "en",
        joinedAt: "2026-05-16T12:00:21.000Z",
        leftAt: "2026-05-16T12:42:34.000Z",
      },
      {
        id: "p-raj",
        userId: "2a60764e-1917-4b5f-a0b5-e2fe87d7c8c2",
        displayName: "Raj Patel",
        role: "participant",
        speakLanguage: "en",
        listenLanguage: "vi",
        joinedAt: "2026-05-16T12:01:02.000Z",
        leftAt: "2026-05-16T12:42:05.000Z",
      },
    ],
    transcript: {
      id: "trn-7b092f2c",
      translationRoomId: "7b092f2c-6b2f-4eb3-9ac9-2fd1a40b4f10",
      version: 2,
      status: "completed",
      sourceLanguage: "en",
      totalSegments: 186,
      totalDurationMs: 2538000,
      createdAt: "2026-05-16T12:00:08.000Z",
      updatedAt: "2026-05-16T12:44:02.000Z",
      finalizedAt: "2026-05-16T12:44:02.000Z",
    },
    summary: {
      id: "sum-7b092f2c",
      translationRoomId: "7b092f2c-6b2f-4eb3-9ac9-2fd1a40b4f10",
      summary:
        "The team aligned on the 2026 communication roadmap, emphasizing global reach, AI-powered collaboration, enterprise readiness, and regional rollout planning.",
      keyPoints: [
        "Core platform launch remains the anchor for Q2 delivery.",
        "AI-powered experiences will prioritize bilingual notes and meeting context.",
        "Global reach work depends on partner readiness and compliance review.",
      ],
      decisions: [
        "Move Q4 intelligent collaboration demo into enterprise customer trials.",
        "Keep English as source language for this program and export Spanish, Vietnamese, and Japanese transcripts.",
      ],
      actionItems: [
        "William to share revised APAC rollout plan.",
        "Sofia to validate Spanish terminology list.",
        "Raj to prepare enterprise pilot success metrics.",
      ],
      modelUsed: "warp-summary-v1",
      processingTimeMs: 1480,
      generatedAt: "2026-05-16T12:44:40.000Z",
    },
    artifacts: [
      {
        id: "exp-trn-7b092f2c-pdf",
        type: "transcript_export",
        title: "Transcript export",
        description: "Final transcript with original and translated segments.",
        status: "ready",
        format: "PDF",
        fileUrl: "/mock/artifacts/global-strategy-sync-transcript.pdf",
        fileSizeBytes: 1820000,
        language: "EN, ES, VI, JA",
        createdAt: "2026-05-16T12:44:10.000Z",
        expiresAt: "2026-06-15T12:44:10.000Z",
        retentionDays: 30,
        backendSource: "transcript_exports",
      },
      {
        id: "exp-sum-7b092f2c-docx",
        type: "summary_export",
        title: "AI summary export",
        description: "Summary, key points, decisions, and action items.",
        status: "ready",
        format: "DOCX",
        fileUrl: "/mock/artifacts/global-strategy-sync-summary.docx",
        fileSizeBytes: 640000,
        createdAt: "2026-05-16T12:45:00.000Z",
        expiresAt: "2026-06-15T12:45:00.000Z",
        retentionDays: 30,
        backendSource: "translation_room_summaries",
      },
      {
        id: "rec-7b092f2c-audio",
        type: "recording",
        title: "Audio recording",
        description: "Host-approved audio recording in original language.",
        status: "ready",
        format: "MP3",
        fileUrl: "/mock/artifacts/global-strategy-sync-audio.mp3",
        fileSizeBytes: 28600000,
        durationSeconds: 2538,
        language: "EN",
        createdAt: "2026-05-16T12:43:12.000Z",
        expiresAt: "2026-05-23T12:43:12.000Z",
        retentionDays: 7,
        consentRequired: true,
        consentStatus: "granted",
        backendSource: "translation_room_recordings",
      },
      {
        id: "dbg-7b092f2c",
        type: "debug_log",
        title: "Debug log",
        description: "Gateway and translation-room lifecycle events for troubleshooting.",
        status: "expired",
        format: "JSON",
        createdAt: "2026-05-16T12:43:30.000Z",
        expiresAt: "2026-05-16T18:43:30.000Z",
        retentionDays: 1,
        consentRequired: false,
        consentStatus: "not_required",
        backendSource: "translation_room_recordings",
      },
    ],
    retention: {
      policyName: "Workspace default retention",
      expiresAt: "2026-06-15T12:45:00.000Z",
      transcriptRetentionDays: 30,
      recordingRetentionDays: 7,
      deleteAfterExpiry: true,
    },
    consent: {
      recording: "granted",
      transcript: "granted",
      summary: "not_required",
    },
  },
  {
    id: "a54c9ccb-6af7-43cc-8a09-9dc097963a7b",
    workspaceId: "8ed42f8b-08a8-445c-ba32-4ec1350394c5",
    hostId: "5809ea2c-c22f-4386-b70f-dbf1aa997ca4",
    hostName: "Ari Morgan",
    title: "Compliance Readiness Review",
    translationRoomCode: "CRR-91K",
    status: "archived",
    startedAt: "2026-05-15T08:30:00.000Z",
    endedAt: "2026-05-15T09:05:22.000Z",
    durationSeconds: 2122,
    sourceLanguage: "en",
    targetLanguages: ["fr", "de"],
    participantCount: 8,
    participants: [
      {
        id: "p-ari",
        userId: "61b53e68-1734-4752-9744-833b599e4a40",
        displayName: "Ari Morgan",
        role: "host",
        speakLanguage: "en",
        listenLanguage: "en",
      },
      {
        id: "p-lena",
        userId: "729ebd81-735c-4060-bc94-296548371f90",
        displayName: "Lena Hoffmann",
        role: "participant",
        speakLanguage: "de",
        listenLanguage: "en",
      },
    ],
    transcript: {
      id: "trn-a54c9ccb",
      translationRoomId: "a54c9ccb-6af7-43cc-8a09-9dc097963a7b",
      version: 1,
      status: "completed",
      sourceLanguage: "en",
      totalSegments: 94,
      totalDurationMs: 2122000,
      createdAt: "2026-05-15T08:30:04.000Z",
      updatedAt: "2026-05-15T09:06:00.000Z",
      finalizedAt: "2026-05-15T09:06:00.000Z",
    },
    summary: {
      id: "sum-a54c9ccb",
      translationRoomId: "a54c9ccb-6af7-43cc-8a09-9dc097963a7b",
      summary:
        "Compliance blockers were narrowed to retention copy, consent prompts, and audit export ownership.",
      keyPoints: ["Retention messaging needs legal approval.", "German export labels need one terminology pass."],
      decisions: ["Keep debug logs limited to short retention."],
      actionItems: ["Legal to review consent prompt.", "Engineering to expose artifact expiry fields."],
      modelUsed: "warp-summary-v1",
      processingTimeMs: 960,
      generatedAt: "2026-05-15T09:07:12.000Z",
    },
    artifacts: [
      {
        id: "exp-trn-a54c9ccb-vtt",
        type: "transcript_export",
        title: "Transcript captions",
        description: "WebVTT export for review playback.",
        status: "ready",
        format: "VTT",
        fileUrl: "/mock/artifacts/compliance-readiness.vtt",
        fileSizeBytes: 480000,
        language: "EN, FR, DE",
        createdAt: "2026-05-15T09:06:11.000Z",
        expiresAt: "2026-06-14T09:06:11.000Z",
        retentionDays: 30,
        backendSource: "transcript_exports",
      },
      {
        id: "rec-a54c9ccb-audio-sample",
        type: "audio_sample",
        title: "Audio sample",
        description: "Short quality sample for translation QA.",
        status: "missing",
        format: "WAV",
        durationSeconds: 18,
        language: "EN",
        retentionDays: 1,
        consentRequired: true,
        consentStatus: "limited",
        backendSource: "translation_room_recordings",
      },
    ],
    retention: {
      policyName: "Compliance workspace retention",
      expiresAt: "2026-06-14T09:07:12.000Z",
      transcriptRetentionDays: 30,
      recordingRetentionDays: 1,
      deleteAfterExpiry: true,
    },
    consent: {
      recording: "limited",
      transcript: "granted",
      summary: "not_required",
    },
  },
];

function cloneHistory<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function filterByArtifactStatus(rooms: EndedRoomHistoryItem[], status?: RoomArtifactStatus) {
  if (!status) return rooms;
  return rooms.filter((room) => room.artifacts.some((artifact) => artifact.status === status));
}

export const roomHistoryService = {
  /**
   * Mock adapter for WT-97 until backend exposes:
   * GET /translationRooms/history?status=ended
   * GET /translationRooms/{id}/artifacts
   */
  async listEndedRooms(options?: {
    state?: "ready" | "empty" | "permission_denied" | "error";
    artifactStatus?: RoomArtifactStatus;
  }): Promise<RoomHistoryResponse> {
    await new Promise((resolve) => setTimeout(resolve, 450));

    if (options?.state === "permission_denied") {
      const error = new Error("You do not have access to this room history.");
      error.name = "PermissionDenied";
      throw error;
    }

    if (options?.state === "error") {
      throw new Error("Room history artifacts could not be loaded.");
    }

    if (options?.state === "empty") {
      return { rooms: [] };
    }

    return {
      rooms: filterByArtifactStatus(cloneHistory(roomHistoryMock), options?.artifactStatus),
    };
  },

  currentMockClock() {
    return MOCK_NOW;
  },
};
