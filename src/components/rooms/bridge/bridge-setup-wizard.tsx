"use client";

/**
 * Getting a machine ready to translate a meeting that is happening on Google Meet.
 *
 * The user has to do three things outside this page: install two virtual audio devices, point
 * Meet's microphone at one of them, and point Meet's speaker at the other. None of that is
 * something the app can do for them, so the wizard's job is to make each step unmissable, and to
 * be honest about which ones it can actually confirm.
 *
 * Two of the three are checkable — the devices either exist and carry a tone or they do not. The
 * third is not: what Meet has selected lives inside Google's page. The last step therefore asks
 * rather than asserts, and says why, because a green tick that means "we hope so" is worse than
 * no tick at all.
 *
 * CAMERA IS OUT OF SCOPE, AND THAT IS A DECISION — WT-578 / WT-525
 *   WT-525 asked for "device settings (Voice/Camera)". Audio is bridged because it has to be:
 *   WarpTalk SYNTHESISES a new voice, and that voice has no way into Meet except a virtual
 *   microphone Meet is pointed at. Video is not synthesised anywhere in the product — there is no
 *   translated, dubbed or generated picture to carry — so a virtual camera would be a second
 *   driver to install, a second permission to grant and a second thing to break, in order to pass
 *   the user's own webcam through unchanged. Meet already reads that camera directly.
 *
 *   So WarpTalk ships no virtual camera and does not select a camera on the user's behalf. The
 *   wizard says so where the user is looking for it, rather than leaving the absence to be
 *   rediscovered as a missing feature. Revisit only if something ever alters the picture — a
 *   translated slide overlay, a captioned video feed — because that is the first moment a virtual
 *   camera would carry anything the user cannot already get.
 *
 * WHY THE COLOURS ARE TOKENS
 *   This was written against a dark preview page and hardcoded `text-white` throughout. It now
 *   opens inside a meeting, over whichever theme the user chose, so every colour here is a
 *   semantic token; a hardcoded white would render invisible-on-white for half the users.
 */

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getDesktopBridge, readVirtualAudioStatus, type VirtualAudioStatus } from "@/lib/desktop/bridge";
import type { BridgeAudioMode } from "@/lib/meeting/bridge-audio-mode";
import {
  alignHiFiCableFormatViaDesktop,
  describeHiFiFormat,
  hifiFormatMismatch,
  type HiFiAlignOutcome,
} from "@/lib/desktop/hifi-format";
import { decideBridgeInbound, finalBridgeInboundPath } from "@/lib/desktop/bridge-tiers";
import { bridgeDevicesReadyWithProbe } from "@/lib/desktop/bridge-verdict";
import {
  MEET_SPEAKER_RESET_NOTICE,
  shouldShowMeetSpeakerResetNotice,
} from "@/lib/audio/bridge-far-side-monitor";
import {
  bridgeDeviceLabelsFor,
  bridgeDeviceLabelsFromStatus,
  checkVirtualBridge,
  findBridgeDeviceIds,
  WINDOWS_CABLES_DOWNLOAD_PAGE,
  type BridgeCheckResult,
  type BridgeDeviceLabels,
  type DeviceProbe,
} from "@/lib/audio/virtual-bridge-check";

const BREW_COMMAND = "brew install --cask blackhole-2ch blackhole-16ch";
const DOWNLOAD_PAGE = "https://existential.audio/blackhole/";

type StepState = "todo" | "active" | "done";

/**
 * How long the check waits for the desktop's status before probing with the fallback labels. The
 * desktop's device read is a PowerShell spawn of up to ~2.5 s; a status read that hangs must not
 * keep the tone test from reporting.
 */
const STATUS_WAIT_MS = 3500;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * The by-hand version of "Fix audio format", for a desktop build that cannot do it or a fix that
 * failed. 24-bit / 48000 Hz rather than "any matching pair": it is what the desktop fix sets, what
 * Meet renders at natively, and naming one exact value is easier to follow than a rule.
 */
function HiFiManualSteps() {
  return (
    <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-ink-muted">
      <li>Open Windows Sound settings → More sound settings.</li>
      <li>
        Playback tab: <span className="font-medium text-ink">Hi-Fi Cable Input</span> → Properties →
        Advanced → <span className="font-medium text-ink">24 bit, 48000 Hz</span>.
      </li>
      <li>
        Recording tab: <span className="font-medium text-ink">Hi-Fi Cable Output</span> → Properties
        → Advanced → the same, <span className="font-medium text-ink">24 bit, 48000 Hz</span>.
      </li>
      <li>Click Apply on both, then rejoin the meeting or reload WarpTalk.</li>
    </ol>
  );
}

function StepShell({
  index,
  title,
  state,
  children,
}: {
  index: number;
  title: string;
  state: StepState;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border p-5 transition ${
        state === "active"
          ? "border-primary/40 bg-primary/[0.05]"
          : "border-border bg-transparent opacity-70"
      }`}
    >
      <header className="mb-3 flex items-center gap-3">
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
            state === "done" ? "bg-emerald-500 text-white" : "bg-surface-3 text-ink"
          }`}
          aria-hidden
        >
          {state === "done" ? "✓" : index}
        </span>
        <h2 className="text-[15px] font-medium">{title}</h2>
      </header>
      <div className="pl-9 text-sm text-ink-muted">{children}</div>
    </section>
  );
}

function ProbeRow({ probe }: { probe: DeviceProbe }) {
  const role =
    probe.leg === "outbound"
      ? "carries your translated voice into the meeting"
      : "carries the meeting's audio back to you";

  const verdict = !probe.present
    ? { tone: "text-ink-subtle", text: probe.optional ? "Not installed (optional)" : "Not installed" }
    : probe.error
      ? { tone: "text-amber-600 dark:text-amber-400", text: probe.error }
      : probe.carriesSignal
        ? { tone: "text-emerald-600 dark:text-emerald-400", text: "Carrying audio" }
        // `destructive`, not `danger`: only tokens registered in @theme generate utilities in
        // Tailwind v4, and --color-danger is not one of them. `text-danger` compiles to nothing,
        // so the one verdict that means "your bridge is broken" would render in body colour.
        : { tone: "text-destructive", text: "Installed, but no sound came through" };

  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span>
        <span className="font-medium text-ink">{probe.expectedLabel}</span>
        <span className="block text-xs text-ink-subtle">{role}</span>
      </span>
      <span className={`shrink-0 text-xs ${verdict.tone}`}>{verdict.text}</span>
    </li>
  );
}

export function BridgeSetupWizard({
  onReady,
  readyLabel = "Start translating",
  runCheck = checkVirtualBridge,
  readStatus = readVirtualAudioStatus,
  loopbackFailed = false,
  browserCaptureAnswer = null,
  inboundDeviceId,
  onFormatAligned,
  audioMode = "voice",
}: {
  onReady?: () => void;
  /**
   * What the final button does, in the caller's words.
   *
   * The wizard is opened at two different moments: before translation, where finishing it starts
   * the meeting, and again mid-meeting when a device drops, where translation is already running
   * and "Start translating" would be a lie about what the button is about to do.
   */
  readyLabel?: string;
  /**
   * Injectable so the dev preview can render states a laptop without the devices cannot reach.
   * Given the desktop's status so the probe matches the endpoint labels the desktop reported.
   */
  runCheck?: (status: VirtualAudioStatus | null) => Promise<BridgeCheckResult>;
  /** Injectable for the same reason: a format mismatch cannot be produced on demand. */
  readStatus?: () => Promise<VirtualAudioStatus | null>;
  /**
   * WT-898. The two inputs to the inbound decision only the running meeting knows: listening to
   * the browser already failed in this room, and what the host said when asked. Without them the
   * wizard would tell a user whose capture fell back to Hi-Fi Cable to leave Meet's speakers alone
   * — exactly the setting that keeps the cable silent. The defaults are "nothing has happened
   * yet", which is also the right answer for the dev preview.
   */
  loopbackFailed?: boolean;
  browserCaptureAnswer?: boolean | null;
  /**
   * The meeting's own inbound device id (`findBridgeDeviceIds`), so the wizard's inbound decision
   * runs on exactly the inputs the meeting's does (`decideBridgeInbound`). Undefined outside a
   * meeting (the dev preview): the wizard then looks it up with the same function.
   */
  inboundDeviceId?: string | null;
  /**
   * Called after the desktop app reports the Hi-Fi Cable format fixed. A capture already open on
   * Hi-Fi Cable Output was opened on the old format and does not recover by itself — its track
   * ends or goes silent while the device id stays the same — so the meeting has to reopen it.
   */
  onFormatAligned?: () => void;
  /**
   * Text-only bridge (PO, 2026-10-01). In "text" mode Meet keeps the user's real microphone and
   * speakers and nothing is played into a cable, so there is no driver to install, no virtual
   * device to point Meet at and no tone to test: the wizard says so and asks for the one Meet
   * setting that matters — the REAL microphone. Defaults to voice, the wizard as it always was.
   */
  audioMode?: BridgeAudioMode;
}) {
  const textMode = audioMode === "text";
  const [result, setResult] = useState<BridgeCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [meetConfirmed, setMeetConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  /**
   * Resolved after mount, not during render.
   *
   * The device names depend on the platform, and the platform is read from `navigator`, which the
   * server does not have. Computing them in render would make the server emit the macOS names and
   * the client replace them with the Windows ones — a hydration mismatch on the one piece of text
   * the user is meant to copy exactly. Null until mount, and the instructions wait for it.
   */
  const [labels, setLabels] = useState<BridgeDeviceLabels | null>(null);
  /** Only the desktop app can install drivers; a browser tab has no bridge to ask. */
  const [canInstall, setCanInstall] = useState(false);
  const [installing, setInstalling] = useState(false);
  /**
   * The desktop app's device report, read alongside the tone test.
   *
   * The tone test can only say "no sound came through Hi-Fi Cable"; it cannot say why. The one
   * cause the user cannot guess is the cable's two sides being set to different formats, and only
   * the desktop status knows that — so it is read every time the test runs. Null in a browser or
   * on a desktop build too old to report it, and then no format notice is shown at all.
   */
  const [status, setStatus] = useState<VirtualAudioStatus | null>(null);
  /** Only used when no `inboundDeviceId` is passed in; see that prop. */
  const [ownInboundDeviceId, setOwnInboundDeviceId] = useState<string | null>(null);
  const [aligning, setAligning] = useState(false);
  const [alignOutcome, setAlignOutcome] = useState<HiFiAlignOutcome | null>(null);

  useEffect(() => {
    // No status yet: the fallback labels, replaced by the desktop's as soon as the check reads them.
    setLabels(bridgeDeviceLabelsFor(null));
    setCanInstall(Boolean(getDesktopBridge()?.installVirtualAudio));
  }, []);

  const check = useCallback(async () => {
    setChecking(true);
    // The desktop's status decides the labels the probe matches, so it is read first — but only
    // waited on for so long: a status read that hangs must not keep the test from reporting.
    const current = await withTimeout(readStatus(), STATUS_WAIT_MS, null);
    setStatus(current);
    const reported = bridgeDeviceLabelsFromStatus(current);
    if (reported) setLabels(reported);
    if (inboundDeviceId === undefined) {
      void findBridgeDeviceIds(current).then(
        (ids) => setOwnInboundDeviceId(ids.inboundDeviceId),
        () => setOwnInboundDeviceId(null),
      );
    }
    // Text mode tests nothing: the tone goes through the cables, and text mode uses none.
    if (textMode) {
      setResult(null);
      setChecking(false);
      return;
    }
    try {
      const outcome = await runCheck(current);
      setResult(outcome);
      // The check knows which pair this machine really has — BlackHole on a Mac set up before the
      // rename — so the instructions follow it rather than the platform default.
      if (outcome.labels) setLabels(outcome.labels);
    } catch {
      setResult({ probes: [], ready: false, needsPermission: true });
    } finally {
      setChecking(false);
    }
  }, [runCheck, readStatus, textMode, inboundDeviceId]);

  const install = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.installVirtualAudio) return;
    setInstalling(true);
    try {
      const outcome = await bridge.installVirtualAudio();
      if (outcome.started) await check();
    } finally {
      setInstalling(false);
    }
  }, [check]);

  /**
   * Fix the format, then prove it with the same tone test the user would otherwise click.
   *
   * `check()` re-reads the status too, so a successful fix clears the notice from what the desktop
   * reports now rather than from what this component assumes it did. Unsupported and failed
   * outcomes stay on screen with manual steps and are not retried automatically: what fixes them
   * is the user in Sound settings, not another IPC call.
   */
  const alignFormat = useCallback(async () => {
    setAligning(true);
    try {
      const outcome = await alignHiFiCableFormatViaDesktop();
      setAlignOutcome(outcome);
      if (outcome.kind === "result" && outcome.ok) {
        onFormatAligned?.();
        await check();
      }
    } finally {
      setAligning(false);
    }
  }, [check, onFormatAligned]);

  // Run once on open so the common case — everything already installed — needs no clicks.
  useEffect(() => {
    void check();
  }, [check]);

  // The desktop's verdict, which the tone probe may only DOWNGRADE (the desktop says the cable is
  // there, the probe heard nothing). Without a desktop verdict the probe decides, as it always did.
  const devicesReady = bridgeDevicesReadyWithProbe(status, result);
  const ready = devicesReady && meetConfirmed;
  const isWindows = labels?.platform === "windows";
  // The meeting's inbound device when it passed one, else the same lookup the meeting uses — not
  // the tone probe, which used to give the wizard a different answer from the meeting's.
  const resolvedInboundDeviceId = inboundDeviceId === undefined ? ownInboundDeviceId : inboundDeviceId;
  const inboundViaDevice = Boolean(resolvedInboundDeviceId);
  // WT-898: THE decision the meeting makes (decideBridgeInbound), with the same inputs, so the
  // Speakers line names the path the far side actually comes in on. Loopback first — Meet keeps
  // its speakers and nothing needs changing — and the cable only where loopback cannot run here,
  // was declined, or already failed.
  //
  // W4a: the FINAL path, not the one of the moment. While the capture question is still open the
  // meeting listens through an installed cable ("device-while-asking"), but that is a stopgap the
  // host's yes ends — telling them to point Meet's Speakers at the cable then would be the wrong
  // setting a minute later. finalBridgeInboundPath reads it as loopback.
  const inbound = decideBridgeInbound({
    status,
    audioMode: textMode ? "text" : "voice",
    loopbackFailed,
    inboundDeviceId: resolvedInboundDeviceId,
    consentAnswer: browserCaptureAnswer,
    // Which window gets captured is picked in the meeting, not here; it never changes the path.
    hasLoopbackSource: true,
  });
  const loopbackCapable = inbound.loopbackCapable;
  const inboundPath = finalBridgeInboundPath(inbound);
  // Anything but loopback names the cable: on the device path that is the setting that makes it
  // carry, and where there is no path at all the cable is the only way in — step 1 says to get it.
  const speakerToSet = labels?.meetSpeaker && inboundPath !== "loopback" ? labels.meetSpeaker : null;
  const formatMismatch = hifiFormatMismatch(status);
  // WT-898 review: the old version of this very step told Hi-Fi users to point Meet's Speakers at
  // the cable. On the loopback path nothing plays the call back from there, so the step now says
  // to undo it — the same words the widget shows (bridge-far-side-monitor).
  const speakerResetNotice = shouldShowMeetSpeakerResetNotice(inboundPath, inboundViaDevice);

  if (textMode) {
    return (
      <TextOnlySetup
        loopbackCapable={loopbackCapable}
        statusKnown={status !== null}
        meetConfirmed={meetConfirmed}
        onMeetConfirmed={setMeetConfirmed}
        readyLabel={readyLabel}
        onReady={onReady}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 text-ink">
      <header>
        <h1 className="text-xl font-semibold">Set up your external meeting</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your meeting runs on Google Meet. WarpTalk sits beside it, translating what you say into
          the call and what the call says back to you.
        </p>
      </header>

      <StepShell
        index={1}
        title={isWindows ? "Install the audio driver" : "Install the two audio devices"}
        state={devicesReady ? "done" : "active"}
      >
        {/*
          Above the install text, not inside the Windows branch: a mismatch usually makes the tone
          test fail, but the notice has to show whichever branch that lands in — and "install the
          drivers" is the wrong advice for a cable that is installed and merely misset.
        */}
        {formatMismatch && (
          <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] p-3 text-amber-700 dark:text-amber-300">
            <p>
              Hi-Fi Cable Input is {describeHiFiFormat(status?.hifiFormat?.input)}, Hi-Fi Cable Output
              is {describeHiFiFormat(status?.hifiFormat?.output)} — they must match or no sound reaches
              WarpTalk.
            </p>
            <div className="mt-2">
              <Button type="button" size="sm" onClick={() => void alignFormat()} disabled={aligning || checking}>
                {aligning ? "Fixing…" : "Fix audio format"}
              </Button>
            </div>
            {alignOutcome?.kind === "unsupported" && (
              <>
                <p className="mt-2 text-xs text-ink-muted">
                  This version of WarpTalk can&apos;t change it for you. Set it by hand:
                </p>
                <HiFiManualSteps />
              </>
            )}
            {alignOutcome?.kind === "result" && !alignOutcome.ok && (
              <>
                <p className="mt-2 text-xs text-ink-muted">
                  Couldn&apos;t change it{alignOutcome.error ? `: ${alignOutcome.error}` : "."} Set it
                  by hand:
                </p>
                <HiFiManualSteps />
              </>
            )}
          </div>
        )}
        {/*
          WT-898: on Windows the second cable is the fallback, not the plan. WarpTalk listens to the
          browser itself wherever Windows allows it, so the copy asks for Hi-Fi Cable only where
          that path is not there — and says why, rather than listing a driver nobody needs.
        */}
        {devicesReady && !isWindows ? (
          <p>Both devices are installed and working.</p>
        ) : devicesReady && inboundPath === "loopback" ? (
          <p>
            VB-CABLE is installed and working. WarpTalk listens to Meet straight from your browser, so
            nothing else is needed.
          </p>
        ) : devicesReady && inboundViaDevice ? (
          <p>VB-CABLE and Hi-Fi Cable are installed and working.</p>
        ) : devicesReady ? (
          <p>
            VB-CABLE is installed and working.{" "}
            {loopbackCapable
              ? "WarpTalk is not listening to your browser in this meeting"
              : "This version of Windows does not let WarpTalk listen to your browser directly"}
            , so the other side reaches WarpTalk only through Hi-Fi Cable. Install it from the{" "}
            <a className="underline hover:text-ink" href={WINDOWS_CABLES_DOWNLOAD_PAGE} target="_blank" rel="noreferrer">
              VB-Audio download page
            </a>
            .
          </p>
        ) : isWindows ? (
          <>
            <p className="mb-3">
              WarpTalk uses one free driver from VB-Audio:{" "}
              <span className="font-medium text-ink">VB-CABLE</span> carries your translated voice into
              the meeting. <span className="font-medium text-ink">Hi-Fi Cable</span>, on the same page,
              is only needed when WarpTalk can&apos;t listen to your browser directly (older Windows).
            </p>
            <p className="text-xs text-ink-subtle">
              <a className="underline hover:text-ink" href={WINDOWS_CABLES_DOWNLOAD_PAGE} target="_blank" rel="noreferrer">
                Open the VB-Audio download page
              </a>
              , install VB-CABLE, and restart if the installer asks. If you install Hi-Fi Cable too, set
              its Input and Output to the same format in Windows Sound settings — 24-bit, 48000 Hz — or
              it passes no sound.
            </p>
          </>
        ) : (
          <>
            <p className="mb-3">
              WarpTalk needs two virtual audio devices to pass sound to and from Meet:{" "}
              <span className="font-medium text-ink">WarpTalk Microphone</span> and{" "}
              <span className="font-medium text-ink">WarpTalk Speaker</span>. The WarpTalk desktop app
              installs both, and macOS asks for your password once.
            </p>
            {canInstall && (
              <div className="mb-3">
                <Button type="button" size="sm" onClick={() => void install()} disabled={installing}>
                  {installing ? "Installing…" : "Install audio devices"}
                </Button>
              </div>
            )}
            <p className="mb-2 text-xs text-ink-subtle">
              Already using BlackHole? It still works: WarpTalk uses BlackHole 2ch and BlackHole 16ch
              when its own devices are not installed. To set BlackHole up instead:
            </p>
            <div className="mb-3 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-ink">
                {BREW_COMMAND}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(BREW_COMMAND);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-ink-subtle">
              No Homebrew?{" "}
              <a className="underline hover:text-ink" href={DOWNLOAD_PAGE} target="_blank" rel="noreferrer">
                Download it directly
              </a>
              . Either way macOS asks for your password, and the devices only appear after you
              restart.
            </p>
          </>
        )}
      </StepShell>

      <StepShell
        index={2}
        title="Point Google Meet at them"
        state={!devicesReady ? "todo" : meetConfirmed ? "done" : "active"}
      >
        <p className="mb-3">
          In your Meet tab, open Settings → Audio and set
          {speakerToSet ? " both:" : ":"}
        </p>
        <ul className="mb-3 space-y-1">
          <li>
            Microphone → <span className="font-medium text-ink">{labels?.meetMicrophone ?? "…"}</span>
          </li>
          {/*
            Only where a second virtual device carries the far side (WT-898: the same decision the
            meeting makes). Where WarpTalk listens to the browser there is nothing to change here —
            and pointing Meet's speaker at the cable would take the call out of the host's ears for
            a path nobody is reading.
          */}
          {speakerToSet ? (
            <li>
              Speakers → <span className="font-medium text-ink">{speakerToSet}</span>. You will hear
              the call through WarpTalk instead, a little quieter while a translation is playing.
              {/*
                The two cables have near-identical names in Meet's list, and the wrong pick fails
                silently: CABLE Input is where WarpTalk's voice goes INTO Meet, so the call loops
                back into the meeting and WarpTalk hears nothing.
              */}
              {isWindows && (
                <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">
                  Not &ldquo;CABLE Input&rdquo; — that is WarpTalk&apos;s voice cable; choosing it sends
                  the call back into Meet and WarpTalk hears nothing.
                </span>
              )}
            </li>
          ) : (
            <li>
              Speakers → <span className="font-medium text-ink">leave as they are</span>, so you
              can still hear the call. WarpTalk listens to the browser directly.
              {/*
                Process loopback takes the whole browser process tree, not one tab: a video playing
                in another tab lands in the meeting's transcript as if the far side had said it. One
                line here, while the call is being set up, is cheaper than that surprise.
              */}
              <span className="mt-1 block text-xs text-ink-subtle">
                WarpTalk hears everything this browser plays — pause other tabs with sound during
                the call.
              </span>
              {speakerResetNotice && (
                <span
                  data-bridge-meet-speaker-reset
                  className="mt-1 block text-xs text-amber-600 dark:text-amber-400"
                >
                  {MEET_SPEAKER_RESET_NOTICE}
                </span>
              )}
            </li>
          )}
          {/*
            The camera line is here, in the list of things to set, because that is where somebody
            looking for a camera setting will look — and finding nothing is what WT-525 reported.
            The decision behind it is at the top of this file.
          */}
          <li>
            Camera → <span className="font-medium text-ink">leave it alone</span>. WarpTalk
            translates voices, not pictures, so Meet keeps using your real camera and there is no
            virtual one to install.
          </li>
        </ul>
        <p className="mb-3 text-xs text-ink-subtle">
          Pick your own microphone for WarpTalk in the WarpTalk popup over Meet: ⚙ → Microphone.
          Meet talks to the virtual devices; you talk to your real ones.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={meetConfirmed}
            disabled={!devicesReady}
            onChange={(event) => setMeetConfirmed(event.target.checked)}
          />
          <span>
            {speakerToSet ? "I've set both in Meet." : "I've set the microphone in Meet."}
            <span className="block text-xs text-ink-subtle">
              WarpTalk can&apos;t check this one — what Meet has selected lives inside Google&apos;s
              page, out of reach. This is the one step you confirm yourself.
            </span>
          </span>
        </label>
      </StepShell>

      <StepShell index={3} title="Test the connection" state={devicesReady ? "done" : "active"}>
        {result?.needsPermission && (
          <p className="mb-3 text-amber-600 dark:text-amber-400">
            Allow microphone access so WarpTalk can see your audio devices, then test again.
          </p>
        )}

        {result && result.probes.length > 0 && (
          <ul className="mb-3">
            {result.probes.map((probe) => (
              <ProbeRow key={probe.leg} probe={probe} />
            ))}
          </ul>
        )}

        <Button type="button" variant="secondary" size="sm" onClick={() => void check()} disabled={checking}>
          {checking ? "Testing…" : "Test again"}
        </Button>
        <p className="mt-2 text-xs text-ink-subtle">
          Plays a short tone into each device and listens for it coming back.
        </p>
      </StepShell>

      <footer className="flex items-center justify-between gap-4 pt-2">
        <p className="text-xs text-ink-subtle">
          {ready
            ? "Everything checked. Your meeting will translate both ways."
            : "Finish the steps above to start."}
        </p>
        <Button type="button" disabled={!ready} onClick={onReady}>
          {readyLabel}
        </Button>
      </footer>
    </div>
  );
}

/**
 * The wizard for text-only mode: two steps, no driver. Meet keeps the real microphone and speakers;
 * WarpTalk listens to the browser (when Windows allows it) and transcribes and translates as text.
 */
function TextOnlySetup({
  loopbackCapable,
  statusKnown,
  meetConfirmed,
  onMeetConfirmed,
  readyLabel,
  onReady,
}: {
  loopbackCapable: boolean;
  statusKnown: boolean;
  meetConfirmed: boolean;
  onMeetConfirmed: (confirmed: boolean) => void;
  readyLabel: string;
  onReady?: () => void;
}) {
  return (
    <div data-bridge-setup-text-only className="mx-auto flex w-full max-w-2xl flex-col gap-4 text-ink">
      <header>
        <h1 className="text-xl font-semibold">Set up text-only mode</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your meeting runs on Google Meet with your own microphone and speakers. The other side hears
          your real voice; WarpTalk shows you the transcript and the translations as text.
        </p>
      </header>

      <StepShell index={1} title="No audio driver needed" state="done">
        <p>
          Text-only mode plays nothing into Meet, so there is no virtual cable to install.{" "}
          {loopbackCapable
            ? "WarpTalk listens to Meet straight from your browser to translate the other side."
            : statusKnown
              ? "This computer does not let WarpTalk listen to your browser directly, so only what you say is transcribed."
              : "WarpTalk listens to Meet from your browser where Windows allows it."}
        </p>
      </StepShell>

      <StepShell index={2} title="Check Google Meet" state={meetConfirmed ? "done" : "active"}>
        <p className="mb-3">In your Meet tab, open Settings → Audio and check:</p>
        <ul className="mb-3 space-y-1">
          <li>
            Microphone → <span className="font-medium text-ink">your own microphone</span>, not
            &ldquo;CABLE Output&rdquo;. Nothing is played into the cable in this mode, so Meet would
            hear silence from you.
          </li>
          <li>
            Speakers → <span className="font-medium text-ink">leave as they are</span>, so you hear
            the call.
          </li>
        </ul>
        <p data-bridge-headphones-hint className="mb-3 text-xs text-amber-600 dark:text-amber-400">
          Use headphones. Your speakers play the call, and your real microphone can pick it up and send
          it back into Meet.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={meetConfirmed}
            onChange={(event) => onMeetConfirmed(event.target.checked)}
          />
          <span>
            I&apos;ve checked the microphone in Meet.
            <span className="block text-xs text-ink-subtle">
              WarpTalk can&apos;t check this one — what Meet has selected lives inside Google&apos;s
              page, out of reach.
            </span>
          </span>
        </label>
      </StepShell>

      <footer className="flex items-center justify-between gap-4 pt-2">
        <p className="text-xs text-ink-subtle">
          {meetConfirmed ? "Everything checked." : "Finish the steps above to start."}
        </p>
        <Button type="button" disabled={!meetConfirmed} onClick={onReady}>
          {readyLabel}
        </Button>
      </footer>
    </div>
  );
}
