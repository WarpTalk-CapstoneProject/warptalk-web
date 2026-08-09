/**
 * Who the @ menu offers, and which keys belong to it rather than to the composer.
 *
 * The composer sends on Enter through `editorProps.handleKeyDown`. ProseMirror checks direct
 * props BEFORE plugins, so that handler beat the mention menu's own — typing `@`, seeing
 * "@WarpBot AGENT" highlighted, and pressing Enter sent the literal text "@" instead of
 * picking the thing on screen.
 *
 * Both sides now ask the same question of the same data, which is the only way they can agree.
 */

export type MentionAgent = {
  id: string;
  display: string;
  type: string;
};

/** The built-in meeting agent the chat backend understands. */
export const MENTION_AGENTS: MentionAgent[] = [
  { id: "bot-warpbot", display: "WarpBot", type: "agent" },
];

/** At most five, so the menu never grows taller than the composer it sits above. */
export const MENTION_MENU_LIMIT = 5;

export function mentionMatches(query: string): MentionAgent[] {
  const needle = query.trim().toLowerCase();
  return MENTION_AGENTS.filter((agent) =>
    agent.display.toLowerCase().startsWith(needle),
  ).slice(0, MENTION_MENU_LIMIT);
}

/**
 * Whether a keypress belongs to the open @ menu.
 *
 * Enter AND Tab: both are "take the highlighted one" everywhere else this pattern appears, and
 * Tab especially, because the whole point is not having to type the name out.
 *
 * Only while something is actually offered. With no matches the menu is a box reading "No
 * agents found", and swallowing Enter there would make the composer feel broken — the message
 * would neither send nor gain a mention. That is what the menu did before: it returned
 * "handled" for Enter whether or not it had anything to hand over.
 */
export function mentionMenuHandlesKey(key: string, matchCount: number): boolean {
  if (matchCount <= 0) return false;
  return key === "Enter" || key === "Tab";
}
