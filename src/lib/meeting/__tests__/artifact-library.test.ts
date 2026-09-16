import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArtifactLibrary,
  countByKind,
  describeAbsence,
  entryExcerpt,
  entryMatches,
  groupEntriesByMeeting,
  minutesBodyText,
  minutesStatusLabel,
  narrowLibrary,
  preferredEntry,
  relativeTime,
} from "../artifact-library.ts";
import { ARTIFACT_WITHHELD_FALLBACK } from "../artifact-denial.ts";

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
  // The SHARED sentence, not a lookalike. A fourth wording for one fact is how the same
  // participant comes to read one thing on the meeting page and another in the library — and the
  // sentence must stay about the OUTPUT, because the transcript endpoints ignore artifactAccess
  // entirely and will often hand this person the transcript a card called unreadable.
  assert.equal(describeAbsence("withheld", "transcript"), ARTIFACT_WITHHELD_FALLBACK);
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


// ── one card per meeting ─────────────────────────────────────────────────────────

test("a meeting's records become one group, not three cards", () => {
  // The report: "bị rời rạc quá, tôi không biết combo transcript, summary, minutes là của meeting
  // nào khi nhìn vào". Two records of one meeting were two adjacent cards under the same title.
  const entries = buildArtifactLibrary({
    rooms: [
      room({
        artifacts: [
          artifact({ id: "a-1", type: "transcript_export" }),
          artifact({ id: "a-2", type: "summary_export", content: "We agreed to ship." }),
        ],
      }),
    ],
    minutes: [minutesItem()],
  });

  const groups = groupEntriesByMeeting(entries);

  assert.equal(groups.length, 1, "one meeting must produce one card");
  assert.equal(groups[0].roomId, "room-1");
  assert.deepEqual(groups[0].kinds, ["transcript", "summary", "minutes"]);
  assert.equal(groups[0].entries.length, 3);
});

test("two meetings stay two groups, newest first", () => {
  const entries = buildArtifactLibrary({
    rooms: [
      room({ id: "room-1", endedAt: "2026-09-01T10:00:00Z" }),
      room({ id: "room-2", endedAt: "2026-09-05T10:00:00Z", translationRoomCode: "WARP-202" }),
    ],
    minutes: [],
  });

  const groups = groupEntriesByMeeting(entries);

  // Ordered here, by the meeting's own end date — see the split-minutes test below for why this
  // can no longer be inherited from the flat list.
  assert.deepEqual(
    groups.map((group) => group.roomId),
    ["room-2", "room-1"],
  );
});

test("a group reports how many of its records this viewer can open", () => {
  // A HOST_ONLY room hands a participant rows with no bodies. Zero readable is the answer that
  // tells the reader to ask the host, and it is different from the meeting having no records.
  const entries = buildArtifactLibrary({
    rooms: [
      room({
        artifacts: [
          artifact({ id: "a-1", type: "transcript_export", content: undefined }),
          artifact({ id: "a-2", type: "summary_export", content: "We agreed to ship." }),
        ],
      }),
    ],
    minutes: [],
  });

  const [group] = groupEntriesByMeeting(entries);

  assert.equal(group.entries.length, 2);
  assert.equal(group.readableCount, 1);
});

test("a group is dated by its most recently changed record", () => {
  // Records arrive in produced order, which is not the order they were edited in: minutes signed
  // days later sit after a transcript untouched since the meeting. Last-wins would date the
  // meeting by the transcript.
  const entries = buildArtifactLibrary({
    rooms: [room()],
    minutes: [minutesItem()],
  });

  const [group] = groupEntriesByMeeting(entries);
  const latest = entries
    .map((entry) => entry.changedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  assert.equal(group.changedAt, latest);
});

test("opening a meeting lands on a record that can actually be read", () => {
  // Opening onto a withheld transcript shows a lock while the summary beside it was readable all
  // along — and most readers would conclude the meeting holds nothing.
  const entries = buildArtifactLibrary({
    rooms: [
      room({
        artifacts: [
          artifact({ id: "a-1", type: "transcript_export", content: undefined }),
          artifact({ id: "a-2", type: "summary_export", content: "We agreed to ship." }),
        ],
      }),
    ],
    minutes: [],
  });

  const [group] = groupEntriesByMeeting(entries);

  assert.equal(preferredEntry(group).kind, "summary");
});

test("a meeting with nothing readable still opens on something", () => {
  // The panel has to render, and describeAbsence is what it renders.
  const entries = buildArtifactLibrary({
    rooms: [room({ artifacts: [artifact({ id: "a-1", content: undefined })] })],
    minutes: [],
  });

  const [group] = groupEntriesByMeeting(entries);

  assert.equal(preferredEntry(group).kind, "transcript");
  assert.equal(group.readableCount, 0);
});

test("grouping a narrowed list answers \"meetings that have one\"", () => {
  // The kind chips keep meaning what they say: filter first, group second.
  const entries = buildArtifactLibrary({
    rooms: [
      room({ id: "room-1", artifacts: [artifact({ id: "a-1", type: "transcript_export" })] }),
      room({
        id: "room-2",
        translationRoomCode: "WARP-202",
        artifacts: [artifact({ id: "a-2", type: "summary_export", content: "Shipped." })],
      }),
    ],
    minutes: [],
  });

  const groups = groupEntriesByMeeting(narrowLibrary(entries, { kind: "summary" }));

  assert.deepEqual(
    groups.map((group) => group.roomId),
    ["room-2"],
  );
});


// ── a meeting's records stay together, and the meeting is dated by its END ───────

/**
 * The case that made adjacency structural rather than inherited.
 *
 * `buildArtifactLibrary` orders by `meetingEndedAt` first, and the two sources of that field
 * disagree for one room: an artifact carries `room.endedAt`, a minutes carries
 * `roomEndedAt ?? minutes.createdAt`. A minutes filed with no `roomEndedAt` takes the day it was
 * DRAWN UP — later than the meeting — so it sorted away from its own transcript with other
 * meetings in between.
 */
function splitMeetingFixture() {
  return buildArtifactLibrary({
    rooms: [
      room({
        id: "room-old",
        translationRoomCode: "WARP-OLD",
        endedAt: "2026-09-01T10:00:00Z",
        artifacts: [artifact({ id: "t-old" })],
      }),
      room({
        id: "room-new",
        translationRoomCode: "WARP-NEW",
        endedAt: "2026-09-06T10:00:00Z",
        artifacts: [artifact({ id: "t-new" })],
      }),
    ],
    minutes: [
      minutesItem({
        minutes: minutesDto({
          translationRoomId: "room-old",
          createdAt: "2026-09-07T08:00:00Z",
          updatedAt: "2026-09-07T08:00:00Z",
        }),
        roomCode: "WARP-OLD",
        // The whole point: the minutes row does not say when the meeting ended.
        roomEndedAt: null,
      }),
    ],
  });
}

test("the flat list really can separate a meeting's records", () => {
  // Guards the premise of the three tests below. If this ever stops being true the grouping is
  // still correct, but the reason it was made structural would have quietly disappeared.
  const entries = splitMeetingFixture();
  const positions = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.roomId === "room-old")
    .map(({ index }) => index);

  assert.equal(positions.length, 2);
  assert.notEqual(positions[1] - positions[0], 1, "the fixture no longer reproduces the split");
});

test("a meeting's records are one group even when the flat list splits them", () => {
  const groups = groupEntriesByMeeting(splitMeetingFixture());
  const old = groups.find((group) => group.roomId === "room-old");

  assert.ok(old);
  assert.deepEqual(old.kinds, ["transcript", "minutes"]);
});

test("a meeting is dated by when it ENDED, not by when its minutes were filed", () => {
  // 2026-09-07 is the day somebody drew the minutes up. Dating the meeting by it would put a
  // meeting from the 1st at the top of a list sorted by end date.
  const groups = groupEntriesByMeeting(splitMeetingFixture());
  const old = groups.find((group) => group.roomId === "room-old");

  assert.equal(old?.meetingEndedAt, "2026-09-01T10:00:00Z");
});

test("groups are ordered by the meeting's end date, newest first", () => {
  const groups = groupEntriesByMeeting(splitMeetingFixture());

  assert.deepEqual(
    groups.map((group) => group.roomCode),
    ["WARP-NEW", "WARP-OLD"],
  );
});

test("a group's records read transcript, summary, minutes whatever order they arrived in", () => {
  // The panel's first tab is entries[0]. A minutes that sorted ahead of its own transcript put
  // "Minutes" there, which is the last thing produced and the first thing shown.
  const groups = groupEntriesByMeeting(splitMeetingFixture());
  const old = groups.find((group) => group.roomId === "room-old");

  assert.deepEqual(
    old?.entries.map((entry) => entry.kind),
    ["transcript", "minutes"],
  );
});
