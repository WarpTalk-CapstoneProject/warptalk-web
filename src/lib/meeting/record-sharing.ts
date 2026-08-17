/**
 * Who can read a finished meeting's record, and what the screen says about it. WT-480.
 *
 * A meeting leaves behind a transcript, an AI summary and — if it was recorded — a video. All
 * three are governed by ONE room setting, `artifactAccess`, which has always existed and has
 * always been enforced on the server. Nothing in the product could turn it on, so every meeting
 * stayed on its default: host only. A participant opening the record of a meeting they attended
 * was refused, and the refusal read as a broken page rather than as a setting somebody owns.
 *
 * TWO AXES, KEPT APART
 *
 * This module is only the VISIBILITY axis. "Finalize transcript" is a different question —
 * whether the wording is still editable — and the two are deliberately independent: a record can
 * be shared and still editable, or locked and still private. Folding them into one control would
 * mean a typo could never be fixed once the record had been shared.
 */

/** The stored vocabulary. Matches ArtifactAccessLevels on the server, exactly. */
export const ARTIFACT_ACCESS = {
  hostOnly: "HOST_ONLY",
  allParticipants: "ALL_PARTICIPANTS",
} as const;

export type ArtifactAccessLevel =
  (typeof ARTIFACT_ACCESS)[keyof typeof ARTIFACT_ACCESS];

/**
 * Whether this meeting's record is shared with the people who took part.
 *
 * Anything unrecognised — an absent setting, a level this build does not know — reads as NOT
 * shared, which is the same direction the server's guard fails in. Guessing "shared" from an
 * unknown value would put a reassuring sentence on screen about an access decision that was
 * never made.
 */
export function isRecordShared(artifactAccess?: string | null): boolean {
  return artifactAccess === ARTIFACT_ACCESS.allParticipants;
}

/** The level the Publish/Unpublish button should send. */
export function nextArtifactAccess(artifactAccess?: string | null): ArtifactAccessLevel {
  return isRecordShared(artifactAccess)
    ? ARTIFACT_ACCESS.hostOnly
    : ARTIFACT_ACCESS.allParticipants;
}

export type RecordSharingView = {
  /** Shown beside the "Meeting record" heading. */
  badge: string;
  /** The banner's tone. `null` means show no banner at all. */
  tone: "draft" | "shared" | "withheld" | null;
  /** The banner's sentence, already written for the person reading it. */
  message: string | null;
  /** The label for the host's sharing control, or null when the viewer is not the host. */
  action: string | null;
};

/**
 * What the meeting-record header should say, for this viewer.
 *
 * Written as one function returning all four pieces because they have to agree: a "Draft" badge
 * beside a banner saying everyone can read it is worse than either alone, and that disagreement
 * is exactly what happens when each piece derives its own answer at its own call site.
 */
export function describeRecordSharing({
  artifactAccess,
  isHost,
}: {
  artifactAccess?: string | null;
  isHost: boolean;
}): RecordSharingView {
  const shared = isRecordShared(artifactAccess);

  if (isHost) {
    return shared
      ? {
          badge: "Published",
          tone: "shared",
          // Says what changed and what still can: after sharing, every later edit is an edit to
          // something other people have already read.
          message:
            "Everyone who took part can read this record. You can still edit it — changes show up for them straight away.",
          action: "Unpublish",
        }
      : {
          badge: "Draft",
          tone: "draft",
          // Names who is NOT seeing it. The screen said nothing at all before, so a host had no
          // reason to think the record was private and every reason to assume it was not.
          message:
            "Only you can see this record. Publish it to share the transcript, AI summary and recording with everyone who took part.",
          action: "Publish to participants",
        };
  }

  // A participant. Nothing to publish, so no action — and when the record IS shared there is
  // nothing worth saying: they can simply read it, and a banner explaining that they are allowed
  // to read what is in front of them is noise.
  return shared
    ? { badge: "Shared by host", tone: null, message: null, action: null }
    : {
        badge: "Not shared yet",
        tone: "withheld",
        // "Unauthorized" was the old answer and it is the wrong sentence for the case that
        // actually happens: somebody who WAS in the meeting, reading the record of the meeting
        // they attended. It reads as a broken product rather than as a decision the host owns.
        message:
          "The host has not shared this meeting's record yet. You will be able to read it here once they do.",
        action: null,
      };
}
