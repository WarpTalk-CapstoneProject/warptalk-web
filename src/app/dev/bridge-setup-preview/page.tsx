"use client";

/**
 * The external-meeting setup wizard, rendered against fixtures.
 *
 * WHY IT EXISTS
 *   The wizard's states are gated on hardware. Seeing the "everything works" state needs two
 *   virtual audio drivers installed and a reboot; seeing the "installed but silent" state needs a
 *   deliberately broken driver, which is not something anyone is going to arrange. So the only
 *   states reachable on a normal laptop are "nothing installed" and "permission not granted" —
 *   the two least interesting ones.
 *
 *   Passing a stub check in covers the rest, so the copy and the layout of every state can be
 *   reviewed before anybody installs anything.
 *
 * IT IS NOT THE WIZARD IN USE
 *   It renders the component against canned results. It cannot catch a fault in the real probe —
 *   only what the wizard looks like once a result arrives.
 */

import { useState } from "react";

import { BridgeSetupWizard } from "@/components/rooms/bridge/bridge-setup-wizard";
import {
  INBOUND_DEVICE_LABEL,
  OUTBOUND_DEVICE_LABEL,
  type BridgeCheckResult,
} from "@/lib/audio/virtual-bridge-check";

const FIXTURES: Record<string, { label: string; result: BridgeCheckResult }> = {
  live: {
    label: "Real devices on this machine",
    result: { probes: [], ready: false, needsPermission: false },
  },
  missing: {
    label: "Nothing installed",
    result: {
      needsPermission: false,
      ready: false,
      probes: [
        { leg: "outbound", expectedLabel: OUTBOUND_DEVICE_LABEL, present: false, carriesSignal: null },
        { leg: "inbound", expectedLabel: INBOUND_DEVICE_LABEL, present: false, carriesSignal: null },
      ],
    },
  },
  silent: {
    label: "Installed but one leg is silent",
    result: {
      needsPermission: false,
      ready: false,
      probes: [
        { leg: "outbound", expectedLabel: OUTBOUND_DEVICE_LABEL, present: true, carriesSignal: true },
        { leg: "inbound", expectedLabel: INBOUND_DEVICE_LABEL, present: true, carriesSignal: false },
      ],
    },
  },
  permission: {
    label: "Microphone permission not granted",
    result: { probes: [], ready: false, needsPermission: true },
  },
  ready: {
    label: "Both legs working",
    result: {
      needsPermission: false,
      ready: true,
      probes: [
        { leg: "outbound", expectedLabel: OUTBOUND_DEVICE_LABEL, present: true, carriesSignal: true },
        { leg: "inbound", expectedLabel: INBOUND_DEVICE_LABEL, present: true, carriesSignal: true },
      ],
    },
  },
};

export default function BridgeSetupPreviewPage() {
  const [fixture, setFixture] = useState<keyof typeof FIXTURES>("missing");

  return (
    <main className="min-h-[100dvh] bg-[#0b0b0c] px-6 py-10">
      <div className="mx-auto mb-8 flex w-full max-w-2xl flex-wrap gap-2">
        {Object.entries(FIXTURES).map(([key, { label }]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFixture(key as keyof typeof FIXTURES)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              fixture === key
                ? "border-white/40 bg-white/10 text-white"
                : "border-white/15 text-white/50 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <BridgeSetupWizard
        key={fixture}
        runCheck={
          fixture === "live"
            ? undefined
            : async () => {
                // A beat, so the "Testing…" state is visible rather than theoretical.
                await new Promise((resolve) => setTimeout(resolve, 400));
                return FIXTURES[fixture].result;
              }
        }
        onReady={() => alert("Would start the meeting.")}
      />
    </main>
  );
}
