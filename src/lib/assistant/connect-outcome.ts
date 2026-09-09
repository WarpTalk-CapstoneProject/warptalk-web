/**
 * What the API says happened when a plugin connect came back, and what to tell the user.
 *
 * The backend redirects to `/connect/{provider}/callback` with `status` and, on a failure, a
 * `reason` drawn from a small closed set. Neither value is trusted as the connection's state -
 * the plugins page re-fetches that - so all this decides is which sentence appears.
 *
 * Kept in one module because two surfaces read the same query: the callback page, which mostly
 * forwards, and the plugins page, which is where the sentence is actually shown.
 */

export const CONNECT_STATUSES = ["connected", "partial", "error"] as const;
export type ConnectStatus = (typeof CONNECT_STATUSES)[number];

export function parseConnectStatus(value: string | null): ConnectStatus | null {
  return CONNECT_STATUSES.includes(value as ConnectStatus) ? (value as ConnectStatus) : null;
}

export interface ConnectOutcome {
  status: ConnectStatus;
  /** An error code from the API; anything unrecognised falls back to the generic sentence. */
  reason: string | null;
  /** The plugin key the flow was for, when the API knew it. */
  pluginKey: string | null;
  /** The correlation id the API's logs are keyed by. Only present on a failure. */
  reference: string | null;
}

/**
 * How the tab that finished a consent tells the tab that started it.
 *
 * The consent opens in a second tab (`window.open` with `noopener`), so the tab holding the
 * result has no `window.opener` to talk through. The finishing tab goes to the plugins page on
 * its own; this is what keeps the tab the user came from - and may well go back to - from sitting
 * on a plugin that still says "Connect".
 *
 * The desktop app has the same gap for a different reason and solves it with a `warptalk://`
 * link, because there the two sides are separate processes rather than two tabs of one origin.
 */
export const CONNECT_CHANNEL = "warptalk:plugin-connect";

export type ConnectChannelMessage = { kind: "outcome"; outcome: ConnectOutcome };

/**
 * One-way and unacknowledged: the tab that finished the consent is on its way to the plugins page
 * regardless, so nothing depends on whether another tab was listening.
 */
export function isConnectChannelMessage(value: unknown): value is ConnectChannelMessage {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "outcome";
}

/**
 * The outcome a finished connect carried on the URL, or null when this is an ordinary visit.
 *
 * None of it is trusted as the connection's own state - the catalog query decides that. It only
 * picks which sentence, if any, is worth showing.
 */
export function readConnectOutcome(
  params: Pick<URLSearchParams, "get">,
): ConnectOutcome | null {
  const status = parseConnectStatus(params.get("status"));
  if (!status) return null;

  return {
    status,
    reason: params.get("reason"),
    pluginKey: params.get("plugin"),
    reference: params.get("ref"),
  };
}

export interface ConnectNotice {
  tone: "error" | "warning";
  title: string;
  detail: string;
  /** What the button beside the sentence should do, when one is worth offering. */
  action: "retry" | "grant" | null;
}

/**
 * The sentence for an outcome, or null when there is nothing to say.
 *
 * A clean success says nothing on purpose: the tile flips to "Connected" with the account on it,
 * which is the same information without a second thing to read and dismiss.
 */
export function connectNotice(outcome: ConnectOutcome, pluginLabel: string): ConnectNotice | null {
  if (outcome.status === "connected") return null;

  if (outcome.status === "partial") {
    return {
      tone: "warning",
      title: `${pluginLabel} is connected with limited access.`,
      detail:
        "Some permissions were not granted on the provider's consent screen, so part of this plugin cannot run yet.",
      action: "grant",
    };
  }

  switch (outcome.reason) {
    case "permission_denied":
      return {
        tone: "warning",
        title: `${pluginLabel} was not connected.`,
        detail: "The permission request was declined, so nothing was changed.",
        action: "retry",
      };
    case "provider_configuration":
      // Deliberately not "try again": no amount of retrying fixes a client secret that is not
      // set. The reference is the only thing that turns this into something an operator can act
      // on, so it is the one detail the user is asked to carry.
      return {
        tone: "error",
        title: `Could not connect ${pluginLabel}.`,
        detail:
          "WarpTalk's connection to this provider is not configured correctly. Nothing is wrong with your account - send the reference below to a workspace admin.",
        action: null,
      };
    case "provider_unavailable":
      return {
        tone: "error",
        title: `Could not connect ${pluginLabel}.`,
        detail: "The provider did not complete the request. This is usually temporary.",
        action: "retry",
      };
    case "connection_required":
      return {
        tone: "error",
        title: `${pluginLabel} needs to be connected again.`,
        detail:
          "The provider did not return lasting access this time. Connecting again, and approving the request, will fix it.",
        action: "retry",
      };
    case "plugin_not_installed":
      return {
        tone: "error",
        title: `${pluginLabel} is not installed for this account.`,
        detail: "Install it first, then connect.",
        action: null,
      };
    default:
      return {
        tone: "error",
        title: `Could not connect ${pluginLabel}.`,
        detail: "Something went wrong finishing the connection.",
        action: "retry",
      };
  }
}
