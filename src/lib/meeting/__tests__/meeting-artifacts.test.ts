import test from "node:test";
import assert from "node:assert/strict";

import {
  artifactDownloadFormat,
  artifactLabel,
  artifactStatusLabel,
  canDownloadArtifact,
  countPlayableRecordings,
  findPlayableRecording,
  hasPendingRecording,
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

// WT-655 — findPlayableRecording returns the FIRST match, which is fine for "what do I play" and
// wrong for "may I seek". Anyone in the room can stop and restart recording, and each run is its
// own file with its own start instant: a moment from the second half of the meeting measured
// against the first file yields a positive, plausible, wrong offset. That is a seek that looks like
// it worked and lands on the wrong sentence, and nothing in the arithmetic can detect it, because
// both origins it was handed are real. So it is counted instead.

test("no recordings at all is zero, not an error", () => {
  assert.equal(countPlayableRecordings(undefined), 0);
  assert.equal(countPlayableRecordings(null), 0);
  assert.equal(countPlayableRecordings([]), 0);
  assert.equal(
    countPlayableRecordings([artifact({ type: "transcript_export" })]),
    0,
  );
});

test("one playable recording is the case seeking is allowed in", () => {
  assert.equal(
    countPlayableRecordings([
      artifact({ id: "t", type: "transcript_export" }),
      artifact({ id: "rec", type: "recording" }),
      artifact({ id: "s", type: "summary_export" }),
    ]),
    1,
  );
});

test("a stop-and-restart meeting counts every file it produced", () => {
  // Three runs, three rows, three different recordingStartedAt values — and one arithmetic that can
  // only be told about one of them. This count is the only thing standing between that and a seek
  // to the wrong sentence.
  assert.equal(
    countPlayableRecordings([
      artifact({ id: "r1", type: "recording", recordingStartedAt: "2026-09-08T10:00:00Z" }),
      artifact({ id: "r2", type: "recording", recordingStartedAt: "2026-09-08T10:20:00Z" }),
      artifact({ id: "r3", type: "recording", recordingStartedAt: "2026-09-08T10:45:00Z" }),
    ]),
    3,
  );
});

test("only PLAYABLE recordings are counted", () => {
  // A processing file cannot be seeked into either, so it must not push a perfectly seekable
  // meeting over the line and withhold a feature that works.
  assert.equal(
    countPlayableRecordings([
      artifact({ id: "r1", type: "recording" }),
      artifact({ id: "r2", type: "recording", status: "processing" }),
      artifact({ id: "r3", type: "recording", status: "failed" }),
    ]),
    1,
  );
});

test("a recording still being written is told apart from no recording at all", () => {
  // findPlayableRecording collapses both into null on purpose — neither can be played. They are
  // not the same thing to say to a reader: one resolves itself in a minute, the other never
  // happened, and only the first deserves anything on screen.
  assert.equal(hasPendingRecording([artifact({ type: "recording", status: "processing" })]), true);
  assert.equal(hasPendingRecording([artifact({ type: "recording", status: "failed" })]), true);
  assert.equal(hasPendingRecording([artifact({ type: "recording", status: "ready" })]), false);
  assert.equal(hasPendingRecording([artifact({ type: "transcript_export", status: "processing" })]), false);
  assert.equal(hasPendingRecording([]), false);
  assert.equal(hasPendingRecording(undefined), false);
});
