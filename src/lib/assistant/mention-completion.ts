/**
 * What Tab would finish a half-typed @mention with — "@googl" offers "e Meet" — for the grey ghost
 * text in WarpBot's composer. An empty string means Tab has nothing to offer and no ghost is
 * drawn; it is never a guess.
 *
 * Empty in three cases, each for its own reason:
 *
 *  - NOT A PREFIX. The @ menu matches on `includes`, so "@meet" legitimately highlights "Google
 *    Meet" while there is nothing to complete. Only text the name actually starts with can be
 *    finished — completing "meet" to "Google Meet" would mean rewriting what was typed.
 *  - A BARE "@". Ghosting a whole name nobody began typing turns every @ into an offer to Tab.
 *  - THE CARET IS NOT AT THE END. The ghost is drawn by a mirror of the textarea's text, so it
 *    only lines up at the end of the draft; mid-line it would paint over the words after it.
 *    The caller passes the whole draft and this checks that it ends in "@<query>".
 *
 * Case: the completion keeps the option's own casing for the part not yet typed, and the ghost
 * sits after what was typed as typed. "@GOOGL" offers "e Meet". Tab replaces the lot with the
 * chip, which shows the real name, so the mixed case is never what gets sent.
 */
export function mentionCompletion({
  draft,
  query,
  highlightedTitle,
}: {
  draft: string;
  query: string;
  highlightedTitle: string | null | undefined;
}): string {
  if (!query || !highlightedTitle) return "";
  if (!draft.endsWith(`@${query}`)) return "";
  if (!highlightedTitle.toLowerCase().startsWith(query.toLowerCase())) return "";
  return highlightedTitle.slice(query.length);
}
