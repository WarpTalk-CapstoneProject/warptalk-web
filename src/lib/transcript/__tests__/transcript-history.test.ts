import assert from "node:assert/strict";
import test from "node:test";

import { loadSavedTranscript } from "../transcript-history.ts";

const transcript = { id: "transcript-1" };
const segments = { items: [{ id: "segment-1" }] };

test("loads a saved transcript and its segments", async () => {
  const result = await loadSavedTranscript("room-1", {
    getByRoom: async () => ({ data: transcript }),
    segments: async () => ({ data: segments }),
  });

  assert.deepEqual(result, { transcript, segments: segments.items });
});

test("returns null only when the room has no transcript row", async () => {
  const result = await loadSavedTranscript("room-1", {
    getByRoom: async () => {
      throw { response: { status: 404 } };
    },
    segments: async () => {
      throw new Error("segments must not be requested");
    },
  });

  assert.equal(result, null);
});

test("does not hide transcript API failures as an empty transcript", async () => {
  const failure = { response: { status: 500 } };

  await assert.rejects(
    loadSavedTranscript("room-1", {
      getByRoom: async () => {
        throw failure;
      },
      segments: async () => ({ data: segments }),
    }),
    (error) => error === failure,
  );
});

test("does not hide segment API failures as an empty transcript", async () => {
  const failure = { response: { status: 404 } };

  await assert.rejects(
    loadSavedTranscript("room-1", {
      getByRoom: async () => ({ data: transcript }),
      segments: async () => {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
});
