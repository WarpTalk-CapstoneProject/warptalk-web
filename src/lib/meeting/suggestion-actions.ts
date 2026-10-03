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
  /**
   * The key the button's text is looked up under, in meetingTranscript.suggestion.actions.
   *
   * WT-922: the button used to print `label`, which is English whatever the reader's interface
   * language is — so a Vietnamese reader got "Ask WarpBot this" under a Vietnamese suggestion.
   * `label` stays as the English source text the tests and the catalog are written against; the
   * component never renders it.
   */
  id: string;
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
  "Plan",
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

/**
 * Shared by several categories. Research reaches past the meeting on purpose: the transcript is
 * where the point came up, not where it gets answered.
 */
const RESEARCH_TOPIC: SuggestionAction = {
  id: "researchTopic",
  label: "Research this",
  prompt: (subject, detail) =>
    withContext(
      `Research this point from our meeting — search the web as well as our workspace documents — `
        + `and give me a short brief: what it is, what matters for us, and your sources: ${subject}`,
      detail,
    ),
};

const PLAN_EXECUTION: SuggestionAction = {
  id: "planExecution",
  label: "Plan how to do it",
  prompt: (subject, detail) =>
    withContext(
      `Plan how to carry this out: break it into concrete steps, with who should own each, what `
        + `each depends on, the risks, and a realistic timeline. Ask me only for what you cannot `
        + `work out from the meeting: ${subject}`,
      detail,
    ),
};

export const GENERIC_ACTIONS: SuggestionAction[] = [
  {
    id: "askWarpBot",
    label: "Ask WarpBot",
    // Was "About our meeting: {subject}" — a topic label with no request in it.
    prompt: (subject, detail) =>
      withContext(
        `Answer this from our meeting, using the transcript and our workspace documents, and say what your answer rests on: ${subject}`,
        detail,
      ),
  },
  RESEARCH_TOPIC,
];

export const CATEGORY_ACTIONS: Record<string, SuggestionAction[]> = {
  term: [
    {
      id: "researchTerm",
      label: "Research this term",
      prompt: (subject) => `Research this term from our meeting and explain it plainly: ${subject}`,
    },
    {
      id: "findTermInDocuments",
      label: "Find it in our documents",
      prompt: (subject) =>
        `Search our workspace documents and glossary for this term and tell me how we use it: ${subject}`,
    },
    {
      id: "draftGlossaryEntry",
      label: "Draft a glossary entry",
      prompt: (subject, detail) =>
        withContext(
          `Draft a glossary entry for this term from our meeting — the term, a one-line definition `
            + `and how it should be translated — and ask me which glossary to add it to before `
            + `saving anything: ${subject}`,
          detail,
        ),
    },
  ],
  clarification: [
    {
      id: "askQuestion",
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
    RESEARCH_TOPIC,
    {
      id: "findWhoKnows",
      label: "Find who would know",
      prompt: (subject) =>
        `Who in this workspace has worked on this, based on our meetings and documents? ${subject}`,
    },
  ],
  fact: [
    {
      id: "checkInDocuments",
      label: "Check this in the documents",
      prompt: (subject, detail) =>
        withContext(
          `Check this against our workspace documents and say whether it matches: ${subject}`,
          detail,
        ),
    },
    {
      id: "verifyOnline",
      label: "Verify it on the web",
      prompt: (subject, detail) =>
        withContext(
          `Check this claim from our meeting against current sources on the web, say whether it `
            + `holds, and cite what you found: ${subject}`,
          detail,
        ),
    },
  ],
  correction: [
    {
      id: "checkWhichIsRight",
      label: "Check which is right",
      prompt: (subject, detail) =>
        withContext(
          `Work out which of these two things said in our meeting our documents support: ${subject}`,
          detail,
        ),
    },
    RESEARCH_TOPIC,
  ],
  action: [
    {
      id: "draftTask",
      label: "Draft this task",
      prompt: (subject, detail) =>
        withContext(
          `Turn this into a task with a clear owner and a deadline, and say what is still missing: ${subject}`,
          detail,
        ),
    },
    PLAN_EXECUTION,
    {
      id: "researchHowTo",
      label: "Research how to do it",
      prompt: (subject, detail) =>
        withContext(
          `Research what doing this well takes — approaches, tools, prerequisites and common `
            + `pitfalls — using the web and our workspace documents, and cite your sources: ${subject}`,
          detail,
        ),
    },
    {
      id: "findRelatedWork",
      label: "Find related work",
      prompt: (subject) =>
        `Find what our earlier meetings and workspace documents already say about this, and who was involved: ${subject}`,
    },
  ],
};

/**
 * The language WarpBot is told to answer in, from the reader's interface locale.
 *
 * Without it the model had only the suggestion to go on, and the suggestion is in the language
 * of the TRANSCRIPT — so a reader on an English interface pressed an English button and got a
 * Vietnamese ask card back. The reader's own language is the one they asked in.
 */
const REPLY_LANGUAGES: Record<string, string> = {
  en: "English",
  vi: "Vietnamese",
  ja: "Japanese",
};

export function replyLanguageFor(locale: string | null | undefined): string {
  const base = (locale ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return REPLY_LANGUAGES[base] ?? "English";
}

/**
 * The most a card offers. Each category has a primary step and then the broader ones —
 * research, a plan — that turn a noticed point into work; four still fits on two short rows.
 */
export const MAX_ACTIONS = 4;

/** The actions offered for one suggestion, each prompt ending in the language to reply in. */
export function actionsFor(
  suggestion: {
    category: string;
    content: string;
    detail?: string | null;
  },
  locale?: string | null,
): { id: string; label: string; prompt: string }[] {
  const subject = suggestion.content.trim();
  const detail = suggestion.detail?.trim() ?? "";
  const language = replyLanguageFor(locale);
  const actions = CATEGORY_ACTIONS[suggestion.category] ?? GENERIC_ACTIONS;
  return actions.slice(0, MAX_ACTIONS).map((action) => ({
    id: action.id,
    label: action.label,
    prompt:
      `${action.prompt(subject, detail)}\n\n`
      + `Reply in ${language}, including any questions you ask me — even where the meeting quote above is in another language.`,
  }));
}

