/**
 * WT-887: the "@" the WarpBot composer is completing, read off the text before the caret.
 *
 * Two shapes:
 *
 *  - `@Alice`, `@Q3 rev…` — the plain mention it always was: every kind of option, filtered by name.
 *  - `@document:spec`, `@summary:standup` — a NAMESPACE, then a name. Only that kind is offered,
 *    and only the part after the colon filters it. `@summary:` names a meeting's summary,
 *    `@transcript:` its transcript, `@artifact:` either of the two — the things WarpBot can read
 *    about a meeting beyond the room itself. `doc` and `room` are aliases, since that is what the
 *    rest of the product calls them.
 *
 * There is deliberately no `minutes:` namespace. The AI worker accepts a `minutes` mention, but it
 * has no tool that reads minutes content, so offering it would promise an answer WarpBot cannot give.
 *
 * The query runs to the next whitespace or "@", not just over word characters: `\w` stops at "ệ",
 * so "@Việt" used to close the menu mid-word, and it stops at ":", which is what made "@document:"
 * close it (the bug WT-887 was filed for). A multi-word name is still reached the way it was — type
 * the first word and pick it; the space closes the menu.
 *
 * An "@" glued to a word or a dot before it is not a mention: "an@example.com" is an address, and
 * with the looser query it would otherwise hold the menu open over the whole domain.
 */
export type MentionNamespace = "document" | "meeting" | "summary" | "transcript" | "artifact";

/** In the order the menu offers them as hints. */
export const MENTION_NAMESPACES: readonly MentionNamespace[] = [
  "document",
  "meeting",
  "summary",
  "transcript",
  "artifact",
];

/** What each namespace is typed as, canonical keyword first. */
const NAMESPACE_KEYWORDS: Record<MentionNamespace, readonly string[]> = {
  document: ["document", "doc"],
  meeting: ["meeting", "room"],
  summary: ["summary"],
  transcript: ["transcript"],
  artifact: ["artifact"],
};

/**
 * The wire entityTypes a namespace offers. `meeting` is the existing `room` type — the AI worker
 * reads both names the same way, and `room` is what the send path has always carried.
 */
export const NAMESPACE_ENTITY_TYPES: Record<MentionNamespace, readonly string[]> = {
  document: ["document"],
  meeting: ["room"],
  summary: ["summary"],
  transcript: ["transcript"],
  artifact: ["summary", "transcript"],
};

const TRIGGER =
  /(?<![\p{L}\p{N}_.])@(?:(document|doc|meeting|room|summary|transcript|artifact):)?([^\s@]*)$/iu;

export interface MentionTrigger {
  /** Index of the "@" in the text the trigger was read from — where an inserted token begins. */
  start: number;
  /** Null for a plain `@name`. */
  namespace: MentionNamespace | null;
  /** What filters the options: the text after the colon, or after the "@" when there is none. */
  query: string;
}

export function parseMentionTrigger(textBeforeCursor: string): MentionTrigger | null {
  const match = TRIGGER.exec(textBeforeCursor);
  if (!match) return null;
  const keyword = match[1]?.toLowerCase();
  return {
    start: match.index,
    namespace: keyword ? namespaceForKeyword(keyword) : null,
    query: match[2] ?? "",
  };
}

function namespaceForKeyword(keyword: string): MentionNamespace | null {
  for (const namespace of MENTION_NAMESPACES) {
    if (NAMESPACE_KEYWORDS[namespace].includes(keyword)) return namespace;
  }
  return null;
}

/** How a namespace is written into the draft when its hint is picked: `document:`. */
export function namespaceKeyword(namespace: MentionNamespace): string {
  return `${NAMESPACE_KEYWORDS[namespace][0]}:`;
}

/**
 * The namespaces a plain `@query` could be the start of, for the menu's hint rows.
 *
 * `exact` is set when the query IS a keyword ("@document", "@doc"): that is somebody asking for the
 * namespace, not for a title containing the word, so the menu puts the hint first and Enter or Tab
 * turns it into "@document:". Otherwise the hints go last, under the real matches — "@me" is far
 * more often a person or a meeting than the start of "meeting:", and Enter must keep picking what
 * it picked before this existed.
 *
 * A bare "@" offers none: the hints would push every real option down the list for a syntax the
 * user has shown no sign of reaching for.
 */
export function namespaceHints(query: string): { namespaces: MentionNamespace[]; exact: boolean } {
  const typed = query.toLowerCase();
  if (!typed) return { namespaces: [], exact: false };
  const namespaces = MENTION_NAMESPACES.filter((namespace) =>
    NAMESPACE_KEYWORDS[namespace].some((keyword) => keyword.startsWith(typed)),
  );
  const exact = namespaces.some((namespace) => NAMESPACE_KEYWORDS[namespace].includes(typed));
  return { namespaces, exact };
}
