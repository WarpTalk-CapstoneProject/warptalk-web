/**
 * The relay between the Meet widget (the desktop popup) and the main WarpTalk window. WT-525.
 *
 * WHY A RELAY AND NOT THE HUB
 *   The popup is a second Electron BrowserWindow. It shares the origin and the session with the
 *   main window, but not React state — and the live meeting, including this user's speak and listen
 *   language, lives in the main window's `persistent-meeting-session`. The popup has a hub
 *   connection of its own and `SetSpeakLanguage` / `SetListenLanguage` would reach the gateway
 *   from it, but a change made that way does not stick: the main window keeps the language in its
 *   own state and re-sends it on every hub reconnect, silently undoing the popup's pick. The main
 *   window's state is the source the gateway is re-told from, so that is where a pick has to land.
 *   So the popup asks the main window to make the change, exactly as if the native picker had
 *   been used, and reads back what the main window now holds.
 *
 *   The popup must never try to become a participant to get around this: `JoinTranslationRoom`
 *   from a second connection ForceDisconnects the first (BR-159-014) — the main window.
 *
 * WHY BroadcastChannel
 *   Both windows load the same web origin in Electron's default session (warptalk-desktop
 *   src/main/index.ts: neither BrowserWindow sets `partition` or `session`, and the popup's URL is
 *   built from the main window's resolved origin). A BroadcastChannel is brokered by the browser
 *   process per (storage partition, origin), so the two renderers reach each other with no IPC
 *   handler, no preload method and therefore no desktop release. `sandbox: true` and
 *   `contextIsolation` do not affect it: it is a plain web API. A popup that ever ends up on a
 *   different origin (the local fallback renderer) simply hears nobody, and the widget treats
 *   silence as "no host" and stops offering the control — the failure is closed, not wrong.
 *
 * THE WIRE
 *   One channel per room, `warptalk:bridge-widget:<roomId>`. Every message carries `v` and
 *   `roomId`, and is validated on arrival by `parseBridgeWidgetMessage` — it crosses a window
 *   boundary, and two windows are not guaranteed to run the same build (a deploy lands between
 *   opening the main window and opening the popup).
 *
 *     popup → main   request-snapshot
 *                    set-language           { language }            one pick = speak + listen
 *                    set-voice-enabled      { enabled }
 *                    answer-browser-capture { granted, sourceId? }  the consent modal, answered here
 *                    (reserved: set-mic-device { deviceId } — not accepted yet)
 *     main → popup   snapshot               { speakLanguage, listenLanguage, voiceEnabled,
 *                                               micDeviceId?, browserCapture, at }
 *                    host-gone              the main window left this room's meeting
 *
 * VERSIONING
 *   `v` changes only when an EXISTING message changes shape. A new message type does not need a
 *   bump: receivers drop types they do not know ("unknown-type"), so an older window ignores a
 *   newer intent rather than misreading it. A message with another `v` is reported as
 *   "other-version", which the popup surfaces as "reload" rather than as "no main window".
 *
 * Relative imports with the extension, like language-choice.ts: this module's unit tests run
 * under the plain node test runner, which does not resolve "@/".
 */

import { normalizeLanguageCode } from "../language/languages.ts";
import type { BrowserCaptureConsentState } from "../audio/browser-capture-consent.ts";
import { applySingleLanguageChoice, describeLanguageChoice } from "./language-choice.ts";

export const BRIDGE_WIDGET_RELAY_VERSION = 1;

const CHANNEL_PREFIX = "warptalk:bridge-widget:";

/**
 * How long the popup waits for a main window to answer before it concludes there is none.
 *
 * A BroadcastChannel round trip between two local renderers is well under 50ms; the rest is room
 * for a main window that is busy mounting a meeting. Longer than this and a disabled-looking pill
 * reads as a broken one.
 */
export const BRIDGE_WIDGET_HOST_ANSWER_TIMEOUT_MS = 1_500;

/**
 * How long a pick made in the popup is shown before the main window confirms it.
 *
 * The main window broadcasts a snapshot as soon as its state changes, so a pick it applied is
 * confirmed within a render. One it did not apply is never confirmed — and without an expiry the
 * popup would go on showing a language nobody is speaking.
 */
export const BRIDGE_WIDGET_PENDING_PICK_TTL_MS = 3_000;

/** The one channel name for a room. Both sides must build it from here. */
export function bridgeWidgetRelayChannelName(roomId: string): string {
  return `${CHANNEL_PREFIX}${roomId}`;
}

// ── messages ─────────────────────────────────────────────────────────────────

export type BridgeWidgetBrowserCapture = {
  /**
   * `browserCaptureConsentState` in the main window, verbatim (lib/audio/browser-capture-consent).
   * "required" means the consent modal is up there — where a user watching Meet cannot see it.
   */
  state: BrowserCaptureConsentState;
  /** The loopback source the main window has selected for this room, if any. */
  selectedSourceId?: string;
};

/** What the main window holds for this user in this room. */
export type BridgeWidgetSnapshot = {
  /** Normalized bare code ("vi"), or null while the main window has none. */
  speakLanguage: string | null;
  listenLanguage: string | null;
  /** Dubbed voice on (Voice + Text) or off (Text only). */
  voiceEnabled: boolean;
  micDeviceId?: string;
  browserCapture: BridgeWidgetBrowserCapture;
  /** `Date.now()` in the main window when this was built. Same machine, same clock. */
  at: number;
};

/** Popup → main. */
export type BridgeWidgetIntent =
  | { type: "request-snapshot" }
  | { type: "set-language"; language: string }
  | { type: "set-voice-enabled"; enabled: boolean }
  | { type: "answer-browser-capture"; granted: boolean; sourceId?: string };
// Reserved for the mic picker: { type: "set-mic-device"; deviceId: string }. Add it here, to
// INTENT_TYPES and to parseBody together; no version bump (see VERSIONING above).

/** Main → popup. */
export type BridgeWidgetHostMessage =
  | ({ type: "snapshot" } & BridgeWidgetSnapshot)
  | { type: "host-gone" };

/** A message body, before the relay stamps the envelope on it. */
export type BridgeWidgetMessageBody = BridgeWidgetIntent | BridgeWidgetHostMessage;

/** What travels on the channel. */
export type BridgeWidgetMessage = BridgeWidgetMessageBody & {
  v: typeof BRIDGE_WIDGET_RELAY_VERSION;
  roomId: string;
};

export type BridgeWidgetMessageRejection =
  | "not-a-message"
  | "other-version"
  | "other-room"
  | "unknown-type"
  | "malformed";

export type BridgeWidgetParseResult =
  | { ok: true; message: BridgeWidgetMessage }
  | { ok: false; reason: BridgeWidgetMessageRejection };

const INTENT_TYPES = new Set<string>([
  "request-snapshot",
  "set-language",
  "set-voice-enabled",
  "answer-browser-capture",
]);
const HOST_MESSAGE_TYPES = new Set<string>(["snapshot", "host-gone"]);

export function isBridgeWidgetIntent(message: BridgeWidgetMessageBody): message is BridgeWidgetIntent {
  return INTENT_TYPES.has(message.type);
}

const CONSENT_STATES = new Set<string>(["not-required", "required", "granted", "declined"]);

/** A language code, or null when the value is not one. Bounded: it came from another window. */
function languageCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 35) return null;
  const code = normalizeLanguageCode(value);
  return /^[a-z]{2,3}$/.test(code) ? code : null;
}

/** An opaque id (device, loopback source). Non-empty and bounded, nothing more is assumed. */
function opaqueId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 512 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The body of a message whose envelope already checked out, rebuilt field by field.
 *
 * Rebuilt rather than cast so that nothing the sender added beyond the protocol reaches a
 * handler, and so that "optional" means absent rather than `undefined`-or-garbage.
 */
function parseBody(raw: Record<string, unknown>): BridgeWidgetMessageBody | null {
  switch (raw.type) {
    case "request-snapshot":
      return { type: "request-snapshot" };
    case "host-gone":
      return { type: "host-gone" };
    case "set-language": {
      const language = languageCode(raw.language);
      return language ? { type: "set-language", language } : null;
    }
    case "set-voice-enabled":
      return typeof raw.enabled === "boolean"
        ? { type: "set-voice-enabled", enabled: raw.enabled }
        : null;
    case "answer-browser-capture": {
      if (typeof raw.granted !== "boolean") return null;
      if (raw.sourceId === undefined) return { type: "answer-browser-capture", granted: raw.granted };
      const sourceId = opaqueId(raw.sourceId);
      return sourceId ? { type: "answer-browser-capture", granted: raw.granted, sourceId } : null;
    }
    case "snapshot": {
      const snapshot = parseSnapshot(raw);
      return snapshot ? { type: "snapshot", ...snapshot } : null;
    }
    default:
      return null;
  }
}

function parseSnapshot(raw: Record<string, unknown>): BridgeWidgetSnapshot | null {
  // null is a real answer ("the main window has no language yet"); a non-code string is not.
  const speakLanguage = raw.speakLanguage === null ? null : languageCode(raw.speakLanguage);
  const listenLanguage = raw.listenLanguage === null ? null : languageCode(raw.listenLanguage);
  if (speakLanguage === null && raw.speakLanguage !== null) return null;
  if (listenLanguage === null && raw.listenLanguage !== null) return null;
  if (typeof raw.voiceEnabled !== "boolean") return null;
  if (typeof raw.at !== "number" || !Number.isFinite(raw.at) || raw.at < 0) return null;

  const capture = raw.browserCapture;
  if (!isRecord(capture) || typeof capture.state !== "string" || !CONSENT_STATES.has(capture.state)) {
    return null;
  }
  const browserCapture: BridgeWidgetBrowserCapture = {
    state: capture.state as BrowserCaptureConsentState,
  };
  if (capture.selectedSourceId !== undefined) {
    const selectedSourceId = opaqueId(capture.selectedSourceId);
    if (!selectedSourceId) return null;
    browserCapture.selectedSourceId = selectedSourceId;
  }

  const snapshot: BridgeWidgetSnapshot = {
    speakLanguage,
    listenLanguage,
    voiceEnabled: raw.voiceEnabled,
    browserCapture,
    at: raw.at,
  };
  if (raw.micDeviceId !== undefined) {
    const micDeviceId = opaqueId(raw.micDeviceId);
    if (!micDeviceId) return null;
    snapshot.micDeviceId = micDeviceId;
  }
  return snapshot;
}

/**
 * Validate one message that arrived on `roomId`'s channel.
 *
 * Order matters for what the caller can say: a message from a different build is reported as
 * "other-version" before its body is looked at, because a body that fails THIS version's rules is
 * exactly what a different version is expected to send.
 */
export function parseBridgeWidgetMessage(raw: unknown, roomId: string): BridgeWidgetParseResult {
  if (!isRecord(raw) || typeof raw.type !== "string" || !("v" in raw)) {
    return { ok: false, reason: "not-a-message" };
  }
  if (raw.v !== BRIDGE_WIDGET_RELAY_VERSION) return { ok: false, reason: "other-version" };
  // The channel is already per room; this is the check that survives a naming mistake.
  if (raw.roomId !== roomId) return { ok: false, reason: "other-room" };
  if (!INTENT_TYPES.has(raw.type) && !HOST_MESSAGE_TYPES.has(raw.type)) {
    return { ok: false, reason: "unknown-type" };
  }
  const body = parseBody(raw);
  if (!body) return { ok: false, reason: "malformed" };
  return { ok: true, message: { ...body, v: BRIDGE_WIDGET_RELAY_VERSION, roomId } };
}

// ── main-window side ─────────────────────────────────────────────────────────

export type BridgeWidgetSnapshotFields = {
  speakLanguage?: string | null;
  listenLanguage?: string | null;
  voiceEnabled: boolean;
  micDeviceId?: string | null;
  browserCaptureState: BrowserCaptureConsentState;
  selectedLoopbackSourceId?: string | null;
};

/** The snapshot message the main window sends, from the values it holds. */
export function buildBridgeWidgetSnapshot(
  fields: BridgeWidgetSnapshotFields,
  at: number,
): Extract<BridgeWidgetMessageBody, { type: "snapshot" }> {
  const browserCapture: BridgeWidgetBrowserCapture = { state: fields.browserCaptureState };
  if (fields.selectedLoopbackSourceId) {
    browserCapture.selectedSourceId = fields.selectedLoopbackSourceId;
  }
  const snapshot: Extract<BridgeWidgetMessageBody, { type: "snapshot" }> = {
    type: "snapshot",
    speakLanguage: normalizeLanguageCode(fields.speakLanguage ?? "") || null,
    listenLanguage: normalizeLanguageCode(fields.listenLanguage ?? "") || null,
    voiceEnabled: fields.voiceEnabled,
    browserCapture,
    at,
  };
  if (fields.micDeviceId) snapshot.micDeviceId = fields.micDeviceId;
  return snapshot;
}

/**
 * A relayed pick, applied the way the native picker applies one (LanguagePairPicker's `pick` in
 * meeting-control-bar.tsx): both halves, speak first, then the persistence hook once.
 *
 * Both halves because the mesh reads speak and listen independently; writing one leaves the
 * half-applied pair the one-language picker exists to remove. The persistence hook (WT-434) is
 * what makes the pick the remembered profile — skip it and the next meeting's auto-apply puts
 * the old language back.
 */
export function applyRelayedLanguagePick(
  language: string,
  handlers: {
    onChangeSpeakLanguage: (language: string) => void;
    onChangeListenLanguage: (language: string) => void;
    onLanguagePicked?: (language: string) => void;
  },
): void {
  const applied = applySingleLanguageChoice(language);
  if (!applied.speak) return;
  handlers.onChangeSpeakLanguage(applied.speak);
  handlers.onChangeListenLanguage(applied.hear);
  handlers.onLanguagePicked?.(applied.speak);
}

/**
 * Whether an `answer-browser-capture` may be applied right now.
 *
 * Only while the main window is actually asking. An answer that arrives after the question was
 * settled — the user answered the modal in the main window, or translation stopped — is stale,
 * and applying it would let an old "yes" from one window overrule a "no" given in the other.
 * Rejected, never reinterpreted.
 */
export function acceptsBrowserCaptureAnswer(state: BrowserCaptureConsentState): boolean {
  return state === "required";
}

// ── popup side ───────────────────────────────────────────────────────────────

export type BridgeWidgetRelayStatus =
  /** Asked, not answered yet. */
  | "waiting"
  /** A main window is running this room's meeting and has told us what it holds. */
  | "connected"
  /** Nobody answered, or the main window left. Nothing here can change the meeting. */
  | "no-host"
  /** Somebody answered in a different protocol version: one of the two windows is stale. */
  | "incompatible";

export type BridgeWidgetRelayView = {
  /** The room this view is about. A view for another room is discarded, not merged. */
  roomId: string;
  status: BridgeWidgetRelayStatus;
  snapshot: BridgeWidgetSnapshot | null;
  /** A pick sent from the popup that the main window has not confirmed yet. */
  pendingLanguage: { language: string; at: number } | null;
};

export type BridgeWidgetRelayEvent = { roomId: string } & (
  | { type: "snapshot-received"; snapshot: BridgeWidgetSnapshot }
  | { type: "no-answer" }
  | { type: "host-gone" }
  | { type: "incompatible" }
  | { type: "language-picked"; language: string; at: number }
  | { type: "pick-expired"; pickedAt: number }
);

export function initialBridgeWidgetRelayView(roomId: string): BridgeWidgetRelayView {
  return { roomId, status: "waiting", snapshot: null, pendingLanguage: null };
}

function confirms(snapshot: BridgeWidgetSnapshot, language: string): boolean {
  return snapshot.speakLanguage === language && snapshot.listenLanguage === language;
}

/** The popup's view of the main window. Pure, so the whole protocol can be tested without React. */
export function reduceBridgeWidgetRelayView(
  current: BridgeWidgetRelayView,
  event: BridgeWidgetRelayEvent,
): BridgeWidgetRelayView {
  const state = current.roomId === event.roomId ? current : initialBridgeWidgetRelayView(event.roomId);

  switch (event.type) {
    case "snapshot-received": {
      // Older than what we hold: out of order (two hosts, or a reply crossing a change). The
      // newer one already said more.
      if (state.snapshot && event.snapshot.at < state.snapshot.at) {
        return state.status === "connected" ? state : { ...state, status: "connected" };
      }
      const pending =
        state.pendingLanguage && confirms(event.snapshot, state.pendingLanguage.language)
          ? null
          : state.pendingLanguage;
      return { ...state, status: "connected", snapshot: event.snapshot, pendingLanguage: pending };
    }
    case "no-answer":
      // Only the first question times out. A main window that has answered once and then gone
      // quiet has nothing new to say; one that left says so with host-gone.
      return state.status === "waiting" ? { ...state, status: "no-host" } : state;
    case "host-gone":
      return { ...state, status: "no-host", snapshot: null, pendingLanguage: null };
    case "incompatible":
      // A compatible main window that already answered wins over a stale one also listening.
      return state.status === "connected" ? state : { ...state, status: "incompatible" };
    case "language-picked": {
      const language = normalizeLanguageCode(event.language);
      if (!language) return state;
      // Already what the main window holds: nothing to wait for.
      if (state.snapshot && confirms(state.snapshot, language)) {
        return state.pendingLanguage ? { ...state, pendingLanguage: null } : state;
      }
      return { ...state, pendingLanguage: { language, at: event.at } };
    }
    case "pick-expired":
      return state.pendingLanguage?.at === event.pickedAt ? { ...state, pendingLanguage: null } : state;
    default:
      return state;
  }
}

/** Whether a pick made now would reach a main window. */
export function canRelayLanguagePick(view: BridgeWidgetRelayView): boolean {
  return view.status === "connected";
}

/**
 * The language the pill shows — ONE language, as the native picker shows it.
 *
 * A pending pick first (the user just chose it), then the main window's pair folded the way
 * `describeLanguageChoice` folds it for the native pill (speak stands for both), then the
 * caller's fallback (the widget context's reader language). "" means unset.
 */
export function bridgeWidgetShownLanguage(
  view: BridgeWidgetRelayView,
  fallback: string | null,
): string {
  if (view.pendingLanguage) return view.pendingLanguage.language;
  if (view.snapshot) {
    const choice = describeLanguageChoice(view.snapshot.speakLanguage, view.snapshot.listenLanguage);
    return choice.speak || choice.hear;
  }
  return normalizeLanguageCode(fallback ?? "");
}

/**
 * What the popup's transcript should be read in: the language this user HEARS, which is the
 * listen half — not the pill's face, which is the speak half when the pair is split.
 */
export function bridgeWidgetReaderLanguage(view: BridgeWidgetRelayView): string | null {
  if (view.pendingLanguage) return view.pendingLanguage.language;
  return view.snapshot?.listenLanguage ?? null;
}

// ── transport ────────────────────────────────────────────────────────────────

export type BridgeWidgetRelay = {
  /** False where there is no BroadcastChannel; every method is then a harmless no-op. */
  available: boolean;
  send: (body: BridgeWidgetMessageBody) => void;
  /**
   * Valid messages from the OTHER windows on this room's channel (a BroadcastChannel never
   * delivers a message to the instance that sent it). `onRejected` hears the rest, with why.
   */
  subscribe: (
    listener: (message: BridgeWidgetMessage) => void,
    onRejected?: (reason: BridgeWidgetMessageRejection) => void,
  ) => () => void;
  close: () => void;
};

type ChannelLike = {
  postMessage: (message: unknown) => void;
  addEventListener: (type: "message", listener: (event: { data: unknown }) => void) => void;
  removeEventListener: (type: "message", listener: (event: { data: unknown }) => void) => void;
  close: () => void;
};

const UNAVAILABLE_RELAY: BridgeWidgetRelay = {
  available: false,
  send: () => {},
  subscribe: () => () => {},
  close: () => {},
};

/**
 * Open `roomId`'s relay channel.
 *
 * Guarded for environments without BroadcastChannel (server render, an old embedded browser):
 * the result is inert rather than throwing, and the popup's timeout turns the silence into
 * "no main window", which is the honest reading.
 */
export function openBridgeWidgetRelay(roomId: string): BridgeWidgetRelay {
  const Channel = (globalThis as { BroadcastChannel?: new (name: string) => ChannelLike })
    .BroadcastChannel;
  if (!roomId || typeof Channel !== "function") return UNAVAILABLE_RELAY;

  let channel: ChannelLike;
  try {
    channel = new Channel(bridgeWidgetRelayChannelName(roomId));
  } catch {
    return UNAVAILABLE_RELAY;
  }

  let closed = false;
  const listeners = new Set<(event: { data: unknown }) => void>();

  return {
    available: true,
    send(body) {
      if (closed) return;
      try {
        channel.postMessage({ ...body, v: BRIDGE_WIDGET_RELAY_VERSION, roomId });
      } catch {
        // A closed or torn-down channel (the window is unloading). Nothing is waiting on it.
      }
    },
    subscribe(listener, onRejected) {
      if (closed) return () => {};
      const handle = (event: { data: unknown }) => {
        const result = parseBridgeWidgetMessage(event.data, roomId);
        if (result.ok) listener(result.message);
        else onRejected?.(result.reason);
      };
      listeners.add(handle);
      channel.addEventListener("message", handle);
      return () => {
        listeners.delete(handle);
        channel.removeEventListener("message", handle);
      };
    },
    close() {
      if (closed) return;
      closed = true;
      for (const handle of listeners) channel.removeEventListener("message", handle);
      listeners.clear();
      channel.close();
    },
  };
}
