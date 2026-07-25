export interface QuestionDto {
  id: string;
  askedBy: string;
  askedByDisplayName: string;
  body: string;
  status: "open" | "answered";
  upvoteCount: number;
  /** Whether the CURRENT viewer has upvoted this question. */
  upvotedByMe: boolean;
  createdAt: string;
  answeredAt?: string | null;
}

export interface CreateQuestionRequest {
  body: string;
  displayName?: string;
}
