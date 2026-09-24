import { isArtifactWithheld } from "@/lib/meeting/artifact-denial";
import { translationRoomService } from "@/services/translation-room.service";

/**
 * WT-824 — record the host's release of a consent-held artifact, when this viewer may give it.
 *
 * Only the host can release a recording, so for everyone else this POST is refused (403). That
 * refusal used to abort the whole download: a participant never got as far as asking for the file,
 * and was shown the consent endpoint's "unauthorized to approve" instead of the answer that
 * matters — whether the host has released it. The download endpoint is the authority on who may
 * read; this is only the host's side effect, so a refusal here is not a reason to stop.
 *
 * Returns whether the release was recorded, so the caller refetches only when something changed.
 */
export async function releaseArtifactIfPermitted(artifactId: string): Promise<boolean> {
  try {
    await translationRoomService.approveArtifactConsent(artifactId);
    return true;
  } catch (error) {
    if (isArtifactWithheld(error)) return false;
    throw error;
  }
}
