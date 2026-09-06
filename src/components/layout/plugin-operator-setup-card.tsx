"use client";

import { useState } from "react";
import { LockKey, X } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

/**
 * A plugin whose provider supports no client-registration mechanism WarpTalk can use.
 *
 * Deliberately a separate card from the connect prompt rather than a variant of it. The
 * registration ladder has already been walked and exhausted, so pressing Connect walks it again
 * and lands the user back here - a loop with nothing in it explaining that an administrator has to
 * register an OAuth app first. There is no button because there is no action the user can take.
 */
export type PluginOperatorSetupAction = {
  type: "plugin_needs_operator_setup";
  pluginKey: string;
  pluginLabel: string;
  message?: string | null;
};

export function parsePluginOperatorSetupAction(json: string): PluginOperatorSetupAction | null {
  try {
    const parsed = JSON.parse(json) as { pluginOperatorSetup?: unknown };
    const action = parsed?.pluginOperatorSetup;
    if (!action || typeof action !== "object") return null;

    const candidate = action as Partial<PluginOperatorSetupAction>;
    if (
      candidate.type !== "plugin_needs_operator_setup"
      || typeof candidate.pluginKey !== "string"
      || !candidate.pluginKey.trim()
      || typeof candidate.pluginLabel !== "string"
      || !candidate.pluginLabel.trim()
    ) {
      return null;
    }

    return {
      type: "plugin_needs_operator_setup",
      pluginKey: candidate.pluginKey.trim(),
      pluginLabel: candidate.pluginLabel.trim(),
      message: typeof candidate.message === "string" ? candidate.message : null,
    };
  } catch {
    return null;
  }
}

export function PluginOperatorSetupCard({
  action,
  onDismiss,
  className,
}: {
  action: PluginOperatorSetupAction;
  onDismiss: () => void;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const message =
    action.message?.trim()
    || `${action.pluginLabel} needs an administrator to register an OAuth app before it can be connected.`;

  function handleDismiss() {
    setDismissed(true);
    onDismiss();
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface-1 p-3 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-ink-muted">
          <LockKey size={18} weight="duotone" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">
                {action.pluginLabel}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
                {message}
              </p>
            </div>
            <button
              type="button"
              aria-label="Dismiss plugin setup notice"
              onClick={handleDismiss}
              className="grid size-7 shrink-0 place-items-center rounded-md text-ink-subtle transition hover:bg-surface-2 hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
