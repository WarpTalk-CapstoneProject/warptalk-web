"use client";

/**
 * /admin/account — the staff member's own profile and plugin connections. The view lives in
 * src/components/admin/account/; this is only the Suspense boundary useSearchParams needs.
 */

import { Suspense } from "react";

import { AdminAccountSettings } from "@/components/admin/account/admin-account-settings";

export default function AdminAccountPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <AdminAccountSettings />
    </Suspense>
  );
}
