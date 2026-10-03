"use client";

/**
 * /admin/warpbot-tools — what WarpBot can do on this platform, and how it has gone (design
 * 6tiXws9F). Two tabs in the URL: `?tab=catalog|usage&period=today|7d|30d|180d`.
 *
 * The page is only the Suspense boundary the URL state (useSearchParams) needs; the view lives in
 * src/components/admin/warpbot-tools/.
 */

import { Suspense } from "react";

import { WarpbotToolsAdmin } from "@/components/admin/warpbot-tools/warpbot-tools-admin";

export default function AdminWarpbotToolsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <WarpbotToolsAdmin />
    </Suspense>
  );
}
