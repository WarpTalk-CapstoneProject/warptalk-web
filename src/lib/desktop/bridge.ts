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
