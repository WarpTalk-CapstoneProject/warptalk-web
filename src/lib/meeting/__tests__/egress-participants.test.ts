/**
 * Who the recording template subscribes to.
 *
 * Getting this wrong in either direction is bad in a different way. Letting a bot through puts the
 * translation soup back into the file, which is the bug. Excluding a human loses them from the
 * record of a meeting they spoke at — silently, because nobody watches a recording to check who is
 * missing from it.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { isRecordableParticipant } from "../egress-participants.ts";

test("a person is recorded", () => {
  assert.equal(isRecordableParticipant("019ff9e1-e3e2-7024-99b7-6e37c6a18392"), true);
  assert.equal(isRecordableParticipant("huynh.thai.tu"), true);
});

test("every shape of interpreter identity is excluded", () => {
  // The formats tts_worker/livekit_publisher.py emits: with and without a voice key.
  assert.equal(isRecordableParticipant("ai-interpreter-en-019ff9e1-e3e2-7024"), false);
  assert.equal(isRecordableParticipant("ai-interpreter-vi-voice-1a2b3c4d-019ff9e1"), false);
});

test("the STT ingest bot is excluded too", () => {
  // It publishes nothing, but a composite template still lays out a tile for every participant it
  // subscribes to, and an empty tile in a recording is a person who was not there.
  assert.equal(isRecordableParticipant("AIBot_room-abc"), false);
});

test("a human whose name merely contains a prefix is still recorded", () => {
  assert.equal(isRecordableParticipant("someone-ai-interpreter-fan"), true);
  assert.equal(isRecordableParticipant("not-AIBot_anything"), true);
});

test("matching is case-sensitive, because both prefixes are machine-produced", () => {
  // Neither producer emits these, so accepting them would be inventing a rule nothing relies on.
  assert.equal(isRecordableParticipant("AI-INTERPRETER-en-1"), true);
  assert.equal(isRecordableParticipant("aibot_room"), true);
});

test("an absent identity is not a person to record", () => {
  assert.equal(isRecordableParticipant(null), false);
  assert.equal(isRecordableParticipant(undefined), false);
  assert.equal(isRecordableParticipant(""), false);
});
