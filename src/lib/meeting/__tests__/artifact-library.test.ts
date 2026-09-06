import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArtifactLibrary,
  countByKind,
  describeAbsence,
  entryExcerpt,
  entryMatches,
  minutesBodyText,
  minutesStatusLabel,
  narrowLibrary,
  relativeTime,
} from "../artifact-library.ts";

import type { EndedRoomHistoryItem, RoomHistoryArtifact } from "@/types/roomHistory";
import type { MeetingMinutesDto } from "@/types/meetingMinutes";
import type { WorkspaceMinutesItem } from "@/types/workspaceMinutes";

function artifact(overrides: Partial<RoomHistoryArtifact> = {}): RoomHistoryArtifact {
  return {
    id: `artifact-${Math.random().toString(36).slice(2)}`,
    type: "transcript_export",
    title: "transcript export (TXT)",
    description: "",
    status: "ready",
    content: "Alice: we should ship on Friday.",
    backendSource: "transcript_exports",
    ...overrides,
  };
}

function room(overrides: Partial<EndedRoomHistoryItem> = {}): EndedRoomHistoryItem {
  return {
    id: "room-1",
    workspaceId: "workspace-1",
    hostId: "host-1",
    hostName: "Nhi",
    title: "Sprint review",
    translationRoomCode: "WARP-101",
    status: "ended",
    startedAt: "2026-09-01T09:00:00Z",
    endedAt: "2026-09-01T10:00:00Z",
    durationSeconds: 3600,
    sourceLanguage: "vi",
    targetLanguages: ["en"],
    participants: [],
    participantCount: 4,
    artifacts: [artifact()],
    retention: { kind: "not_configured" },
    consent: { recording: "not_required", transcript: "not_required", summary: "not_required" },
    ...overrides,
  } as EndedRoomHistoryItem;
}

function minutesDto(overrides: Partial<MeetingMinutesDto> = {}): MeetingMinutesDto {
  return {
    id: "minutes-1",
    translationRoomId: "room-1",
    minutesNo: "BB-2026-0007",
    status: "APPROVED",
    version: 1,
    isCurrent: true,
    editCountVsDraft: 3,
    secretaryName: "Tú",
    chairName: "Nhi",
    content: JSON.stringify({
      agenda: "Review the quarter",
      attendance: { present: [], absent: [], invitedCount: 5, presentCount: 4 },
      sections: [
        { key: "decisions", kind: "items", items: [{ text: "Approve the Q4 budget" }] },
      ],
      votes: [],
    }),
    createdAt: "2026-09-02T08:00:00Z",
    updatedAt: "2026-09-03T08:00:00Z",
    ...overrides,
  } as MeetingMinutesDto;
}

function minutesItem(overrides: Partial<WorkspaceMinutesItem> = {}): WorkspaceMinutesItem {
  return {
    minutes: minutesDto(),
    roomTitle: "Sprint review",
    roomCode: "WARP-101",
    roomHostId: "host-1",
    roomStatus: "ENDED",
    roomEndedAt: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

test("only what WarpTalk wrote reaches the library", () => {
  const entries = buildArtifactLibrary({
    rooms: [
      room({
        artifacts: [
          artifact({ id: "a1", type: "transcript_export" }),
          artifact({ id: "a2", type: "summary_export", content: '{"summary":"We shipped."}' }),
          artifact({ id: "a3", type: "recording", content: undefined }),
          artifact({ id: "a4", type: "debug_log", content: undefined }),
          artifact({ id: "a5", type: "audio_sample", content: undefined }),
        ],
      }),
    ],
  });

  assert.deepEqual(
    entries.map((entry) => entry.id).sort(),
    ["a1", "a2"],
    "a recording, a debug log and an audio sample are files, not written records",
  );
});

test("a summary is unwrapped from its JSON before anybody reads it", () => {
  const [entry] = buildArtifactLibrary({
    rooms: [
      room({
        artifacts: [
          artifact({
            type: "summary_export",
            content: JSON.stringify({
              summary: "The team agreed to ship on Friday.",
              decisions: [{ text: "Ship on Friday", atMs: 1000 }],
            }),
          }),
        ],
      }),
    ],
  });

  assert.ok(entry.body?.startsWith("The team agreed to ship on Friday."));
  assert.ok(entry.body?.includes("Decisions"), "sections keep their headings");
  assert.ok(!entry.body?.includes('"summary"'), "raw JSON never reaches the card");
});

test("a ready artifact with no body is withheld, not missing", () => {
  // The common case, not an edge one: room artifacts default to HOST_ONLY, so the server lists
  // the row and omits its content for everyone but the host.
  const [entry] = buildArtifactLibrary({
    rooms: [room({ artifacts: [artifact({ status: "ready", content: undefined })] })],
  });

  assert.equal(entry.body, null);
  assert.equal(entry.absence, "withheld");
  assert.match(describeAbsence("withheld", "transcript"), /host/i);
});

test("an artifact still being produced says so instead of reading as withheld", () => {
  const [entry] = buildArtifactLibrary({
    rooms: [room({ artifacts: [artifact({ status: "processing", content: undefined })] })],
  });

  assert.equal(entry.absence, "generating");
  assert.equal(entry.statusLabel, "Generating");
});

test("minutes are listed by their number, because that is what they are filed under", () => {
  const entries = buildArtifactLibrary({ rooms: [], minutes: [minutesItem()] });

  assert.equal(entries[0].title, "BB-2026-0007");
  assert.equal(entries[0].kind, "minutes");
});

test("a minutes document whose meeting is not on the loaded page still lists", () => {
  const entries = buildArtifactLibrary({
    rooms: [],
    minutes: [minutesItem({ roomTitle: "Board meeting", roomCode: "WARP-999" })],
  });

  assert.equal(entries.length, 1, "the row carries its own room facts and does not need the page");
  assert.equal(entries[0].roomTitle, "Board meeting");
});

test("IN_REVIEW reads as Signed — what happened, not what the workflow calls it", () => {
  assert.equal(minutesStatusLabel("IN_REVIEW"), "Signed");
  assert.equal(minutesStatusLabel("DRAFT"), "Draft");
  assert.equal(minutesStatusLabel("APPROVED"), "Approved");
  assert.equal(minutesStatusLabel("SOMETHING_NEW"), "SOMETHING_NEW", "an unknown state is shown, not hidden");
});

test("search reads the body, which is the whole point of the page", () => {
  const entries = buildArtifactLibrary({
    rooms: [
      room({
        artifacts: [artifact({ content: "Alice: the Q4 budget is approved." })],
      }),
    ],
  });

  assert.ok(entryMatches(entries[0], "q4 budget"), "a term nobody put in a title still finds it");
  assert.ok(!entryMatches(entries[0], "hiring plan"));
});

test("search folds diacritics on both sides", () => {
  const entries = buildArtifactLibrary({
    rooms: [room({ hostName: "Mạnh", artifacts: [artifact({ content: "Biên bản đã ký." })] })],
  });

  assert.ok(entryMatches(entries[0], "manh"), "nobody types the tone marks when searching");
  assert.ok(entryMatches(entries[0], "bien ban"));
});

test("an empty term matches everything rather than nothing", () => {
  const entries = buildArtifactLibrary({ rooms: [room()] });
  assert.ok(entryMatches(entries[0], "   "));
});

test("narrowing by kind and by host are separate axes", () => {
  const entries = buildArtifactLibrary({
    rooms: [
      room({
        id: "room-1",
        hostId: "host-1",
        artifacts: [artifact({ id: "t1" }), artifact({ id: "s1", type: "summary_export", content: '{"summary":"x"}' })],
      }),
      room({ id: "room-2", hostId: "host-2", endedAt: "2026-08-30T10:00:00Z", artifacts: [artifact({ id: "t2" })] }),
    ],
  });

  assert.deepEqual(
    narrowLibrary(entries, { kind: "transcript" }).map((entry) => entry.id).sort(),
    ["t1", "t2"],
  );
  assert.deepEqual(
    narrowLibrary(entries, { hostedBy: "host-1" }).map((entry) => entry.id).sort(),
    ["s1", "t1"],
  );
  assert.deepEqual(
    narrowLibrary(entries, { kind: "transcript", hostedBy: "host-2" }).map((entry) => entry.id),
    ["t2"],
  );
});

test("newest meeting first, and one meeting's records keep their produced order", () => {
  const entries = buildArtifactLibrary({
    rooms: [
      room({ id: "old", endedAt: "2026-08-01T10:00:00Z", artifacts: [artifact({ id: "old-t" })] }),
      room({
        id: "new",
        endedAt: "2026-09-05T10:00:00Z",
        artifacts: [
          artifact({ id: "new-s", type: "summary_export", content: '{"summary":"x"}' }),
          artifact({ id: "new-t", type: "transcript_export" }),
        ],
      }),
    ],
    minutes: [minutesItem({ minutes: minutesDto({ translationRoomId: "new" }), roomEndedAt: "2026-09-05T10:00:00Z" })],
  });

  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["new-t", "new-s", "minutes-1", "old-t"],
    "the transcript is the evidence, the summary reads it, the minutes are signed off it",
  );
});

test("an excerpt stops at a word, never mid-word", () => {
  const entry = buildArtifactLibrary({
    rooms: [room({ artifacts: [artifact({ content: "alpha bravo charlie delta echo foxtrot" })] })],
  })[0];

  const excerpt = entryExcerpt(entry, 20);

  assert.ok(excerpt.endsWith("…"));
  assert.ok(!excerpt.includes("cha…"), `cut mid-word: ${excerpt}`);
  assert.ok(excerpt.length <= 21);
});

test("an excerpt of a short document is the document, with nothing appended", () => {
  const entry = buildArtifactLibrary({
    rooms: [room({ artifacts: [artifact({ content: "Short." })] })],
  })[0];

  assert.equal(entryExcerpt(entry), "Short.");
});

test("minutes read as prose with their section headings", () => {
  const text = minutesBodyText(minutesDto());

  assert.ok(text.startsWith("Review the quarter"));
  assert.ok(text.includes("Decisions"));
  assert.ok(text.includes("• Approve the Q4 budget"));
});

test("a drawn-up but unwritten minutes is empty, not withheld", () => {
  const entries = buildArtifactLibrary({
    rooms: [],
    minutes: [
      minutesItem({
        minutes: minutesDto({
          status: "DRAFT",
          content: JSON.stringify({ attendance: { present: [], absent: [], invitedCount: 0, presentCount: 0 }, sections: [], votes: [] }),
        }),
      }),
    ],
  });

  assert.equal(entries[0].absence, "empty");
  assert.match(describeAbsence("empty", "minutes"), /not written/i);
});

test("relative time turns into a date once a week has passed", () => {
  const now = Date.parse("2026-09-06T12:00:00Z");

  assert.equal(relativeTime("2026-09-06T11:58:30Z", now), "2m ago");
  assert.equal(relativeTime("2026-09-06T06:00:00Z", now), "6h ago");
  assert.equal(relativeTime("2026-09-03T12:00:00Z", now), "3d ago");
  assert.ok(!relativeTime("2026-07-01T12:00:00Z", now).includes("ago"), "36 days ago is arithmetic, not a date");
  assert.equal(relativeTime(null, now), "—");
  assert.equal(relativeTime("not a date", now), "—");
});

test("counts are per kind, so a chip can say how much is behind it", () => {
  const entries = buildArtifactLibrary({
    rooms: [
      room({
        artifacts: [
          artifact({ id: "t" }),
          artifact({ id: "s", type: "summary_export", content: '{"summary":"x"}' }),
        ],
      }),
    ],
    minutes: [minutesItem()],
  });

  assert.deepEqual(countByKind(entries), { transcript: 1, summary: 1, minutes: 1 });
});
