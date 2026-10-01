/**
 * W4a: the main window's LiveKit connection, in the four words the popup's relay knows
 * (`BridgeWidgetMeetingConnection`). The popup is the only bridge UI left (WT-868), so "WarpTalk is
 * reconnecting" or "disconnected" has to be said there.
 *
 * Pure, and kept beside the session's own rules (`shouldConnectMeeting`): it reads the same inputs
 * the session decides `connect` from, so the popup can never claim a connection the session is not
 * even trying to hold.
 *
 * Relative imports with the extension: tested under the plain node runner.
 */

import type { BridgeWidgetMeetingConnection } from "./bridge-widget-relay.ts";

export function bridgeMeetingConnection({
  hasToken,
  canConnectRoom,
  idleReaped,
  displaced = false,
  reconnecting,
  connected,
}: {
  /** The join answered with a LiveKit token. */
  hasToken: boolean;
  /** `canConnectToRoom`: the room is still joinable. */
  canConnectRoom: boolean;
  /** The idle reaper let go (`isIdleReaped`). */
  idleReaped: boolean;
  /** Another login of this account took the meeting over (`sessionDisplaced`, web #646). */
  displaced?: boolean;
  /** SignalR or LiveKit is reconnecting (`isReconnecting` in the session). */
  reconnecting: boolean;
  /** LiveKit reported Connected and has not reported a disconnect since. */
  connected: boolean;
}): BridgeWidgetMeetingConnection {
  // Let go on purpose, given up to another login, or the room can no longer be joined: nothing is
  // being attempted, so neither "connecting" nor whatever LiveKit last said is true.
  if (idleReaped || displaced || !canConnectRoom) return "disconnected";
  // Still joining: no token yet is the first half of connecting, not a failure.
  if (!hasToken) return "connecting";
  if (reconnecting) return "reconnecting";
  return connected ? "connected" : "connecting";
}
