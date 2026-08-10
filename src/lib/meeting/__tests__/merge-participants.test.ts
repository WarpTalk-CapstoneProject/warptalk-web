import assert from "node:assert/strict";
import test from "node:test";
import { mergeParticipants } from "../merge-participants.ts";
import type { ParticipantInfoDto } from "../../../types/realtime.ts";
import type { TranslationRoomParticipantDto } from "../../../types/translationRoom.ts";

const HOST_USER_ID = "74fffb6a-8f1e-46e1-bdbe-30e2be8d129a";
const GUEST_USER_ID = "f3629894-0a5f-4855-a72b-b67825ae4377";

function apiRow(
  overrides: Partial<TranslationRoomParticipantDto> = {},
): TranslationRoomParticipantDto {
  return {
    id: "participant-row-1",
    translationRoomId: "019fb8b6-238e-7ee3-8366-81fde1f296b3",
    userId: HOST_USER_ID,
    displayName: "WarpTalk Production Tester 2",
    role: "host",
    listenLanguage: "en-US",
    speakLanguage: "vi-VN",
    status: "connected",
    isTranslationAudioEnabled: true,
    ...overrides,
  };
}

/** Shaped exactly like the Gateway's ParticipantInfoDto: no role, no ids beyond userId. */
function liveRow(
  overrides: Partial<ParticipantInfoDto> = {},
): ParticipantInfoDto {
  return {
    userId: HOST_USER_ID,
    displayName: "WarpTalk Production Tester 2",
    speakLanguage: "vi-VN",
    listenLanguage: "en-US",
    isMuted: false,
    joinedAt: "2026-07-31T15:06:12.239Z",
    ...overrides,
  };
}

test("WT-192: a host in the live roster keeps the host role", () => {
  // The reported bug: the creator was in the call, the live payload carried no role, and
  // the fallback overwrote the API's "host" — the People tab showed "Participant".
  const [merged] = mergeParticipants([apiRow()], [liveRow()]);

  assert.equal(merged.role, "host");
});

test("WT-192: an uppercase API role survives the merge too", () => {
  // The API returns the enum name ("HOST"); the service layer lowercases it, but the DTO
  // type still permits either, so neither form may be dropped.
  const [merged] = mergeParticipants([apiRow({ role: "HOST" })], [liveRow()]);

  assert.equal(merged.role, "HOST");
});

test("the live roster does not replace the participant row id", () => {
  // Admit, reject and the audio toggle all post participant.id — overwriting it with the
  // user id silently pointed those host actions at a non-existent participant.
  const [merged] = mergeParticipants([apiRow()], [liveRow()]);

  assert.equal(merged.id, "participant-row-1");
  assert.equal(
    merged.translationRoomId,
    "019fb8b6-238e-7ee3-8366-81fde1f296b3",
  );
});

test("presence and mute state come from the live roster", () => {
  const [merged] = mergeParticipants(
    [apiRow({ status: "left", isTranslationAudioEnabled: true })],
    [liveRow({ status: "connected", isMuted: true })],
  );

  assert.equal(merged.status, "connected");
  assert.equal(merged.isTranslationAudioEnabled, false);
});

test("a live-only person the API list has not caught up with defaults to participant", () => {
  const [merged] = mergeParticipants([], [liveRow({ userId: GUEST_USER_ID })]);

  assert.equal(merged.userId, GUEST_USER_ID);
  assert.equal(merged.role, "participant");
  // No API row means no participant row id exists yet; the user id is the only key there is.
  assert.equal(merged.id, GUEST_USER_ID);
});

test("a live role is used only when the API has no row for that person", () => {
  const [merged] = mergeParticipants(
    [],
    [liveRow({ userId: GUEST_USER_ID, role: "interpreter" })],
  );

  assert.equal(merged.role, "interpreter");
});

test("participants absent from the live roster are kept untouched", () => {
  // Someone waiting in the lobby has no LiveKit connection, so they appear in the API list
  // only. Losing them here would empty the host's Approve queue.
  const waiting = apiRow({
    id: "participant-row-2",
    userId: GUEST_USER_ID,
    displayName: "WarpTalk Production Tester",
    role: "participant",
    status: "waiting",
  });

  const merged = mergeParticipants([apiRow(), waiting], [liveRow()]);

  assert.equal(merged.length, 2);
  const stillWaiting = merged.find((p) => p.userId === GUEST_USER_ID);
  assert.deepEqual(stillWaiting, waiting);
});

test("each person appears exactly once, live or not", () => {
  const merged = mergeParticipants(
    [apiRow(), apiRow({ id: "participant-row-2", userId: GUEST_USER_ID })],
    [liveRow(), liveRow({ userId: GUEST_USER_ID })],
  );

  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((p) => p.userId).sort(),
    [HOST_USER_ID, GUEST_USER_ID].sort(),
  );
});
