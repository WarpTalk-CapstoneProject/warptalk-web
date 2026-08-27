/**
 * What each AI suggestion offers to do about itself, and the question it hands WarpBot.
 *
 * WHY THESE LIVE HERE
 *   They were inline in suggestion-badge.tsx, which is a component and therefore cannot be
 *   imported by the plain node test runner. That is how WT-582 shipped: two of the seven prompts
 *   were STATEMENTS rather than requests, nothing checked, and the difference is invisible until
 *   somebody presses the button and reads the reply.
 *
 * THE RULE, AND WHY IT IS THE WHOLE BUG
 *   A prompt must ASK FOR SOMETHING. "This came up in our meeting and went unanswered: Nói cái gì
 *   vậy?" states a fact and requests nothing, so the model did the only sensible thing with it and
 *   acknowledged the fact — "Câu hỏi 'Nói cái gì vậy?' vẫn chưa được trả lời." That was reported as
 *   WarpBot refusing to help. It was not: it answered exactly what it was sent.
 *
 *   Every prompt that behaved starts with an imperative — Research, Search, Check, Work out, Turn.
 *   The two that misbehaved were the two that did not. `IMPERATIVE_OPENERS` below makes that
 *   accidental correlation into a checked rule, so a sixth category cannot be added as a topic
 *   label.
 */

export type SuggestionAction = {
  label: string;
  /** Built from the hint, and handed to the widget as a question. */
  prompt: (subject: string, detail: string) => string;
};

/** Appended identically everywhere, so the model always gets the surrounding line if there is one. */
function withContext(body: string, detail: string): string {
  return detail ? `${body}\n\nContext: ${detail}` : body;
}

/**
 * The first word every prompt must open with.
 *
 * Not style policing. This is the difference between a request and a remark, and the reported bug
 * is what a remark gets you.
 */
export const IMPERATIVE_OPENERS = [
  "Answer",
  "Check",
  "Draft",
  "Explain",
  "Find",
  "Identify",
  "List",
  "Research",
  "Search",
  "Turn",
  "Work",
  "Who",
] as const;

export const GENERIC_ACTIONS: SuggestionAction[] = [
  {
    label: "Ask WarpBot",
    // Was "About our meeting: {subject}" — a topic label with no request in it.
    prompt: (subject, detail) =>
      withContext(
        `Answer this from our meeting, using the transcript and our workspace documents, and say what your answer rests on: ${subject}`,
        detail,
      ),
  },
];

export const CATEGORY_ACTIONS: Record<string, SuggestionAction[]> = {
  term: [
    {
      label: "Research this term",
      prompt: (subject) => `Research this term from our meeting and explain it plainly: ${subject}`,
    },
    {
      label: "Find it in our documents",
      prompt: (subject) =>
        `Search our workspace documents and glossary for this term and tell me how we use it: ${subject}`,
    },
  ],
  clarification: [
    {
      label: "Ask WarpBot this",
      // THE REPORTED ONE. It read "This came up in our meeting and went unanswered: {subject}",
      // which asks for nothing, so WarpBot confirmed it was unanswered and stopped.
      //
      // The fallback chain is spelled out because an unanswered question is precisely the case
      // where the transcript does NOT contain the answer — without being told to go further, the
      // honest reply is still "the meeting does not say". The last clause keeps it honest anyway:
      // saying what would settle it beats inventing an answer.
      prompt: (subject, detail) =>
        withContext(
          `Answer this question from our meeting. Nobody answered it at the time, so work it out from `
            + `the transcript, then our workspace documents and glossary, then your own knowledge — and `
            + `say which of those your answer rests on. If it genuinely cannot be answered yet, say what `
            + `would settle it.\n\nQuestion: ${subject}`,
          detail,
        ),
    },
    {
      label: "Find who would know",
      prompt: (subject) =>
        `Who in this workspace has worked on this, based on our meetings and documents? ${subject}`,
    },
  ],
  fact: [
    {
      label: "Check this in the documents",
      prompt: (subject, detail) =>
        withContext(
          `Check this against our workspace documents and say whether it matches: ${subject}`,
          detail,
        ),
    },
  ],
  correction: [
    {
      label: "Check which is right",
      prompt: (subject, detail) =>
        withContext(
          `Work out which of these two things said in our meeting our documents support: ${subject}`,
          detail,
        ),
    },
  ],
  action: [
    {
      label: "Draft this task",
      prompt: (subject, detail) =>
        withContext(
          `Turn this into a task with a clear owner and a deadline, and say what is still missing: ${subject}`,
          detail,
        ),
    },
  ],
};

/**
 * The actions offered for one suggestion. Two at most: this card sits inside a transcript bubble
 * in a side panel, and a row of choices there competes with the conversation it comments on.
 */
export function actionsFor(suggestion: {
  category: string;
  content: string;
  detail?: string | null;
}): { label: string; prompt: string }[] {
  const subject = suggestion.content.trim();
  const detail = suggestion.detail?.trim() ?? "";
  const actions = CATEGORY_ACTIONS[suggestion.category] ?? GENERIC_ACTIONS;
  return actions.slice(0, 2).map((action) => ({
    label: action.label,
    prompt: action.prompt(subject, detail),
  }));
}
