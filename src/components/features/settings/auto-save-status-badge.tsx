"use client";

import { Check, WarningCircle, ArrowClockwise, Spinner } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import type { AutoSaveStatus } from "@/hooks/use-auto-save";

type AutoSaveStatusBadgeProps = {
  status: AutoSaveStatus;
  onRetry?: () => void;
  invalid?: boolean;
};

export function AutoSaveStatusBadge({ status, onRetry, invalid = false }: AutoSaveStatusBadgeProps) {
  if (invalid || status === "error") {
    return (
      <Badge variant="destructive" role="status" aria-live="polite">
        <WarningCircle weight="fill" />
        Changes not saved
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-1 inline-flex items-center gap-1 underline underline-offset-2"
          >
            <ArrowClockwise />
            Retry
          </button>
        )}
      </Badge>
    );
  }

  if (status === "saving") {
    return (
      <Badge variant="outline" role="status" aria-live="polite" className="text-ink-muted">
        <Spinner className="animate-spin" />
        Saving changes...
      </Badge>
    );
  }

  return (
    <Badge variant="outline" role="status" aria-live="polite" className="border-emerald-500/30 text-emerald-600">
      <Check weight="bold" />
      All changes saved
    </Badge>
  );
}
