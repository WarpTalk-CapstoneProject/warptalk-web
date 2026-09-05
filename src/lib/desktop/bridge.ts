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
  openTranscriptWindow?: (roomId: string) => Promise<void>;
  closeTranscriptWindow?: () => Promise<void>;
  listWindowsLoopbackSources?: () => Promise<WindowsLoopbackSource[]>;
  onWindowsLoopbackPcmChunk?: (callback: (chunk: WindowsLoopbackPcmChunk) => void) => () => void;
  startAudioCapture?: (request?: WindowsLoopbackCaptureRequest) => Promise<WindowsLoopbackStartResult>;
  stopAudioCapture?: () => Promise<void>;
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
export async function openTranscriptWindow(roomId: string): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.openTranscriptWindow) return false;
  try {
    await bridge.openTranscriptWindow(roomId);
    return true;
  } catch {
    return false;
  }
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
