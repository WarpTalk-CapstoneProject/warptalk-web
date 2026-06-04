"use client";

import { useEffect } from "react";

import { Interactive404 } from "@/components/errors/interactive-404";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled route error:", error);
  }, [error]);

  return <Interactive404 mode="error" onRetry={reset} />;
}
