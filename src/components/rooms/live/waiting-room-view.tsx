"use client";

import { SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

export function WaitingRoomView({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-canvas text-ink font-sans selection:bg-surface-3">
      <StatePanel
        icon={<SpinnerGap className="h-8 w-8 animate-spin text-primary" />}
        title="Waiting for Host"
        description="You are in the waiting room. The meeting will start when the host admits you."
      />
      <Button onClick={onRetry} className="mt-6 bg-surface-2 text-ink hover:bg-surface-3 border border-border shadow-sm">
        Refresh Status
      </Button>
    </div>
  );
}

export function StatePanel({ title, description, icon }: { title: string; description: string; icon?: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-canvas text-ink">
      <div className="flex flex-col items-center gap-3 text-center">
        {icon || <SpinnerGap className="h-8 w-8 animate-spin text-ink-subtle" />}
        <h1 className="text-[15px] font-medium">{title}</h1>
        <p className="text-[13px] text-ink-subtle max-w-sm">{description}</p>
      </div>
    </div>
  );
}
