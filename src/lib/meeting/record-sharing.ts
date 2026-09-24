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
  /**
   * The banner's tone. `null` means show no banner at all. `scheduled` (WT-826) is a record that
   * is not shared YET and will be the moment the meeting ends, with nobody having to press
   * anything.
   */
  tone: "draft" | "shared" | "withheld" | "scheduled" | null;
  /** The banner's sentence, already written for the person reading it. */
  message: string | null;
  /** The label for the host's sharing control, or null when the viewer is not the host. */
  action: string | null;
  /**
   * The level the host's control sends. Not always the opposite of the stored level: before the
   * meeting ends, a record that will share itself is "not shared" today, and the control on it
   * keeps it private rather than publishing it early.
   */
  nextLevel: ArtifactAccessLevel | null;
};

/**
 * WT-826: whether this record will be shared by the room itself when the meeting ends.
 *
 * Only while the meeting is still running, only when it is not already shared, and only when the
 * room's toggle is not off. `autoShareRecord` absent reads as ON — the server reports the
 * effective value, and a room created before the toggle is shared at the end like a new one.
 */
export function sharesWhenMeetingEnds({
  artifactAccess,
  isEnded,
  autoShareRecord,
}: {
  artifactAccess?: string | null;
  isEnded?: boolean;
  autoShareRecord?: boolean | null;
}): boolean {
  return isEnded === false && !isRecordShared(artifactAccess) && autoShareRecord !== false;
}

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
  isEnded,
  autoShareRecord,
}: {
  artifactAccess?: string | null;
  isHost: boolean;
  /**
   * WT-826. `undefined` means the caller does not know, and then nothing is promised about the
   * end of the meeting — the view describes only what is stored.
   */
  isEnded?: boolean;
  /** WT-826: the room's "share automatically" toggle, as the server reports it. */
  autoShareRecord?: boolean | null;
}): RecordSharingView {
  const shared = isRecordShared(artifactAccess);

  // WT-826. Before this, a meeting in progress told its host "Draft — only you can see this" and
  // its participants "Not shared yet", about a record the room was going to share on its own the
  // moment it ended. Both sentences were about a click that no longer has to happen.
  if (sharesWhenMeetingEnds({ artifactAccess, isEnded, autoShareRecord })) {
    return isHost
      ? {
          badge: "Shares when the meeting ends",
          tone: "scheduled",
          message:
            "Everyone who took part will be able to read the transcript, AI summary and recording as soon as the meeting ends. Keep it private if this meeting should stay with you.",
          action: "Keep private",
          nextLevel: ARTIFACT_ACCESS.hostOnly,
        }
      : {
          badge: "Shared when the meeting ends",
          tone: null,
          message: null,
          action: null,
          nextLevel: null,
        };
  }

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
          nextLevel: ARTIFACT_ACCESS.hostOnly,
        }
      : {
          badge: "Draft",
          tone: "draft",
          // Names who is NOT seeing it. The screen said nothing at all before, so a host had no
          // reason to think the record was private and every reason to assume it was not.
          message:
            "Only you can see this record. Publish it to share the transcript, AI summary and recording with everyone who took part.",
          action: "Publish to participants",
          nextLevel: ARTIFACT_ACCESS.allParticipants,
        };
  }

  // A participant. Nothing to publish, so no action — and when the record IS shared there is
  // nothing worth saying: they can simply read it, and a banner explaining that they are allowed
  // to read what is in front of them is noise.
  return shared
    ? { badge: "Shared by host", tone: null, message: null, action: null, nextLevel: null }
    : {
        badge: "Not shared yet",
        tone: "withheld",
        // "Unauthorized" was the old answer and it is the wrong sentence for the case that
        // actually happens: somebody who WAS in the meeting, reading the record of the meeting
        // they attended. It reads as a broken product rather than as a decision the host owns.
        message:
          "The host has not shared this meeting's record yet. You will be able to read it here once they do.",
        action: null,
        nextLevel: null,
      };
}
