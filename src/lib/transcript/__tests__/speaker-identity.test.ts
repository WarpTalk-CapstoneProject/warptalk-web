import assert from "node:assert/strict";
import test from "node:test";

import {
  BRIDGE_FAR_SIDE_FALLBACK_NAME,
  BRIDGE_STAND_IN_USER_ID,
  bridgeFarSideSpeakerName,
  localizeFarSideSpeakerName,
  transcriptSpeakerDisplayName,
  transcriptSpeakerKey,
} from "../speaker-identity.ts";
import {
  groupIntoSpeakerTurns,
  groupSavedTranscriptSegments,
  groupTranscriptSegments,
  resolveTranscriptSpeakerName,
} from "../transcript-display.ts";
import { speakingShares } from "../document-reading.ts";
import { resolveTranscriptSpeaker } from "../speaker-color.ts";
import { assembleTranscriptText } from "../transcript-language.ts";
import { transcriptIdentityFor } from "../../meeting/participant-identity.ts";
import type { TranscriptSegmentDto } from "../../../types/realtime.ts";
import type { TranscriptSegmentDto as SavedTranscriptSegmentDto } from "../../../types/transcript.ts";

const STAND_IN = BRIDGE_STAND_IN_USER_ID;
const HOST = "019f0d00-0de0-7000-9000-000000000001";

/** The roster as the live meeting sees a bridge room: the host, and the stand-in SEAT. */
const ROSTER = [
  { userId: HOST, displayName: "Huynh Thai Tu" },
  { userId: STAND_IN, displayName: "External Meeting" },
];

function live(overrides: Partial<TranscriptSegmentDto> = {}): TranscriptSegmentDto {
  return {
    segmentId: "segment-1",
    speakerId: STAND_IN,
    speakerName: "Lan Nguyen",
    originalText: "Hello",
    originalLanguage: "en",
    confidence: 0.9,
    startTimeMs: 1_000,
    endTimeMs: 2_000,
    ...overrides,
  };
}

function saved(
  id: string,
  speakerName: string,
  startTimeMs: number,
  speakerParticipantId: string = STAND_IN,
): SavedTranscriptSegmentDto {
  return {
    id,
    speakerParticipantId,
    speakerName,
    originalText: `line ${id}`,
    originalLanguage: "en",
    startTimeMs,
    endTimeMs: startTimeMs + 1_000,
    sequenceOrder: startTimeMs,
  };
}

// ── names ────────────────────────────────────────────────────────────────────────────────────────

test("a Google Meet line is named after the Meet person the gateway put on it, not the seat", () => {
  // The bug: the roster names the stand-in seat "External Meeting" and the live transcript
  // preferred the roster, so every Meet line said "External Meeting".
  assert.equal(resolveTranscriptSpeakerName(live({ speakerName: "Lan Nguyen" }), ROSTER), "Lan Nguyen");
});

test("a Google Meet line nobody could attribute falls back to the far-side label, never the seat", () => {
  assert.equal(
    resolveTranscriptSpeakerName(live({ speakerName: BRIDGE_FAR_SIDE_FALLBACK_NAME }), ROSTER),
    BRIDGE_FAR_SIDE_FALLBACK_NAME,
  );
  assert.equal(resolveTranscriptSpeakerName(live({ speakerName: "" }), ROSTER), BRIDGE_FAR_SIDE_FALLBACK_NAME);
  // Saved lines from before the gateway carried names hold the stand-in's own id as the name —
  // a version-0 GUID the generic UUID guard does not recognise.
  assert.equal(resolveTranscriptSpeakerName(live({ speakerName: STAND_IN }), ROSTER), BRIDGE_FAR_SIDE_FALLBACK_NAME);
  assert.equal(
    resolveTranscriptSpeakerName(live({ speakerName: "External Meeting" }), ROSTER),
    BRIDGE_FAR_SIDE_FALLBACK_NAME,
  );
});

test("the fallback is the reader's translated label wherever a label is handed in", () => {
  const labels = { farSideFallback: "Người tham gia Google Meet", unknown: "Người nói không xác định" };
  assert.equal(transcriptSpeakerDisplayName(STAND_IN, BRIDGE_FAR_SIDE_FALLBACK_NAME, labels), labels.farSideFallback);
  assert.equal(transcriptSpeakerDisplayName(STAND_IN, "Minh Tran", labels), "Minh Tran");
  assert.equal(
    localizeFarSideSpeakerName(STAND_IN, BRIDGE_FAR_SIDE_FALLBACK_NAME, labels.farSideFallback),
    labels.farSideFallback,
  );
  assert.equal(localizeFarSideSpeakerName(STAND_IN, "Minh Tran", labels.farSideFallback), "Minh Tran");
});

test("a real participant is unchanged: the roster still wins for them", () => {
  // The roster is ignored ONLY for the stand-in.
  assert.equal(
    resolveTranscriptSpeakerName(live({ speakerId: HOST, speakerName: "tu.huynh" }), ROSTER),
    "Huynh Thai Tu",
  );
  assert.equal(transcriptSpeakerDisplayName(HOST, "Huynh Thai Tu"), "Huynh Thai Tu");
  assert.equal(transcriptSpeakerDisplayName(HOST, ""), "Unknown speaker");
  // A real person whose name happens to be the far-side wording is left alone.
  assert.equal(localizeFarSideSpeakerName(HOST, BRIDGE_FAR_SIDE_FALLBACK_NAME, "X"), BRIDGE_FAR_SIDE_FALLBACK_NAME);
});

test("bridgeFarSideSpeakerName says who, or null for nobody", () => {
  assert.equal(bridgeFarSideSpeakerName("  Lan Nguyen "), "Lan Nguyen");
  assert.equal(bridgeFarSideSpeakerName("google meet participants"), null);
  assert.equal(bridgeFarSideSpeakerName(null), null);
});

// ── identity ─────────────────────────────────────────────────────────────────────────────────────

test("each Meet person is their own speaker key; everybody else keys as before", () => {
  const lan = transcriptSpeakerKey({ speakerParticipantId: STAND_IN, speakerName: "Lan Nguyen" });
  const minh = transcriptSpeakerKey({ speakerParticipantId: STAND_IN, speakerName: "Minh Tran" });
  assert.notEqual(lan, minh);
  assert.equal(lan, transcriptSpeakerKey({ speakerId: STAND_IN, speakerName: "lan nguyen" }));
  // The unattributed lines are one speaker of their own, however the fallback was spelled.
  assert.equal(
    transcriptSpeakerKey({ speakerId: STAND_IN, speakerName: BRIDGE_FAR_SIDE_FALLBACK_NAME }),
    transcriptSpeakerKey({ speakerId: STAND_IN, speakerName: "" }),
  );
  assert.equal(transcriptSpeakerKey({ speakerParticipantId: HOST, speakerName: "Tu" }), HOST);
  assert.equal(transcriptSpeakerKey({ speakerName: "Guest" }), "Guest");
});

test("two Meet speakers alternating are separate turns, not one under the first name", () => {
  const turns = groupIntoSpeakerTurns([
    saved("a", "Lan Nguyen", 1_000),
    saved("b", "Minh Tran", 2_500),
    saved("c", "Lan Nguyen", 4_000),
  ]);
  assert.deepEqual(
    turns.map((turn) => turn.speakerName),
    ["Lan Nguyen", "Minh Tran", "Lan Nguyen"],
  );
});

test("a turn with no Meet person is named with the far-side label handed in", () => {
  const [turn] = groupIntoSpeakerTurns([saved("a", STAND_IN, 1_000)], {
    farSideFallback: "Google Meet の参加者",
  });
  assert.equal(turn.speakerName, "Google Meet の参加者");
});

test("one Meet person speaking on is still one turn", () => {
  const turns = groupIntoSpeakerTurns([saved("a", "Lan Nguyen", 1_000), saved("b", "Lan Nguyen", 2_500)]);
  assert.equal(turns.length, 1);
});

test("saved utterances do not merge two Meet speakers' lines", () => {
  const rows = groupSavedTranscriptSegments([saved("a", "Lan Nguyen", 1_000), saved("b", "Minh Tran", 2_100)]);
  assert.equal(rows.length, 2);
});

test("live utterances do not merge two Meet speakers' lines either", () => {
  const rows = groupTranscriptSegments([
    live({ segmentId: "1", speakerName: "Lan Nguyen", startTimeMs: 1_000, endTimeMs: 2_000 }),
    live({ segmentId: "2", speakerName: "Minh Tran", startTimeMs: 2_100, endTimeMs: 3_000 }),
    live({ segmentId: "3", speakerName: "Minh Tran", startTimeMs: 3_100, endTimeMs: 4_000 }),
  ]);
  assert.deepEqual(rows.map((row) => row.speakerName), ["Lan Nguyen", "Minh Tran"]);
  assert.deepEqual(rows[1].mergedSegmentIds, ["2", "3"]);
});

test("talk time counts each Meet person apart", () => {
  const shares = speakingShares([
    saved("a", "Lan Nguyen", 0),
    saved("b", "Minh Tran", 2_000),
    saved("c", "Lan Nguyen", 4_000),
  ]);
  assert.deepEqual(
    shares.map((share) => [share.name, share.speakingMs]),
    [
      ["Lan Nguyen", 2_000],
      ["Minh Tran", 1_000],
    ],
  );
});

test("each Meet person gets their own colour key and no face", () => {
  const lan = resolveTranscriptSpeaker(STAND_IN, "Lan Nguyen", {
    [STAND_IN]: { fullName: "External Meeting", avatarUrl: "https://x/seat.png" },
  });
  const minh = resolveTranscriptSpeaker(STAND_IN, "Minh Tran");
  assert.equal(lan.name, "Lan Nguyen");
  assert.equal(lan.avatarUrl, undefined);
  assert.notEqual(lan.id, minh.id);
  // A real person keeps their user id as their key.
  assert.equal(resolveTranscriptSpeaker(HOST, "Tu").id, HOST);
});

test("the live face of a Meet line is the person on the line, with the seat's language", () => {
  const identities = {
    [STAND_IN]: { userId: STAND_IN, name: "External Meeting", initials: "EM", speakLanguage: "en" },
  };
  const person = transcriptIdentityFor(identities, STAND_IN, "Minh Tran");
  assert.equal(person.name, "Minh Tran");
  assert.equal(person.initials, "MT");
  assert.equal(person.speakLanguage, "en");
  assert.equal(transcriptIdentityFor(identities, STAND_IN, "").name, BRIDGE_FAR_SIDE_FALLBACK_NAME);
});

test("the plain-text download names the Meet person, or the far-side label, never the id", () => {
  const text = assembleTranscriptText(
    [{ sessionNumber: 1, segments: [saved("a", "Lan Nguyen", 0), saved("b", STAND_IN, 2_000)] }],
    {},
    null,
    { farSideFallback: "Google Meet participants (unidentified)" },
  );
  assert.match(text, /^Lan Nguyen \(EN\): line a/m);
  assert.match(text, /^Google Meet participants \(unidentified\) \(EN\): line b/m);
  assert.doesNotMatch(text, /b21d/);
});
