"use client";

/**
 * The audio bridge panel — desktop only, and invisible everywhere else.
 *
 * Translating a meeting held in ANOTHER app (Google Meet, Zoom) needs two virtual audio devices,
 * one for each direction. The desktop app detects them and can walk the user through installing
 * them; until this panel existed, both of those capabilities were reachable only over an IPC
 * channel that nothing in the web app called, so a user whose bridge was not set up had no way to
 * find that out and no way to fix it.
 *
 * All wording and state lives in lib/desktop/virtual-audio.ts, under test. This file is the
 * rendering and the refresh, nothing more.
 */

import {
  ArrowClockwise,
  CheckCircle,
  Info,
  Microphone,
  SpeakerHigh,
  Warning,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import { readVirtualAudioStatus, requestVirtualAudioInstall } from "@/lib/desktop/bridge";
import {
  describeAudioBridge,
  shouldShowAudioBridge,
  type AudioBridgeView,
} from "@/lib/desktop/virtual-audio";
import { cn } from "@/lib/utils";

const TONE = {
  ready: {
    icon: CheckCircle,
    iconClass: "text-emerald-500",
    ring: "border-emerald-500/25 bg-emerald-500/[0.04]",
  },
  missing: {
    icon: Warning,
    iconClass: "text-amber-500",
    ring: "border-amber-500/25 bg-amber-500/[0.04]",
  },
  "outbound-only": {
    icon: Info,
    iconClass: "text-sky-500",
    ring: "border-sky-500/25 bg-sky-500/[0.04]",
  },
  "installed-not-running": {
    icon: Warning,
    iconClass: "text-amber-500",
    ring: "border-amber-500/25 bg-amber-500/[0.04]",
  },
  "caption-only": {
    icon: Info,
    iconClass: "text-amber-500",
    ring: "border-amber-500/25 bg-amber-500/[0.04]",
  },
  "unsupported-platform": {
    icon: Info,
    iconClass: "text-ink-muted",
    ring: "border-border bg-surface-2",
  },
} as const;

/**
 * @param label When given, the card is wrapped in a titled section matching the settings page's
 *   own section pattern. It is a prop rather than page markup because the panel renders NOTHING
 *   in a browser — a header supplied by the page would survive on its own and leave every
 *   non-desktop user staring at an empty titled section.
 */
export function AudioBridgePanel({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  const [view, setView] = useState<AudioBridgeView>(() => describeAudioBridge(null));
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    setChecking(true);
    const status = await readVirtualAudioStatus();
    setView(describeAudioBridge(status));
    setChecking(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const status = await readVirtualAudioStatus();
      if (cancelled) return;
      setView(describeAudioBridge(status));
      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The desktop side shows its own explanation and either copies the Homebrew command or opens
   * the vendor page — it never runs a privileged install itself. So there is nothing to await a
   * result from: we re-read the status, and the user re-checks after the devices appear, which on
   * macOS is only after a restart.
   */
  const handleInstall = useCallback(async () => {
    await requestVirtualAudioInstall();
    await refresh();
  }, [refresh]);

  // Nothing to say in a browser, and nothing to say before the first answer arrives. Rendering a
  // skeleton would put a loading shimmer on every browser user's settings page forever.
  if (checking || !shouldShowAudioBridge(view)) return null;

  const tone = TONE[view.state as keyof typeof TONE] ?? TONE["unsupported-platform"];
  const ToneIcon = tone.icon;

  const card = (
    <section className={cn("rounded-xl border p-4", tone.ring, label ? undefined : className)}>
      <div className="flex items-start gap-3">
        <ToneIcon size={18} weight="fill" className={cn("mt-0.5 shrink-0", tone.iconClass)} />

        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold text-ink">{view.heading}</h3>
          {view.message ? (
            <p className="mt-1 text-[12px] leading-5 text-ink-muted">{view.message}</p>
          ) : null}

          {view.devices.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {view.devices.map((device) => {
                const DeviceIcon = device.leg === "outbound" ? Microphone : SpeakerHigh;

                return (
                  <li
                    key={device.leg}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-1 px-3 py-2"
                  >
                    <DeviceIcon size={15} className="shrink-0 text-ink-subtle" />
                    <span className="min-w-0 flex-1">
                      {/* The exact string the user hunts for in the other app's picker, so it is
                          set in mono and never truncated to an ellipsis. */}
                      <span className="block font-mono text-[12px] font-medium text-ink">
                        {device.deviceName}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-ink-subtle">
                        {device.role}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        device.installed
                          ? "bg-emerald-500/12 text-emerald-600"
                          : "bg-amber-500/12 text-amber-600",
                      )}
                    >
                      {device.installed ? "Installed" : "Missing"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {view.foreignDrivers.length > 0 ? (
            // Named because "I already have a virtual microphone" is the first thing people say
            // when asked to install one, and naming theirs is how that conversation ends.
            <p className="mt-2.5 text-[11px] leading-5 text-ink-subtle">
              Other virtual audio drivers on this device: {view.foreignDrivers.join(", ")}.
              WarpTalk does not use them.
            </p>
          ) : null}

          {view.action ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleInstall}
                className="inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12px] font-medium text-surface-1 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {view.action}
              </button>
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-medium text-ink-muted transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowClockwise size={13} />
                Check again
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );

  if (!label) return card;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        {label}
      </div>
      {card}
    </div>
  );
}
