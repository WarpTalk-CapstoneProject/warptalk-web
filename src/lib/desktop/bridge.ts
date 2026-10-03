/**
 * The desktop app's preload bridge, as seen from the web app.
 *
 * WarpTalk Desktop is an Electron shell that loads this deployed web app and exposes a handful of
 * native capabilities on `window.warptalk` (see warptalk-desktop/src/preload/index.ts). The same
 * bundle also runs in an ordinary browser, where none of it exists — so every access has to go
 * through a check, and this module is the one place that check lives.
 *
 * Before this file, one page declared its own inline `{ warptalk?: { openExternal? } }` shape to
 * reach a single method. That works, but it makes each caller re-describe the contract, and a
 * shape written from memory at each call site is how a bridge silently drifts from the app that
 * implements it. The types below mirror warptalk-desktop/src/shared/types.ts.
 */

/** Which side of the bridge a virtual device carries when that leg uses a virtual device. */
export type BridgeLeg = "outbound" | "inbound";

export interface VirtualAudioDevice {
  leg: BridgeLeg;
  driverBundle: string;
  /** What the device is called in Google Meet's picker — the string the user has to hunt for. */
  deviceName: string;
  installed: boolean;
  providerId?: string;
  providerName?: string;
  providerRole?: "primary" | "backup";
}

export interface VirtualAudioStatus {
  platform: string;
  /**
   * False where the desktop app has no detection for this platform. Distinct from `ready: false`:
   * one means "we cannot tell", the other means "we looked and they are not there".
   */
  supported: boolean;
  devices: VirtualAudioDevice[];
  ready: boolean;
  bridgeMode?: "full" | "outbound-only" | "installed-not-running" | "caption-only";
  recommendedProviderId?: string;
  capabilities?: {
    fullBridge: boolean;
    outboundOnly: boolean;
    captionOnly: boolean;
    processLoopback: boolean;
    processLoopbackRuntime?: "available" | "not-wired";
    minWindowsProcessLoopbackBuild?: number;
  };
  riskControls?: VirtualAudioRiskControl[];
  foreignDrivers: string[];
  /**
   * What each side of VB-Audio Hi-Fi Cable is set to in Windows Sound settings.
   *
   * Hi-Fi Cable passes NO audio at all when "Hi-Fi Cable Input" (the playback side Meet renders
   * into) and "Hi-Fi Cable Output" (the recording side WarpTalk reads) differ in sample rate or bit
   * depth — the tone test then fails with nothing to say why. Optional because desktop builds
   * older than this field never send it; a side is null when the device is not installed or its
   * format could not be read.
   */
  hifiFormat?: HiFiCableFormats;
  /** The desktop app's own verdict on `hifiFormat`. Absent on older builds; see hifi-format.ts. */
  hifiFormatMismatch?: boolean;
  /**
   * Which bridge modes this machine can run now (desktop #45). Absent on desktop builds that
   * predate text-only mode, which means only voice mode exists. `bridgeMode` above keeps
   * describing voice mode. See lib/meeting/bridge-audio-mode.
   */
  bridgeModes?: BridgeModeAvailability;
  /**
   * The endpoint labels to match in `enumerateDevices` for each leg, for the provider pair the
   * desktop detected (desktop `feat/bridge-desktop-verdicts`). Absent on older builds and where
   * `supported` is false; see lib/desktop/bridge-verdict for what replaces it then.
   */
  endpointLabels?: BridgeEndpointLabels;
}

/**
 * Mirrors warptalk-desktop src/shared/types.ts `BridgeEndpointLabels`. Each label is matched
 * case-insensitively as a substring of a device label; the desktop keeps them substring-safe.
 */
export interface BridgeEndpointLabels {
  outboundProviderId: string;
  /** Render endpoint WarpTalk plays the dub into (`audiooutput`). */
  outboundSink: string;
  /** Capture endpoint the user selects as Meet's microphone (`audioinput`). */
  meetMicrophone: string;
  inboundProviderId: string | null;
  /** Capture endpoint WarpTalk records the far side from (`audioinput`). */
  inboundCapture: string | null;
  /** Render endpoint Meet's speaker is pointed at when the far side comes back on the device. */
  meetSpeaker: string | null;
  /** The bridge still runs without the inbound device (Windows: loopback or outbound-only). */
  inboundOptional: boolean;
}

/** Mirrors warptalk-desktop src/shared/types.ts `BridgeModeAvailability`. */
export interface BridgeModeAvailability {
  textOnly: {
    /** Loopback works with no cable: Meet keeps the real mic and speakers. */
    possible: boolean;
    reason?: "unsupported-platform" | "process-loopback-unsupported" | "loopback-runtime-not-wired";
  };
  voice: {
    /** VB-CABLE is installed and the far side can come back. */
    possible: boolean;
    cableInstalled: boolean;
    inbound?: "hifi-cable" | "process-loopback" | "virtual-device";
    reason?: "unsupported-platform" | "cable-missing" | "inbound-unavailable";
  };
}

/**
 * Which capture endpoint the meeting BROWSER records from, read from Windows Core Audio sessions
 * (desktop #45). Per browser, not per tab.
 *   cable      only "CABLE Output (VB-Audio Virtual Cable)"
 *   real       only physical microphones
 *   ambiguous  the cable AND another endpoint
 *   unknown    nothing recording (Meet muted, not capturing), or the probe failed
 */
export interface MeetMicState {
  state: "cable" | "real" | "unknown" | "ambiguous";
  browserPid?: number;
  endpoint?: string;
  endpoints?: string[];
  reason?: "no-active-session" | "other-virtual-device" | "probe-failed" | "unsupported-platform";
  at: number;
}

/**
 * Mirrors warptalk-desktop src/shared/types.ts `MeetCallState` (`bridge:meet-call-state`): whether
 * the user is IN the Google Meet call, read from Meet's own buttons by UI Automation.
 *
 *   lobby    the "Join now" screen: not joined yet.
 *   in-call  in the call, in the main tab (`via:"tab"`) or Chrome's Picture-in-Picture window.
 *   left     the "You left the meeting / Rejoin" page, or the Meet tab closed after being in call.
 *            A page that was never joined can look the same, so a room is ended on it only after
 *            an `in-call` (lib/meeting/bridge-meet-follow).
 *   unknown  nothing readable: Meet is a background tab with no PiP, the read failed, the watch is
 *            off, or the platform has no sensor (macOS). It NEVER means the call ended.
 *
 * `reason` is for logs only; nothing may branch on it.
 */
export interface MeetCallState {
  phase: "lobby" | "in-call" | "left" | "unknown";
  via: "tab" | "pip" | null;
  meetCode: string | null;
  reason: string;
  atMs: number;
  /**
   * The HWND of the browser window hosting the Meet TAB (`via: "tab"` readings only; a PiP reading
   * carries none, so a tab/PiP switch does not change it). A Meet tab dragged into another window
   * changes it, and the recording re-arms its capture on the new one (meetWindowNeedsRearm in
   * lib/meeting/bridge-recording). Absent from older desktop builds, which also sent the PiP
   * window's HWND here on PiP readings — meetWindowNeedsRearm ignores those (`via !== "tab"`).
   */
  windowHandle?: number;
  /**
   * Where the page content sits in that window (`via: "tab"` only), for cropping the browser chrome
   * out of the recording. Absent when unread or implausible, and from older desktop builds.
   */
  windowGeometry?: MeetWindowGeometry;
}

/** Mirrors warptalk-desktop `MeetWindowRect`: physical pixels, relative to the visible frame. */
export interface MeetWindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Mirrors warptalk-desktop `MeetWindowGeometry`. `frame` is the visible window (DWM extended frame
 * bounds, x = y = 0), `window` is GetWindowRect (includes the invisible resize borders), `content`
 * is the page's Document element — the web contents below the tab strip, address and bookmarks bars.
 */
export interface MeetWindowGeometry {
  frame: MeetWindowRect;
  window: MeetWindowRect;
  content: MeetWindowRect;
}

/**
 * Mirrors warptalk-desktop `MeetSelfMic` (`bridge:meet-self-mic`): what Meet's own microphone
 * button says. NOT `MeetMicState` above, which answers which DEVICE the browser records from and
 * cannot see mute. `muted: null` is unknown; `stale: true` means `muted` is the last value read,
 * not a current one, and must not be treated as the user pressing the button.
 */
export interface MeetSelfMic {
  muted: boolean | null;
  stale: boolean;
  via: "class" | "name" | null;
  meetCode: string | null;
  atMs: number;
}

/** One Windows endpoint's shared-mode format, as the desktop app read it from the registry. */
export interface EndpointFormat {
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
}

export interface HiFiCableFormats {
  input: EndpointFormat | null;
  output: EndpointFormat | null;
}

/** `before`/`after` let the caller say what changed rather than only that something did. */
export interface HiFiCableAlignResult {
  ok: boolean;
  before: HiFiCableFormats;
  after: HiFiCableFormats;
  error?: string;
}

export interface VirtualAudioRiskControl {
  id: "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9" | "B1" | "B2" | "X1";
  status: "mitigated" | "guarded" | "implemented" | "known-limitation" | "requires-runtime";
  control: string;
}

export interface VirtualAudioInstallResult {
  started: boolean;
  reason?: string;
}

export interface WindowsLoopbackSource {
  id: string;
  name: string;
  windowHandle?: number;
  ownerProcessId?: number;
  likelyMeetingWindow: boolean;
}

export interface WindowsLoopbackCaptureRequest {
  sourceId?: string;
  targetProcessId?: number;
  /** The user agreed to WarpTalk listening to the whole browser. See WINDOWS_CAPTURE_CONSENT. */
  consentGranted?: boolean;
  /** Must be true. `false` is the OS's EXCLUDE mode, which captures everything BUT the target. */
  includeTargetProcessTree?: boolean;
  /**
   * Desktop #45. "text-only": Meet uses the real mic and speakers and nothing is dubbed, so the
   * desktop skips its VB-CABLE gate (B2) — every other gate still holds. Absent or "voice": the old
   * contract, which needs the cable. An older desktop ignores the field and keeps requiring it.
   */
  mode?: "voice" | "text-only";
  /**
   * Desktop capture-target: "meet-sighting" makes the desktop aim the capture at the browser process
   * behind its own Google Meet sighting (read from the browser's URL, not a page-written title) and
   * ignore `sourceId`/`targetProcessId`. Refused with R8 `meet-sighting-missing` /
   * `meet-sighting-no-process` when it cannot; an older desktop ignores the field and refuses with
   * R8 `target-process-required`. Either way the caller falls back to the picked window.
   */
  target?: "meet-sighting";
  /** With `target: "meet-sighting"` only: the desktop stops the capture once Meet has been gone a while. */
  stopWhenMeetGone?: boolean;
}

/** `audio:get-capture-state` (desktop capture-target): what the main process is capturing. */
export interface DesktopCaptureState {
  capturing: boolean;
  mode: "voice" | "text-only" | null;
  targetProcessId: number | null;
  startedVia: "meet-sighting" | "source" | "process-id" | null;
}

/** `audio:capture-stopped`: the desktop stopped a capture on its own. */
export interface DesktopCaptureStopped {
  reason: string;
}

/**
 * Why a refusal carries a `riskId`.
 *
 * The desktop side gates the start behind the risk register rather than a single boolean, so a
 * refusal can say which control stopped it — R5 for missing consent, R8 for an unresolved window,
 * R2 for a capture path that is not wired. A caller that only sees "false" can only apologise.
 */
export type WindowsLoopbackStartResult =
  | { started: true }
  | { started: false; riskId: string; reason: string };

export interface WindowsLoopbackPcmChunk {
  data: Uint8Array;
  format: "s16le";
  sampleRate: 48000;
  channelCount: 2;
  capturedAtMs: number;
}

/**
 * Only the methods this app actually calls.
 *
 * Deliberately narrower than the desktop's own `WarpTalkAPI`: an older installed build will not
 * have methods added to the desktop repo later, so anything listed here has to be something the
 * web app is prepared to find missing at runtime — hence the per-method guards in the helpers
 * below rather than one "is desktop" boolean that vouches for the whole surface.
 */
/**
 * WT-910. What the desktop answers when asked to arm a capture of the Google Meet window for this
 * room's recording. Mirrors warptalk-desktop's preload exactly.
 *
 * After `ok: true`, the NEXT `navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })`
 * from the main window within 10 seconds resolves to the Meet window with no picker. Any
 * `ok: false` means no window video; the recording still runs, audio-only.
 */
export type ArmMeetWindowCaptureResult =
  | {
      ok: true;
      sourceName: string;
      /** The HWND that will be handed out; compared with `MeetCallState.windowHandle`. Newer desktops only. */
      windowHandle?: number;
    }
  | {
      ok: false;
      reason:
        | "meet-sighting-missing"
        | "meet-window-not-found"
        /** B18: Meet is in Chrome's Picture-in-Picture window, which is never recorded. Desktop #51. */
        | "meet-not-on-tab"
        | "unsupported-platform"
        | "not-main-window"
        | "consent-required";
    };

export interface DesktopBridge {
  getVersion?: () => Promise<string>;
  getPlatform?: () => string;
  openExternal?: (url: string) => Promise<void>;
  getVirtualAudioStatus?: () => Promise<VirtualAudioStatus>;
  installVirtualAudio?: () => Promise<VirtualAudioInstallResult>;
  /** Sets both sides of Hi-Fi Cable to one format. Newer desktop builds only. */
  alignHiFiCableFormat?: () => Promise<HiFiCableAlignResult>;
  openTranscriptWindow?: (roomId: string | null) => Promise<void>;
  activateRoom?: (roomId: string) => Promise<void>;
  onRoomActivated?: (callback: (roomId: string) => void) => () => void;
  closeTranscriptWindow?: () => Promise<void>;
  /** The user closed the popup. `roomId` is what it showed; null for the offer. */
  onTranscriptWindowClosed?: (callback: (roomId: string | null) => void) => () => void;
  /** The desktop app reopened the popup itself, from the tray or a notification. */
  onTranscriptWindowReopened?: (callback: (roomId: string | null) => void) => () => void;
  listWindowsLoopbackSources?: () => Promise<WindowsLoopbackSource[]>;
  onWindowsLoopbackPcmChunk?: (callback: (chunk: WindowsLoopbackPcmChunk) => void) => () => void;
  startAudioCapture?: (request?: WindowsLoopbackCaptureRequest) => Promise<WindowsLoopbackStartResult>;
  stopAudioCapture?: () => Promise<void>;
  /**
   * Desktop capture-target. Its presence is also the capability check for `target: "meet-sighting"`
   * and `stopWhenMeetGone`: a build that has these has all of them.
   */
  getCaptureState?: () => Promise<DesktopCaptureState>;
  onAudioCaptureStopped?: (callback: (event: DesktopCaptureStopped) => void) => () => void;
  watchMeetPresence?: () => Promise<void>;
  unwatchMeetPresence?: () => Promise<void>;
  onMeetPresence?: (callback: (presence: MeetPresence) => void) => () => void;
  /**
   * Bring the main window to the front (IPC `bridge:show-main-window`). Desktop PR #43; an older
   * build simply does not have it, and the window stays where it is.
   */
  showMainWindow?: () => Promise<void>;
  /**
   * Tell the shell whether this window is signed in (IPC `auth:signed-in-state`). Desktop PR #43;
   * fire-and-forget on the desktop side.
   */
  reportSignedIn?: (signedIn: boolean) => void;
  /**
   * Desktop #45: start (true) or stop (false) the read of which microphone the Meet browser records
   * from; answers arrive on `onMeetMicState`. `browserPid` defaults to the browser the loopback
   * capture targets. Read-only. Absent on older builds.
   */
  setMeetMicStream?: (enabled: boolean, options?: { browserPid?: number }) => Promise<void>;
  onMeetMicState?: (callback: (state: MeetMicState) => void) => () => void;
  /**
   * In the Meet call or not, and Meet's own mute button (desktop meet-call-state.ts, Windows only).
   * Both events run while the desktop watches Meet presence and fire only on change, so a late
   * subscriber reads the getters once. Sent to the main window and the popup. Absent on older
   * builds; on macOS the phase is always "unknown".
   */
  onMeetCallState?: (callback: (state: MeetCallState) => void) => () => void;
  getMeetCallState?: () => Promise<MeetCallState>;
  onMeetSelfMic?: (callback: (mic: MeetSelfMic) => void) => () => void;
  getMeetSelfMic?: () => Promise<MeetSelfMic>;
  /**
   * Desktop #44: speaker names from Google Meet's own captions, for the meeting being bridged
   * (Windows only, behind the desktop's `bridgeMeetCaptionNames` flag). `setMeetCaptionsStream`
   * starts/stops the read; only a call from the MAIN window subscribes it, and events go to the
   * main window only. All four are absent on desktop builds that predate them.
   */
  onMeetCaption?: (callback: (event: MeetCaptionEvent) => void) => () => void;
  onMeetCaptionStatus?: (callback: (status: MeetCaptionStatus) => void) => () => void;
  setMeetCaptionsStream?: (meetCode: string, enabled: boolean) => Promise<void>;
  /** Turns Meet's CC on in the capturer's Chrome window if it is off (never off). */
  ensureMeetCaptions?: (meetCode: string) => Promise<EnsureMeetCaptionsResult>;
  /** WT-910: see ArmMeetWindowCaptureResult. Absent on desktop builds that predate it. */
  armMeetWindowCapture?: (roomId: string) => Promise<ArmMeetWindowCaptureResult>;
}

/**
 * Mirrors warptalk-desktop src/shared/types.ts `MeetCaptionEvent` (desktop #44).
 *
 * One caption block from Google Meet's CC, final enough to attribute a speaker. A speaker-name
 * ANCHOR for attribution, not a transcript: WarpTalk's own STT writes the text.
 *
 * Times are ms on the Date.now() axis (monotonic within a session): `tStartMs` when the block
 * first appeared, `tEndMs` when its final text was first seen, `tStableMs` when it was judged
 * final. `tConfidence:"batch"` means the text arrived in a burst, so its times are not when it was
 * said. `stale` is true when the sensor was not `live` at emission.
 */
export interface MeetCaptionEvent {
  meetCode: string;
  /** Stable for the block's life; an `update` replaces the earlier text of the same id. */
  blockId: string;
  kind: "caption" | "update";
  speaker: string;
  text: string;
  tStartMs: number;
  tEndMs: number;
  tStableMs: number;
  tConfidence: "live" | "batch";
  stale: boolean;
  source: "meet_caption";
  /**
   * `alignedNow()` in main at the moment main sent this event to the renderer (a replay from the
   * 30 s buffer is stamped when it is replayed, not when it was read). The renderer converts the
   * times above to its own clock with `t + (Date.now() - sentAtMs)`: main's axis is anchored to
   * Date.now() once at load, so a wall-clock jump since then (NTP, sleep/resume) would otherwise
   * shift every time. IPC latency (~1 ms) is the residual error. Absent from older desktops.
   */
  sentAtMs?: number;
}

/** Mirrors warptalk-desktop src/shared/types.ts `MeetCaptionStatus` (desktop #44). */
export interface MeetCaptionStatus {
  meetCode: string;
  running: boolean;
  state: "live" | "unavailable_tab_inactive" | "unavailable_minimized" | "stale";
  captionsVisible: boolean;
  lastChangeMs: number | null;
  error?: string;
}

/** Mirrors warptalk-desktop src/shared/types.ts `EnsureMeetCaptionsResult` (desktop #44). */
export interface EnsureMeetCaptionsResult {
  ok: boolean;
  state: "on" | "off" | "unknown";
  /**
   * Why not, e.g. "cc-button-hidden" (narrow window: CC is inside More options), "unknown-locale",
   * "meet-tab-not-found", "verify-button-not-flipped", "disabled", "unsupported-platform".
   */
  reason?: string;
}

/**
 * One observation of whether a Google Meet call is on screen, as the desktop app saw it.
 *
 * Mirrors the desktop repo's own type rather than importing it, for the same reason the rest of
 * this file does: the two repos ship separately, and a build older than this field simply never
 * sends one.
 */
export interface MeetPresence {
  meetWindowVisible: boolean;
  /** Present only when the window title carried a room code. A named meeting has none. */
  meetCode?: string;
  observedAtMs: number;
}

/**
 * The bridge, or null when this is a normal browser tab.
 *
 * Also null during server rendering, which matters: every caller is therefore forced to treat
 * "no bridge" as a real state rather than assuming the desktop case, and a component that renders
 * desktop-only chrome will render nothing on the server instead of hydrating into a mismatch.
 */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { warptalk?: DesktopBridge }).warptalk;
  return candidate ?? null;
}

/** Whether this page is running inside the desktop shell at all. */
export function isDesktopApp(): boolean {
  return getDesktopBridge() !== null;
}

/**
 * Open a URL in the user's real browser.
 *
 * Returns false when there was no bridge to take it, so the caller can fall back to normal
 * navigation rather than leaving a dead link. Inside Electron a plain anchor would either
 * navigate the app window away from the app or be blocked outright.
 */
export async function openInSystemBrowser(url: string): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.openExternal) return false;
  await bridge.openExternal(url);
  return true;
}

/**
 * Kept as a name, not as a second implementation.
 *
 * Two functions arrived here from either side of a merge with the same body: this one and
 * `openTranscriptWindow` below, which differs only by accepting null for the offer window that has
 * no room yet. A wider signature subsumes a narrower one, so there is one implementation and this
 * delegates to it — its callers and its tests keep the name they already use.
 */
export async function openDesktopTranscriptWindow(roomId: string): Promise<boolean> {
  return openTranscriptWindow(roomId);
}

/**
 * Ask the desktop app about the virtual audio devices an external-bridge meeting needs.
 *
 * Null means "no answer available" — a browser, or a desktop build old enough to predate the
 * check. It deliberately does NOT mean "not installed": reporting a confident "missing" from the
 * absence of the method would tell a user to install something they may already have.
 */
export async function readVirtualAudioStatus(): Promise<VirtualAudioStatus | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.getVirtualAudioStatus) return null;
  try {
    return await bridge.getVirtualAudioStatus();
  } catch {
    return null;
  }
}

/**
 * Ask the desktop app to walk the user through installing the devices.
 *
 * The desktop side shows the explanation and either copies the Homebrew command or opens the
 * vendor's download page; it never runs a privileged install itself. So `started: true` means the
 * user was handed the next step, NOT that anything is installed — which is why the caller has to
 * re-read the status afterwards rather than assuming success.
 */
export async function requestVirtualAudioInstall(): Promise<VirtualAudioInstallResult | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.installVirtualAudio) return null;
  try {
    return await bridge.installVirtualAudio();
  } catch {
    return null;
  }
}

/**
 * Show the small always-on-top transcript window over the user's meeting app.
 *
 * This is the whole of the caption-only rung of the fallback ladder, which is why it gets a helper
 * rather than an inline `window.warptalk?.` reach: on a machine with no virtual audio device it is
 * the only thing WarpTalk can offer, and a silent no-op there would be indistinguishable from the
 * state this ladder was built to remove.
 *
 * Returns false when there was no bridge to take it — a browser tab, or a desktop build older than
 * the window — so the caller can say so instead of leaving a button that appears to do nothing.
 */
export async function openTranscriptWindow(roomId: string | null): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.openTranscriptWindow) return false;
  try {
    await bridge.openTranscriptWindow(roomId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Is there a popup this machine can put in front of the host?
 *
 * Asked before a question is routed to the floating window rather than shown where the caller
 * stands: the bridge consent prompt belongs in the popup, but only on a machine that has one, and
 * a prompt sent to a window that cannot open is a question asked of nobody.
 *
 * The per-method guard, not `isDesktopApp()`, because an installed desktop build can lag the web
 * app it loads - the shell may be present while this particular method is not.
 */
export function canOpenTranscriptWindow(): boolean {
  return typeof getDesktopBridge()?.openTranscriptWindow === "function";
}

/**
 * Subscribes to "is a Google Meet window on screen", and starts the desktop app looking.
 *
 * Arming is the caller's job to undo: the watcher enumerates every window on the machine on a
 * timer, so leaving it armed after the meeting is over spends the user's battery on a question
 * nobody is asking. The returned function disarms and unsubscribes together, which is what makes
 * it safe to hand straight to an effect cleanup.
 *
 * Returns null on a browser tab or a desktop build without the sensor. Callers fall back to the
 * schedule-only trigger there, which needs no window knowledge at all.
 */
export function watchMeetPresence(
  onPresence: (presence: MeetPresence) => void,
): (() => void) | null {
  const bridge = getDesktopBridge();
  if (!bridge?.watchMeetPresence || !bridge.onMeetPresence) return null;

  const unsubscribe = bridge.onMeetPresence(onPresence);
  void bridge.watchMeetPresence().catch(() => undefined);

  return () => {
    unsubscribe();
    void bridge.unwatchMeetPresence?.().catch(() => undefined);
  };
}

/**
 * Flow 2: tells the main window to make this room the active meeting.
 *
 * The offer window can create a room but cannot start translating in it - the pipeline lives in
 * the main window's meeting session, keyed off a store in sessionStorage, which is per-window. So
 * the popup asks main to pass the message on rather than writing state the other window will never
 * read.
 */
export async function activateBridgeRoom(roomId: string): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.activateRoom) return false;
  try {
    await bridge.activateRoom(roomId);
    return true;
  } catch {
    return false;
  }
}

/** The other end of activateBridgeRoom, for the main window. Null off the desktop shell. */
export function onBridgeRoomActivated(
  callback: (roomId: string) => void,
): (() => void) | null {
  const bridge = getDesktopBridge();
  if (!bridge?.onRoomActivated) return null;
  return bridge.onRoomActivated(callback);
}

/** Closes the transcript window if one is open. Safe to call when there is none. */
export async function closeTranscriptWindow(): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.closeTranscriptWindow) return false;
  try {
    await bridge.closeTranscriptWindow();
    return true;
  } catch {
    return false;
  }
}

/**
 * Told when the user closes the popup themselves.
 *
 * Only a close the user made: one this app asked for through closeTranscriptWindow is already
 * known to the caller and is not echoed back. Null off the desktop shell and on a desktop build
 * older than the event - the per-method guard, not isDesktopApp(), because an installed build can
 * lag the web app it loads.
 */
export function onTranscriptWindowClosed(
  callback: (roomId: string | null) => void,
): (() => void) | null {
  const bridge = getDesktopBridge();
  if (!bridge?.onTranscriptWindowClosed) return null;
  try {
    return bridge.onTranscriptWindowClosed(callback);
  } catch {
    return null;
  }
}

/** Told when the desktop app brings the popup back on its own - the tray item, a notification. */
export function onTranscriptWindowReopened(
  callback: (roomId: string | null) => void,
): (() => void) | null {
  const bridge = getDesktopBridge();
  if (!bridge?.onTranscriptWindowReopened) return null;
  try {
    return bridge.onTranscriptWindowReopened(callback);
  } catch {
    return null;
  }
}

export async function listWindowsLoopbackSources(): Promise<WindowsLoopbackSource[] | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.listWindowsLoopbackSources) return null;
  try {
    return await bridge.listWindowsLoopbackSources();
  } catch {
    return null;
  }
}

export function onWindowsLoopbackPcmChunk(
  callback: (chunk: WindowsLoopbackPcmChunk) => void,
): (() => void) | null {
  const bridge = getDesktopBridge();
  if (!bridge?.onWindowsLoopbackPcmChunk) return null;
  try {
    return bridge.onWindowsLoopbackPcmChunk(callback);
  } catch {
    return null;
  }
}

/**
 * Text-only bridge mode: subscribe to which microphone the Meet browser records from (desktop #45).
 *
 * Arming and disarming go together, like `watchMeetPresence`: the desktop polls Core Audio only while
 * some window is subscribed, so the returned function stops it for this window and unsubscribes.
 * Null off the desktop shell and on a build without the detector — the caller then shows nothing.
 */
export function watchMeetMicState(
  onState: (state: MeetMicState) => void,
): (() => void) | null {
  const bridge = getDesktopBridge();
  if (!bridge?.setMeetMicStream || !bridge.onMeetMicState) return null;
  let unsubscribe: () => void;
  try {
    unsubscribe = bridge.onMeetMicState(onState);
  } catch {
    return null;
  }
  void bridge.setMeetMicStream(true).catch(() => undefined);
  return () => {
    unsubscribe();
    void bridge.setMeetMicStream?.(false).catch(() => undefined);
  };
}

/**
 * Whether this desktop build can say where the Meet call is (`onMeetCallState`, WT-911). False off
 * the desktop shell and on older builds. WT-910 B18 keeps the pre-B18 recording rule without it.
 */
export function hasMeetCallSensor(): boolean {
  const bridge = getDesktopBridge();
  return typeof bridge?.onMeetCallState === "function";
}

/**
 * Follow the Meet call itself: in the call or not, and Meet's mute button (WT-912 / WT-913).
 *
 * Nothing to arm: the desktop reads both for as long as it watches Meet presence, which the app
 * shell does for the whole session (use-bridge-trigger). The events fire only on change, so the
 * current values are read once on subscribe; a getter that answers after a newer event is dropped.
 * Null off the desktop shell and on a build without the sensor: the caller then knows it will
 * never be told, which is different from being told "unknown".
 */
export function watchMeetCall(handlers: {
  onCallState: (state: MeetCallState) => void;
  onSelfMic: (mic: MeetSelfMic) => void;
}): (() => void) | null {
  const bridge = getDesktopBridge();
  if (!bridge?.onMeetCallState || !bridge.onMeetSelfMic) return null;
  let stopped = false;
  let callAtMs = Number.NEGATIVE_INFINITY;
  let micAtMs = Number.NEGATIVE_INFINITY;
  const onCall = (state: MeetCallState) => {
    if (stopped || !state || state.atMs < callAtMs) return;
    callAtMs = state.atMs;
    handlers.onCallState(state);
  };
  const onMic = (mic: MeetSelfMic) => {
    if (stopped || !mic || mic.atMs < micAtMs) return;
    micAtMs = mic.atMs;
    handlers.onSelfMic(mic);
  };
  let stopCall: () => void;
  let stopMic: () => void;
  try {
    stopCall = bridge.onMeetCallState(onCall);
  } catch {
    return null;
  }
  try {
    stopMic = bridge.onMeetSelfMic(onMic);
  } catch {
    stopCall();
    return null;
  }
  void bridge.getMeetCallState?.().then(onCall).catch(() => undefined);
  void bridge.getMeetSelfMic?.().then(onMic).catch(() => undefined);
  return () => {
    stopped = true;
    stopCall();
    stopMic();
  };
}

/**
 * W4a: bring the desktop main window to the front — the room's record after a bridge meeting
 * ended, the device wizard asked for from the popup. Returns false off the desktop shell and on a
 * build older than the method (desktop PR #43), where the window simply stays where it is.
 */
export async function showDesktopMainWindow(): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.showMainWindow) return false;
  try {
    await bridge.showMainWindow();
    return true;
  } catch {
    return false;
  }
}

/**
 * W4a: tell the desktop shell whether this window is signed in (desktop PR #43). A no-op in a
 * browser and on an older desktop build. Never throws: it is called from an auth subscription,
 * and a broken IPC must not break signing in or out.
 */
export function reportDesktopSignedIn(signedIn: boolean): void {
  const bridge = getDesktopBridge();
  if (!bridge?.reportSignedIn) return;
  try {
    bridge.reportSignedIn(signedIn);
  } catch {
    // Nothing to do: the shell keeps whatever it last knew.
  }
}

/**
 * Whether the desktop can aim loopback capture at its own Meet sighting and stop it when Meet is
 * gone. A per-method check, like every helper here: an installed build can lag the web app.
 */
export function supportsMeetSightingCapture(bridge: DesktopBridge | null = getDesktopBridge()): boolean {
  return typeof bridge?.getCaptureState === "function" && typeof bridge.onAudioCaptureStopped === "function";
}

/**
 * Turn Meet's CC on for the bridged meeting (desktop #44). Null off the desktop shell and on a
 * build without the method; never throws — a CC that stays off only costs the speaker names.
 */
export async function ensureMeetCaptionsOn(meetCode: string): Promise<EnsureMeetCaptionsResult | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.ensureMeetCaptions) return null;
  try {
    return await bridge.ensureMeetCaptions(meetCode);
  } catch {
    return null;
  }
}

/**
 * Stream Meet caption blocks for `meetCode` into `onCaption` (desktop #44). MAIN WINDOW ONLY: the
 * desktop subscribes only the main window's renderer and sends events there alone.
 *
 * Subscribes before arming, so the 30 s the desktop buffered while this renderer was away (a
 * reload) lands in the callback. `onStatus` (optional) gets the stream's status the same way:
 * subscribed before arming, so the status the desktop replays on subscribe is not missed; a build
 * without `onMeetCaptionStatus` simply never calls it. The returned function stops the read for
 * this meeting and then
 * unsubscribes — in that order, because the stop's final flush still reaches a subscribed
 * renderer. The promise settles once both are done (never rejects). Null off the desktop shell and
 * on a build without both methods.
 */
export function streamMeetCaptions(
  meetCode: string,
  onCaption: (event: MeetCaptionEvent) => void,
  onStatus?: (status: MeetCaptionStatus) => void,
): (() => Promise<void>) | null {
  const bridge = getDesktopBridge();
  if (!bridge?.setMeetCaptionsStream || !bridge.onMeetCaption) return null;
  let unsubscribeCaption: () => void;
  try {
    unsubscribeCaption = bridge.onMeetCaption(onCaption);
  } catch {
    return null;
  }
  let unsubscribeStatus: (() => void) | null = null;
  if (onStatus && bridge.onMeetCaptionStatus) {
    try {
      unsubscribeStatus = bridge.onMeetCaptionStatus(onStatus);
    } catch {
      unsubscribeStatus = null; // Names still flow; only the CC-off notice is lost.
    }
  }
  const unsubscribe = () => {
    try {
      unsubscribeStatus?.();
    } finally {
      unsubscribeCaption();
    }
  };
  void bridge.setMeetCaptionsStream(meetCode, true).catch(() => undefined);
  return () => {
    const stopped = bridge.setMeetCaptionsStream?.(meetCode, false) ?? Promise.resolve();
    return Promise.resolve(stopped)
      .catch(() => undefined)
      .finally(() => {
        try {
          unsubscribe();
        } catch {
          // Nothing to do: the listener goes with the renderer.
        }
      });
  };
}

/**
 * WT-910. Asks the desktop to hand the Google Meet window to the next getDisplayMedia call, so a
 * bridge recording can carry the call's picture (lib/meeting/bridge-recording).
 *
 * Returns null where there is nothing to ask — a browser tab, or a desktop build older than the
 * method — and where the call itself threw. Null and every `ok: false` mean the same thing to the
 * caller: record without the window, and say why in the log.
 */
export async function armMeetWindowCapture(roomId: string): Promise<ArmMeetWindowCaptureResult | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.armMeetWindowCapture) return null;
  try {
    return await bridge.armMeetWindowCapture(roomId);
  } catch {
    return null;
  }
}
