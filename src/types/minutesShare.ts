import type { MeetingMinutesDto } from "@/types/meetingMinutes";

/**
 * Who may open a shared biên bản.
 *
 * `INVITED_ONLY` is what a link is created as, and what it stays until somebody deliberately
 * widens it. `ANYONE_WITH_LINK` is public in the ordinary sense of the word: no account, no
 * workspace, just the URL — which is why the dialog says so in as many words before it is chosen.
 */
export type MinutesShareMode = "INVITED_ONLY" | "ANYONE_WITH_LINK";

export interface MinutesSharePerson {
  email: string;
  createdAt: string;
}

export interface MinutesShare {
  /** Empty once the link is revoked: a revoked link has no address to show. */
  token: string;
  /** Built server-side, so every surface sends people to the same place. */
  url: string;
  accessMode: MinutesShareMode;
  allowDownload: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  people: MinutesSharePerson[];
}

/** What somebody holding a link is served: the document, and how they may treat it. */
export interface SharedMinutes {
  minutes: MeetingMinutesDto;
  accessMode: MinutesShareMode;
  allowDownload: boolean;
}
