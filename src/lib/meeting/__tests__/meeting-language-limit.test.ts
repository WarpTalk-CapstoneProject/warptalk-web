/**
 * WT-709 — participants choose within the meeting's languages; the host adds one mid-meeting; a
 * refused pick goes back to what the server holds and says why.
 *
 * The refusal sentences below are the backend's, copied verbatim from backend#512
 * (TranslationRoomHub.RoomLanguageNotInMeetingMessage, the hub's L1 refusal, and
 * TranslationRoomConstants.ValidationLanguageNotAllowedByPolicy / ValidationLanguageNotAllowedByWorkspace).
 * If the server rewords one, this is the test that has to change with it — otherwise the client
 * falls back to a generic "could not update" and the ask-the-host prompt silently disappears.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyLanguageRefusal,
  describeLanguageRefusal,
  languageAfterRefusal,
  languagesHostCanAdd,
  meetingDeclaredLanguages,
  meetingPickerLanguages,
  refusedSides,
} from "../meeting-language-limit.ts";

const viEnRoom = { sourceLanguage: "vi-VN", targetLanguages: ["vi", "en-US"], translationRoomType: "MEETING" };
const bridgeRoom = { sourceLanguage: "en", targetLanguages: ["en"], translationRoomType: "EXTERNAL_BRIDGE" };

const HUB_NOT_IN_MEETING =
  "An unexpected error occurred invoking 'SetSpeakLanguage' on the server. HubException: That language is not one of this meeting's languages. Ask the host to add it to the meeting.";
const HUB_NOT_IN_WORKSPACE =
  "An unexpected error occurred invoking 'SetListenLanguage' on the server. HubException: This workspace does not allow that language in meetings.";
const REST_NOT_IN_MEETING =
  "Speak language 'ko' is not one of this meeting's languages (vi, en). Ask the host to add it to the meeting.";
const REST_NOT_IN_WORKSPACE = "This workspace does not allow 'ko' in meetings.";

test("the meeting's declared languages are its source plus targets, as bare codes, once each", () => {
  assert.deepEqual(meetingDeclaredLanguages(viEnRoom), ["vi", "en"]);
});

test("a bridge room and a room with nothing declared place no meeting-language limit", () => {
  assert.equal(meetingDeclaredLanguages(bridgeRoom), null);
  assert.equal(meetingDeclaredLanguages({ sourceLanguage: "", targetLanguages: [] }), null);
  // Still loading: unknown, never "nothing allowed" — an empty picker mid-fetch is the failure.
  assert.equal(meetingDeclaredLanguages(undefined), null);
});

test("a participant is offered only the meeting's languages, not every workspace language", () => {
  const offered = meetingPickerLanguages({
    room: viEnRoom,
    allowedTargetLanguages: ["vi", "en", "ko", "ja"],
    current: "vi",
  });
  assert.deepEqual(offered, ["vi", "en"]);
});

test("a language added in an older session, or one the server would refuse, is not offered", () => {
  const offered = meetingPickerLanguages({
    room: viEnRoom,
    allowedTargetLanguages: [],
    current: "ko",
    added: ["ja"],
  });
  assert.deepEqual(offered, ["vi", "en"]);
});

test("a language the host just added is offered as soon as the room carries it", () => {
  const offered = meetingPickerLanguages({
    room: { ...viEnRoom, targetLanguages: ["vi", "en", "ko"] },
    allowedTargetLanguages: ["vi", "en", "ko"],
    current: "vi",
  });
  assert.deepEqual(offered, ["vi", "en", "ko"]);
});

test("the workspace policy still narrows the meeting's set, keeping the language the participant is on", () => {
  const offered = meetingPickerLanguages({
    room: viEnRoom,
    allowedTargetLanguages: ["en"],
    current: "vi",
  });
  assert.deepEqual(offered, ["vi", "en"]);

  const someoneElse = meetingPickerLanguages({
    room: viEnRoom,
    allowedTargetLanguages: ["en"],
    current: "en",
  });
  assert.deepEqual(someoneElse, ["en"]);
});

test("an empty or absent policy is unrestricted, not empty", () => {
  assert.deepEqual(meetingPickerLanguages({ room: viEnRoom, allowedTargetLanguages: undefined, current: "vi" }), ["vi", "en"]);
});

test("without a declared set the pre-WT-709 menu stands: room languages, added ones, and the current one", () => {
  const offered = meetingPickerLanguages({
    room: bridgeRoom,
    allowedTargetLanguages: [],
    current: "vi",
    added: ["ja"],
  });
  assert.deepEqual(offered, ["en", "ja", "vi"]);
});

test("the host may add workspace-permitted languages the meeting does not already declare", () => {
  const addable = languagesHostCanAdd({ room: viEnRoom, allowedTargetLanguages: ["vi", "en", "ko", "ja"] });
  assert.deepEqual([...addable].sort(), ["ja", "ko"]);
});

test("the host is never offered a language the workspace forbids", () => {
  const addable = languagesHostCanAdd({ room: viEnRoom, allowedTargetLanguages: ["vi", "en", "ko"] });
  assert.deepEqual(addable, ["ko"]);
});

test("there is nothing to add to a room with no declared set", () => {
  assert.deepEqual(languagesHostCanAdd({ room: bridgeRoom, allowedTargetLanguages: [] }), []);
  assert.deepEqual(languagesHostCanAdd({ room: undefined, allowedTargetLanguages: [] }), []);
});

test("the hub's meeting refusal and the REST join's are both read as 'ask the host'", () => {
  assert.equal(classifyLanguageRefusal(new Error(HUB_NOT_IN_MEETING)), "not-in-meeting");
  assert.equal(classifyLanguageRefusal(REST_NOT_IN_MEETING), "not-in-meeting");
});

test("the workspace refusal is told apart, because the host cannot fix it", () => {
  assert.equal(classifyLanguageRefusal(new Error(HUB_NOT_IN_WORKSPACE)), "not-in-workspace");
  assert.equal(classifyLanguageRefusal({ message: REST_NOT_IN_WORKSPACE }), "not-in-workspace");
});

test("a transport failure is not a language refusal", () => {
  assert.equal(classifyLanguageRefusal(new Error("WebSocket closed with status code: 1006")), null);
  assert.equal(classifyLanguageRefusal(new Error("Invocation canceled due to the underlying connection being closed.")), null);
  assert.equal(classifyLanguageRefusal(undefined), null);
});

test("a refused pick goes back to what the hub last confirmed", () => {
  assert.equal(languageAfterRefusal({ refused: "ko", confirmed: "en", room: viEnRoom }), "en");
});

test("with nothing confirmed, a refused side falls back to the meeting's source language", () => {
  assert.equal(languageAfterRefusal({ refused: "ko", confirmed: null, room: viEnRoom }), "vi");
});

test("a refusal never 'reverts' to the language that was just refused", () => {
  assert.equal(languageAfterRefusal({ refused: "ko", confirmed: "ko-KR", room: viEnRoom }), "vi");
  assert.equal(
    languageAfterRefusal({ refused: "vi", confirmed: null, room: viEnRoom }),
    null,
  );
});

test("a refused join moves only the side the meeting does not declare", () => {
  assert.deepEqual(
    refusedSides({ refusal: "not-in-meeting", speak: "vi", listen: "ko", room: viEnRoom }),
    ["listen"],
  );
  assert.deepEqual(
    refusedSides({ refusal: "not-in-workspace", speak: "ko", listen: "vi", room: viEnRoom, allowedTargetLanguages: ["vi", "en"] }),
    ["speak"],
  );
});

test("when the client cannot tell which half was refused, both move rather than retrying the same pair", () => {
  // The room has not loaded: nothing to check against.
  assert.deepEqual(
    refusedSides({ refusal: "not-in-meeting", speak: "ko", listen: "ko", room: undefined }),
    ["speak", "listen"],
  );
  // The workspace tightened its policy after this client read it.
  assert.deepEqual(
    refusedSides({ refusal: "not-in-workspace", speak: "en", listen: "en", room: viEnRoom, allowedTargetLanguages: [] }),
    ["speak", "listen"],
  );
});

test("a blank speak language is never treated as the refused half", () => {
  assert.deepEqual(
    refusedSides({ refusal: "not-in-meeting", speak: "", listen: "ko", room: viEnRoom }),
    ["listen"],
  );
});

test("a participant is told the language, to ask the host, and what they are still on", () => {
  const message = describeLanguageRefusal({ kind: "not-in-meeting", language: "ko", revertedTo: "vi" });
  assert.match(message.title, /Korean isn't one of this meeting's languages/);
  assert.match(message.description, /Ask the host to add Korean/);
  assert.match(message.description, /still on Vietnamese/);
});

test("the host is pointed at the add control rather than at themselves", () => {
  const message = describeLanguageRefusal({
    kind: "not-in-meeting",
    language: "ko",
    revertedTo: "vi",
    canAddLanguages: true,
  });
  assert.doesNotMatch(message.description, /Ask the host/);
  assert.match(message.description, /Add it to the meeting/);
});

test("a workspace refusal never sends anyone to the host", () => {
  const message = describeLanguageRefusal({ kind: "not-in-workspace", language: "ko", revertedTo: "vi" });
  assert.match(message.title, /workspace doesn't allow Korean/);
  assert.doesNotMatch(message.description, /host/i);
});
