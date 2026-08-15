/**
 * Whether this client should start the recording without being asked.
 *
 * Recording exists so the timestamps in a summary have somewhere to jump to. Leaving it to
 * whoever remembers the button meant most meetings produced citations that pointed at nothing.
 *
 * The conditions are narrow on purpose, because getting any of them wrong is worse than not
 * recording at all:
 *
 *   host only        not a permission any more — the server now accepts a start from any
 *                    participant — but exactly one client should start a recording NOBODY
 *                    asked for, and the room's host is the unambiguous choice. Callers pass
 *                    the strict room-host flag here, not the workspace-role one: on the latter
 *                    every Owner/Admin who joined raced the others into "already in progress".
 *   connected        egress records a LiveKit room; asking before the room exists fails
 *   not already on   a second "start" against a live egress is an error, not a no-op
 *   once per session this is the one that matters. A host who deliberately stops recording
 *                    must not have it restarted under them a render later — which is exactly
 *                    what a condition of "not recording" alone would do.
 */
export function shouldAutoStartRecording(state: {
  isHost: boolean;
  isConnected: boolean;
  isRecording: boolean;
  /** Has this client already tried, this session, whether or not it worked? */
  hasAttempted: boolean;
}): boolean {
  return (
    state.isHost &&
    state.isConnected &&
    !state.isRecording &&
    !state.hasAttempted
  );
}
