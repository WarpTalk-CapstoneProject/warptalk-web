import test from "node:test";
import assert from "node:assert/strict";

import {
  artifactDownloadFormat,
  artifactLabel,
  artifactStatusLabel,
  canDownloadArtifact,
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
