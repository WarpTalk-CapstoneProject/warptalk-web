"use client";

/**
 * Settings → Microphone: the microphone WarpTalk records. Voice mode only (PO, 2026-10-03).
 *
 * In voice mode Meet's microphone is "CABLE Output" and stays there, so the person's real
 * microphone is picked HERE, for WarpTalk. A bridge room has no pre-join screen, and before this
 * WarpTalk recorded whatever Windows called the default input with no way to see or change it,
 * while the setup wizard told people to "keep your own microphone selected here in WarpTalk".
 * Text mode has no such row: Meet keeps the real microphone there and it is picked in Meet.
 *
 * The list is this window's own `enumerateDevices` (same machine, same ids as the main window's),
 * virtual cables left out (lib/meeting/bridge-mic-device). The tick is the main window's answer
 * (`micDeviceId` in its snapshot), never this window's guess, so a switch that failed shows as not
 * having happened. A current device that is a virtual cable is said out loud: WarpTalk would be
 * transcribing its own output.
 */

import { useEffect, useState } from "react";
import { Check, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

import { bridgeMicOptions, describeBridgeMic } from "@/lib/meeting/bridge-mic-device";
import { cn } from "@/lib/utils";

import { useBridgeWidget } from "../widget-context";

/** This window's audio inputs, refreshed whenever a device comes or goes. */
export function useBridgeMicDevices(enabled: boolean): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const mediaDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!enabled || !mediaDevices?.enumerateDevices) return;
    let cancelled = false;
    const refresh = () => {
      mediaDevices
        .enumerateDevices()
        .then((list) => {
          if (!cancelled) setDevices(list);
        })
        .catch(() => undefined);
    };
    refresh();
    mediaDevices.addEventListener?.("devicechange", refresh);
    return () => {
      cancelled = true;
      mediaDevices.removeEventListener?.("devicechange", refresh);
    };
  }, [enabled]);
  return devices;
}

/** What the root row says: the current device's name, or that it is not known yet. */
export function useBridgeMicSummary(devices: MediaDeviceInfo[]): { label: string | null; virtual: boolean } {
  const { relay } = useBridgeWidget();
  const micDeviceId = relay.view.status === "connected" ? relay.view.snapshot?.micDeviceId : null;
  const described = describeBridgeMic(devices, micDeviceId);
  return { label: described?.label ?? null, virtual: described?.virtual ?? false };
}

export function MicDeviceOptions({
  devices,
  onPicked,
}: {
  devices: MediaDeviceInfo[];
  onPicked: () => void;
}) {
  const t = useTranslations("rooms.bridgeWidget");
  const { relay } = useBridgeWidget();
  const snapshot = relay.view.status === "connected" ? relay.view.snapshot : null;
  const micDeviceId = snapshot?.micDeviceId ?? null;
  // A main window that predates the picker never sends `micDeviceId`, and could not switch.
  const canPick = Boolean(micDeviceId);
  const options = bridgeMicOptions(devices);
  const current = describeBridgeMic(devices, micDeviceId);

  return (
    <>
      <p className="px-2.5 pb-1 pt-0.5 text-[11px] leading-snug text-ink-muted">{t("micDevice.hint")}</p>
      {current?.virtual ? (
        <p
          data-bridge-mic-virtual
          className="mx-1 mb-1 flex items-start gap-1.5 rounded-md bg-status-waiting/15 px-2 py-1.5 text-[11px] leading-snug text-ink"
        >
          <WarningCircle size={14} weight="fill" className="mt-px shrink-0 text-status-waiting" aria-hidden="true" />
          <span>{t("micDevice.virtual", { label: current.label })}</span>
        </p>
      ) : null}
      {!canPick ? (
        <p className="px-2.5 py-1 text-[11px] leading-snug text-ink-subtle">{t("relay.noHost")}</p>
      ) : options.length === 0 ? (
        <p className="px-2.5 py-1 text-[11px] leading-snug text-ink-subtle">{t("micDevice.none")}</p>
      ) : (
        <div role="radiogroup" aria-label={t("micDevice.title")}>
          {options.map((option) => {
            const selected = option.deviceId === micDeviceId;
            return (
              <button
                key={option.deviceId}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  if (!selected) relay.setMicDevice(option.deviceId);
                  onPicked();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  selected ? "bg-primary/10 text-primary" : "text-ink hover:bg-surface-2",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
