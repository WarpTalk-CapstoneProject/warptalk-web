"use client";

import { useState } from "react";
import { ArrowSquareOut, PlugsConnected, X } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

export type PluginConnectionAction = {
  type: "plugin_connection_required";
  pluginKey: string;
  pluginLabel: string;
  connectionStatus: "not_connected" | "expired" | "revoked" | string;
  connectedAccountEmail?: string | null;
  message?: string | null;
};

export function parsePluginConnectionAction(json: string): PluginConnectionAction | null {
  try {
    const parsed = JSON.parse(json) as { pluginConnection?: unknown };
    const action = parsed?.pluginConnection;
    if (!action || typeof action !== "object") return null;
    const candidate = action as Partial<PluginConnectionAction>;
    if (
      candidate.type !== "plugin_connection_required"
      || typeof candidate.pluginKey !== "string"
      || !candidate.pluginKey.trim()
      || typeof candidate.pluginLabel !== "string"
      || !candidate.pluginLabel.trim()
      || typeof candidate.connectionStatus !== "string"
      || !candidate.connectionStatus.trim()
    ) {
      return null;
    }

    return {
      type: "plugin_connection_required",
      pluginKey: candidate.pluginKey.trim(),
      pluginLabel: candidate.pluginLabel.trim(),
      connectionStatus: candidate.connectionStatus.trim(),
      connectedAccountEmail:
        typeof candidate.connectedAccountEmail === "string"
          ? candidate.connectedAccountEmail
          : null,
      message: typeof candidate.message === "string" ? candidate.message : null,
    };
  } catch {
    return null;
  }
}

export function PluginConnectionActionCard({
  action,
  onDismiss,
  onConnect,
  disabled,
  className,
}: {
  action: PluginConnectionAction;
  onDismiss: () => void;
  onConnect: (pluginKey: string) => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [connecting, setConnecting] = useState(false);

  if (dismissed) return null;

  const isReconnect = action.connectionStatus === "expired" || action.connectionStatus === "revoked";
  const buttonLabel = connecting ? "Opening..." : isReconnect ? "Reconnect" : "Connect";
  const message =
    action.message?.trim()
    || (isReconnect
      ? `Reconnect ${action.pluginLabel} before WarpBot can use it for this request.`
      : `Connect ${action.pluginLabel} before WarpBot can use it for this request.`);

  async function handleDismiss() {
    setDismissed(true);
    onDismiss();
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      await onConnect(action.pluginKey);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface-1 p-3 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-ink">
          <PlugsConnected size={18} weight="duotone" />
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
              {action.connectedAccountEmail ? (
                <p className="mt-1 truncate text-[11px] text-ink-subtle">
                  {action.connectedAccountEmail}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss plugin connection prompt"
              onClick={handleDismiss}
              className="grid size-7 shrink-0 place-items-center rounded-md text-ink-subtle transition hover:bg-surface-2 hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex h-8 items-center rounded-full border border-border px-3 text-[12px] font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink"
            >
              Not now
            </button>
            <button
              type="button"
              disabled={disabled || connecting}
              onClick={handleConnect}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-[12px] font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {buttonLabel}
              <ArrowSquareOut size={13} weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
