"use client";

/**
 * /admin/settings — the platform settings console. The page is only the Suspense boundary the
 * console's URL state (useSearchParams) needs; everything else lives in
 * src/components/admin/settings/ (see platform-settings-console.tsx for what is where and why).
 *
 * History: this route used to be two pages (settings + configuration), merged 2026-09-16 into
 * "knobs first, reference data second". It is now the registry-backed console; the billing
 * policy, pricing economics (with <FxRateRow>), language catalog and voice-consent panels moved
 * into the console's Billing and Meetings categories unchanged.
 */

import { Suspense } from "react";

import { PlatformSettingsConsole } from "@/components/admin/settings/platform-settings-console";

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <PlatformSettingsConsole />
    </Suspense>
  );
}
