"use client";

/**
 * The maintenance banner, app-wide: signed-in shell and the public sign-in pages.
 *
 * Two sources, either is enough to show it:
 *   1. `GET /api/v1/platform/status`, polled every minute (usePlatformStatus) — maintenance on, its
 *      message and the support address. This is also what turns it off again.
 *   2. The API client: a 503 with errorCode MAINTENANCE on any call (maintenance-signal.ts). That
 *      answer arrives before the next poll, so the banner appears the moment a call is refused,
 *      and a fresh status read is requested at once.
 *
 * A status call that fails shows nothing new: an unreachable status endpoint is not a maintenance
 * window, and the banner never invents one.
 */

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Wrench } from "@phosphor-icons/react/dist/ssr";

import { usePlatformStatus } from "@/hooks/use-admin-platform-settings";
import { clearMaintenanceSignal, getMaintenanceSignal, subscribeMaintenance } from "@/lib/platform/maintenance-signal";
import { cn } from "@/lib/utils";

export function PlatformStatusBanner({ variant = "app" }: { variant?: "app" | "public" }) {
  const t = useTranslations("platformStatus");
  const status = usePlatformStatus();
  const signal = useSyncExternalStore(subscribeMaintenance, getMaintenanceSignal, () => null);
  const { refetch } = status;
  const signalAt = signal?.at ?? null;

  // A refused call is fresher news than the last poll: ask again now.
  useEffect(() => {
    if (signalAt !== null) void refetch();
  }, [signalAt, refetch]);

  // The status endpoint, read after the refusal, says maintenance is over: forget the refusal.
  const readAfterSignal = signalAt !== null && status.dataUpdatedAt > signalAt;
  const statusSaysOff = status.data ? !status.data.maintenance.enabled : false;
  useEffect(() => {
    if (readAfterSignal && statusSaysOff) clearMaintenanceSignal();
  }, [readAfterSignal, statusSaysOff]);

  const enabled = status.data?.maintenance.enabled === true || (signal !== null && !(readAfterSignal && statusSaysOff));
  if (!enabled) return null;

  const message = status.data?.maintenance.message?.trim() || signal?.message || t("defaultMessage");
  const supportEmail = status.data?.supportEmail?.trim() || null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-full items-start gap-2.5 border-b border-amber-500/30 bg-amber-50 px-4 py-2 text-[13px] text-amber-950 dark:bg-amber-500/15 dark:text-amber-100",
        variant === "public" && "fixed inset-x-0 top-0 z-[60] shadow-sm",
      )}
    >
      <Wrench size={16} weight="duotone" className="mt-0.5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{t("maintenanceTitle")}</span>
        <span className="mx-1.5 opacity-50">·</span>
        <span>{message}</span>
        {supportEmail ? (
          <span className="ml-1.5">
            {t.rich("contact", {
              email: supportEmail,
              link: (chunks) => (
                <a href={`mailto:${supportEmail}`} className="font-medium underline underline-offset-2">
                  {chunks}
                </a>
              ),
            })}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * Whether to offer "Sign in with Google". Shown until the platform says otherwise, and kept when
 * the status call fails: hiding a working sign-in because a status poll timed out would be worse
 * than showing one the server then refuses with its own message.
 */
export function useGoogleSignInOffered(): boolean {
  const status = usePlatformStatus();
  return status.data?.googleSignInEnabled !== false;
}
