"use client";

import { ProvidersDashboard } from "@/components/admin/providers/providers-dashboard";

/** External providers: usage, cost, live rate and 90-day uptime. The admin layout enforces the system-admin gate. */
export default function AdminProvidersPage() {
  return <ProvidersDashboard />;
}
