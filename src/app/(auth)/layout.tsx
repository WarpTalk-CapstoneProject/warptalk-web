import type { ReactNode } from "react";

import { PlatformStatusBanner } from "@/components/platform/platform-status-banner";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Sign-in stays open during maintenance (the gateway exempts /auth), so this is where most
          people first learn the rest of the app is paused. */}
      <PlatformStatusBanner variant="public" />
      {children}
    </>
  );
}
