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
 */

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  checkVirtualBridge,
  currentBridgeDeviceLabels,
  type BridgeCheckResult,
  type BridgeDeviceLabels,
  type DeviceProbe,
} from "@/lib/audio/virtual-bridge-check";

const BREW_COMMAND = "brew install --cask blackhole-2ch blackhole-16ch";
const DOWNLOAD_PAGE = "https://existential.audio/blackhole/";

type StepState = "todo" | "active" | "done";

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
          ? "border-white/25 bg-white/[0.04]"
          : "border-white/10 bg-transparent opacity-70"
      }`}
    >
      <header className="mb-3 flex items-center gap-3">
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
            state === "done" ? "bg-emerald-400 text-black" : "bg-white/15 text-white"
          }`}
          aria-hidden
        >
          {state === "done" ? "✓" : index}
        </span>
        <h2 className="text-[15px] font-medium">{title}</h2>
      </header>
      <div className="pl-9 text-sm text-white/65">{children}</div>
    </section>
  );
}

function ProbeRow({ probe }: { probe: DeviceProbe }) {
  const role =
    probe.leg === "outbound"
      ? "carries your translated voice into the meeting"
      : "carries the meeting's audio back to you";

  const verdict = !probe.present
    ? { tone: "text-white/40", text: "Not installed" }
    : probe.error
      ? { tone: "text-amber-300", text: probe.error }
      : probe.carriesSignal
        ? { tone: "text-emerald-300", text: "Carrying audio" }
        : { tone: "text-red-300", text: "Installed, but no sound came through" };

  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-white/5 py-2 last:border-0">
      <span>
        <span className="font-medium text-white/85">{probe.expectedLabel}</span>
        <span className="block text-xs text-white/45">{role}</span>
      </span>
      <span className={`shrink-0 text-xs ${verdict.tone}`}>{verdict.text}</span>
    </li>
  );
}

export function BridgeSetupWizard({
  onReady,
  runCheck = checkVirtualBridge,
}: {
  onReady?: () => void;
  /** Injectable so the dev preview can render states a laptop without the devices cannot reach. */
  runCheck?: () => Promise<BridgeCheckResult>;
}) {
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

  useEffect(() => {
    setLabels(currentBridgeDeviceLabels());
  }, []);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setResult(await runCheck());
    } catch {
      setResult({ probes: [], ready: false, needsPermission: true });
    } finally {
      setChecking(false);
    }
  }, [runCheck]);

  // Run once on open so the common case — everything already installed — needs no clicks.
  useEffect(() => {
    void check();
  }, [check]);

  const devicesReady = result?.ready === true;
  const ready = devicesReady && meetConfirmed;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 text-white">
      <header>
        <h1 className="text-xl font-semibold">Set up your external meeting</h1>
        <p className="mt-1 text-sm text-white/55">
          Your meeting runs on Google Meet. WarpTalk sits beside it, translating what you say into
          the call and what the call says back to you.
        </p>
      </header>

      <StepShell
        index={1}
        title="Install the two audio devices"
        state={devicesReady ? "done" : "active"}
      >
        {devicesReady ? (
          <p>Both devices are installed and working.</p>
        ) : (
          <>
            <p className="mb-3">
              WarpTalk needs two virtual audio devices to pass sound to and from Meet. It uses
              BlackHole, which is free and open source.
            </p>
            <div className="mb-3 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-black/40 px-3 py-2 font-mono text-xs">
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
            <p className="text-xs text-white/45">
              No Homebrew?{" "}
              <a className="underline hover:text-white" href={DOWNLOAD_PAGE} target="_blank" rel="noreferrer">
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
          {labels?.meetSpeaker ? " both:" : ":"}
        </p>
        <ul className="mb-3 space-y-1">
          <li>
            Microphone → <span className="font-medium text-white/85">{labels?.meetMicrophone ?? "…"}</span>
          </li>
          {/*
            Only where a second virtual device carries the far side. On Windows process loopback
            reads the browser's own output instead, so there is nothing to change here — and
            pointing Meet's speaker at a virtual device would only make the call inaudible.
          */}
          {labels?.meetSpeaker ? (
            <li>
              Speakers → <span className="font-medium text-white/85">{labels.meetSpeaker}</span>
            </li>
          ) : (
            <li>
              Speakers → <span className="font-medium text-white/85">leave as they are</span>, so you
              can still hear the call. WarpTalk listens to the browser directly.
            </li>
          )}
        </ul>
        <p className="mb-3 text-xs text-white/45">
          Keep your own microphone and headphones selected here in WarpTalk. Meet talks to the
          virtual devices; you talk to your real ones.
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
            I&apos;ve set both in Meet.
            <span className="block text-xs text-white/45">
              WarpTalk can&apos;t check this one — what Meet has selected lives inside Google&apos;s
              page, out of reach. This is the one step you confirm yourself.
            </span>
          </span>
        </label>
      </StepShell>

      <StepShell index={3} title="Test the connection" state={devicesReady ? "done" : "active"}>
        {result?.needsPermission && (
          <p className="mb-3 text-amber-300">
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
        <p className="mt-2 text-xs text-white/45">
          Plays a short tone into each device and listens for it coming back.
        </p>
      </StepShell>

      <footer className="flex items-center justify-between gap-4 pt-2">
        <p className="text-xs text-white/45">
          {ready
            ? "Everything checked. Your meeting will translate both ways."
            : "Finish the steps above to start."}
        </p>
        <Button type="button" disabled={!ready} onClick={onReady}>
          Start translating
        </Button>
      </footer>
    </div>
  );
}
