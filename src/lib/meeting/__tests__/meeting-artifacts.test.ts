import test from "node:test";
import assert from "node:assert/strict";

import {
  artifactDownloadFormat,
  artifactLabel,
  artifactStatusLabel,
  canDownloadArtifact,
  findPlayableRecording,
} from "../meeting-artifacts.ts";
import type { RoomHistoryArtifact } from "@/types/roomHistory";

const artifact = (
  over: Partial<RoomHistoryArtifact> = {},
): RoomHistoryArtifact =>
  ({
    id: "a1",
    type: "summary_export",
    title: "AI summary",
    description: "Generated room artifact.",
    status: "ready",
    createdAt: "2026-08-09T00:00:00Z",
    consentRequired: false,
    consentStatus: "not_required",
    backendSource: "translation_room_summaries",
    ...over,
  }) as RoomHistoryArtifact;

test("every artifact type has a human label", () => {
  assert.equal(artifactLabel("summary_export"), "AI summary");
  assert.equal(artifactLabel("transcript_export"), "Transcript");
  assert.equal(artifactLabel("recording"), "Recording");
  assert.equal(artifactLabel("debug_log"), "Debug log");
  assert.equal(artifactLabel("audio_sample"), "Audio sample");
});

test("consent outranks status in the label", () => {
  // Ready *and* consent-required is the interesting case: the download will stop and ask,
  // so calling it "Ready" would make that pause look like something went wrong.
  assert.equal(
    artifactStatusLabel(artifact({ status: "ready", consentRequired: true })),
    "Consent required",
  );
  assert.equal(artifactStatusLabel(artifact({ status: "ready" })), "Ready");
  assert.equal(
    artifactStatusLabel(artifact({ status: "processing" })),
    "Processing",
  );
});

test("only a ready artifact is downloadable", () => {
  assert.equal(canDownloadArtifact(artifact({ status: "ready" })), true);
  for (const status of ["processing", "failed", "missing", "expired"] as const) {
    assert.equal(
      canDownloadArtifact(artifact({ status })),
      false,
      `${status} must not offer a download`,
    );
  }
});

// The row used to print `artifact.format`, which is the STORED format: MARKDOWN for the
// transcript, JSON for the summary. Both are correct for the code that reads them and both were
// wrong on screen, because the server serves those two as plain text — so a row labelled JSON
// handed over a .txt when clicked. This is the only thing that decides what the row claims.
test("the two text exports are reported as TXT, whatever they are stored as", () => {
  assert.equal(
    artifactDownloadFormat(artifact({ type: "summary_export", format: "JSON" })),
    "TXT",
  );
  assert.equal(
    artifactDownloadFormat(artifact({ type: "transcript_export", format: "MARKDOWN" })),
    "TXT",
  );
});

test("anything that is a real file keeps its own format", () => {
  // A recording is not rendered to text on the way out — it is the file it says it is.
  assert.equal(artifactDownloadFormat(artifact({ type: "recording", format: "MP4" })), "MP4");
  assert.equal(artifactDownloadFormat(artifact({ type: "recording", format: undefined })), "—");
});

// WT-492 — the recording was reachable only as a file to download, so watching the meeting back
// meant saving a video and leaving the page with the transcript on it. The artifact row was never
// missing; somewhere to play it was.

test("the recording is found among the other artifacts", () => {
  const recording = artifact({ id: "rec", type: "recording", format: "MP4" });
  const found = findPlayableRecording([
    artifact({ id: "t", type: "transcript_export" }),
    artifact({ id: "s", type: "summary_export" }),
    recording,
  ]);

  assert.equal(found?.id, "rec");
});

test("a meeting nobody recorded has nothing to play", () => {
  // The ordinary case, and the reason this returns null rather than throwing: the player renders
  // nothing at all, instead of an empty frame promising a video that does not exist.
  assert.equal(
    findPlayableRecording([
      artifact({ id: "t", type: "transcript_export" }),
      artifact({ id: "s", type: "summary_export" }),
    ]),
    null,
  );
  assert.equal(findPlayableRecording([]), null);
  assert.equal(findPlayableRecording(undefined), null);
  assert.equal(findPlayableRecording(null), null);
});

test("a recording that is not ready yet is not playable", () => {
  // Same gate as the download button: there are no bytes behind a processing artifact, and a
  // <video> pointed at one shows a broken element rather than saying it is not ready.
  for (const status of ["processing", "failed", "missing", "expired", "deleted"] as const) {
    assert.equal(
      findPlayableRecording([artifact({ id: "rec", type: "recording", status })]),
      null,
      `${status} must not be offered for playback`,
    );
  }
});

test("a recording still behind its consent stop is offered, and consent is asked at play", () => {
  // Withholding it here would hide the file rather than protect it — consent is recorded when the
  // user presses play, which is the same moment the download path asks.
  const found = findPlayableRecording([
    artifact({ id: "rec", type: "recording", consentRequired: true, consentStatus: "limited" }),
  ]);

  assert.equal(found?.id, "rec");
  assert.equal(found?.consentRequired, true);
});
