"use client";

/**
 * Developer preview for the desktop audio bridge panel.
 *
 * The panel reads `window.warptalk`, which only exists inside the Electron shell — so on a
 * laptop it renders nothing, and the only way to see any of its four states would be to build,
 * package and install a desktop app, install or uninstall system audio drivers, and repeat that
 * for each state. That is not a review loop anybody will run, which is how a panel ends up
 * shipping with a state nobody has ever looked at.
 *
 * This page stubs the bridge with a chosen status and renders the real component against it. It
 * is gated twice: `src/proxy.ts` 404s the `/dev` prefix in production, and `src/app/dev/layout.tsx`
 * calls notFound() independently.
 */

import { useLayoutEffect, useState } from "react";

import { AudioBridgePanel } from "@/components/desktop/audio-bridge-panel";
import type { VirtualAudioStatus } from "@/lib/desktop/bridge";

const MAC_DEVICES = [
  {
    leg: "outbound" as const,
    driverBundle: "BlackHole2ch.driver",
    deviceName: "BlackHole 2ch",
    installed: true,
  },
  {
    leg: "inbound" as const,
    driverBundle: "BlackHole16ch.driver",
    deviceName: "BlackHole 16ch",
    installed: true,
  },
];

const SCENARIOS: Array<{
  key: string;
  label: string;
  note: string;
  status: VirtualAudioStatus | null;
}> = [
  {
    key: "browser",
    label: "Browser (no bridge)",
    note: "The panel must render nothing at all — not an empty card, not a heading.",
    status: null,
  },
  {
    key: "ready",
    label: "macOS · both installed",
    note: "Names each device and which slot it takes in the other app.",
    status: {
      platform: "darwin",
      supported: true,
      ready: true,
      devices: MAC_DEVICES,
      foreignDrivers: [],
    },
  },
  {
    key: "half",
    label: "macOS · one missing",
    note: "The confusing case: sound settings look right, audio fails one way only.",
    status: {
      platform: "darwin",
      supported: true,
      ready: false,
      devices: MAC_DEVICES.map((device) =>
        device.leg === "inbound" ? { ...device, installed: false } : device,
      ),
      foreignDrivers: ["Soundflower.driver"],
    },
  },
  {
    key: "none",
    label: "macOS · neither installed",
    note: "First run on a clean Mac.",
    status: {
      platform: "darwin",
      supported: true,
      ready: false,
      devices: MAC_DEVICES.map((device) => ({ ...device, installed: false })),
      foreignDrivers: [],
    },
  },
  {
    key: "windows",
    label: "Windows · no detection yet",
    note: "Must NOT offer an install — there is nothing WarpTalk could then detect.",
    status: {
      platform: "win32",
      supported: false,
      ready: false,
      devices: [],
      foreignDrivers: [],
    },
  },
];

/** Install or remove the stub. Kept out of the component so the first paint can use it too. */
function stubBridge(status: VirtualAudioStatus | null) {
  const target = window as Window & { warptalk?: unknown };

  if (status === null) {
    delete target.warptalk;
    return;
  }

  target.warptalk = {
    getVirtualAudioStatus: () => Promise.resolve(status),
    installVirtualAudio: () => {
      window.alert(
        "In the real app this opens a dialog explaining the install, then either copies the " +
          "Homebrew command or opens the vendor page. It never runs a privileged install.",
      );
      return Promise.resolve({ started: true, reason: "command-copied" });
    },
  };
}

export default function AudioBridgePreviewPage() {
  const [active, setActive] = useState(SCENARIOS[1]);
  // Remounts the panel so its mount-time read of the stub runs again for the new scenario.
  const [generation, setGeneration] = useState(0);
  // The panel reads the bridge when it mounts, so the stub has to be in place BEFORE its first
  // render — otherwise the default scenario shows the empty browser state and looks broken.
  const [stubbed, setStubbed] = useState(false);

  useLayoutEffect(() => {
    stubBridge(SCENARIOS[1].status);
    setStubbed(true);
  }, []);

  function choose(scenario: (typeof SCENARIOS)[number]) {
    stubBridge(scenario.status);
    setActive(scenario);
    setGeneration((value) => value + 1);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-ink">Audio bridge panel</h1>
        <p className="text-[12px] text-ink-muted">
          Developer preview. Pick a state to stub <code>window.warptalk</code> and render the real
          component against it.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.key}
            type="button"
            onClick={() => choose(scenario)}
            className={
              scenario.key === active.key
                ? "rounded-lg bg-ink px-3 py-1.5 text-[12px] font-medium text-surface-1"
                : "rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-ink-muted hover:bg-surface-2"
            }
          >
            {scenario.label}
          </button>
        ))}
      </div>

      <p className="text-[12px] italic text-ink-subtle">{active.note}</p>

      <div className="rounded-xl border border-dashed border-border p-4">
        {stubbed ? <AudioBridgePanel key={generation} label="This device" /> : null}
        {active.status === null ? (
          <p className="text-[12px] text-ink-subtle">
            (Nothing rendered above — correct for a browser.)
          </p>
        ) : null}
      </div>
    </div>
  );
}
