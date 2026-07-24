export interface PollOptionDto {
  id: string;
  label: string;
  position: number;
  voteCount: number;
}

export interface PollDto {
  id: string;
  createdBy: string;
  question: string;
  isMultipleChoice: boolean;
  status: "open" | "closed";
  createdAt: string;
  closedAt?: string | null;
  options: PollOptionDto[];
  /** Option ids the CURRENT viewer has voted for. */
  myVotedOptionIds: string[];
}

export interface CreatePollRequest {
  question: string;
  options: string[];
  isMultipleChoice: boolean;
}

export interface VotePollRequest {
  optionIds: string[];
}

/** Payload of TranslationRoomHub's "PollVoted" event — optionId -> vote count. */
export type PollTally = Record<string, number>;
