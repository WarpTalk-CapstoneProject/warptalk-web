/**
 * What a failed LiveKit connection should say to the person who cannot get into the meeting.
 *
 * The stage used to show "Waiting for LiveKit" for every non-connected state, including the
 * ones that are over. A room that will never connect and a room that is connecting look the
 * same in that wording, so a terminal failure read as patience — and the Retry button was
 * gated on an error that nothing ever set.
 *
 * The first case below is not hypothetical: the project's LiveKit Cloud plan ran out of
 * connection minutes, and every join was refused with a 429 while the UI said "Waiting".
 * Nobody could tell from the screen that no amount of waiting would help, or that the fix was
 * a billing limit rather than anything in the app.
 */
export function describeLiveKitError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();

  if (lower.includes("connection minutes") || lower.includes("limit exceeded")) {
    return "This workspace's LiveKit plan has run out of connection minutes, so the server is refusing new meetings. Raising the limit is the only fix — retrying will not help.";
  }

  if (lower.includes("quota") || lower.includes("too many requests") || lower.includes("429")) {
    return "The media server is refusing new connections because a usage limit was reached. Retrying will not help until the limit is raised.";
  }

  if (
    lower.includes("invalid token")
    || lower.includes("unauthorized")
    || lower.includes("401")
    || lower.includes("permission")
  ) {
    return "The media server rejected this meeting's access token. Leaving and rejoining the meeting will issue a new one.";
  }

  if (
    lower.includes("could not establish")
    || lower.includes("network")
    || lower.includes("timeout")
    || lower.includes("failed to fetch")
    || lower.includes("websocket")
  ) {
    return "Could not reach the media server. Check your connection, then try again.";
  }

  // Keep the original wording rather than inventing a friendlier lie: an unrecognised failure
  // is exactly the case where the raw text is the only thing that can be searched for.
  return message ? `Could not join the meeting: ${message}` : "Could not join the meeting.";
}
