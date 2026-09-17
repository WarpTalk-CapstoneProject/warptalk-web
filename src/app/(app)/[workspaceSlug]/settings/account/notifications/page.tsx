"use client";

/**
 * Notifications — which channels may reach you.
 *
 * WHAT THE SERVICE ACTUALLY STORES
 *   Three account-wide switches (email, push, in-app) on one row per user. There is no per-type
 *   setting: `notification_type` exists on the table but only ever holds SYSTEM, so a page of
 *   per-event toggles would be switches for columns that do not exist.
 *
 * WHAT THE SERVICE ACTUALLY ENFORCES — SAID ON THE PAGE, NOT JUST HERE
 *   Only `emailEnabled` is read by delivery: NotificationService checks it before sending mail.
 *   Nothing reads `pushEnabled` or `inAppEnabled` yet — the bell and the realtime toasts arrive
 *   regardless. Both switches still save, because the preference is real and will be honoured
 *   when delivery learns to read it, but each row says it is not applied yet. A switch that
 *   silently does nothing is the thing this repo keeps having to un-ship.
 *
 * WHY A USER WITH NO ROW CAN SAVE
 *   PUT used to 404 without a row; the notification service now creates the default row (every
 *   channel on) on GET and on PUT.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner, Warning } from "@phosphor-icons/react";

import { WorkspacePage } from "@/components/workspace/page-chrome";
import { Switch } from "@/components/ui/switch";
import { AutoSaveStatusBadge } from "@/components/features/settings/auto-save-status-badge";
import { useAutoSaveQueue } from "@/hooks/use-auto-save";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "@/hooks/use-notifications";
import { getErrorMessage } from "@/lib/api/errors";
import type { UpdateNotificationPreferenceRequest } from "@/types/notification";

type Channel = keyof Required<UpdateNotificationPreferenceRequest>;

const CHANNELS: { key: Channel; title: string; hint: string; enforced: boolean }[] = [
  {
    key: "emailEnabled",
    title: "Email",
    hint: "Send notifications to your account email address.",
    enforced: true,
  },
  {
    key: "pushEnabled",
    title: "Push",
    hint: "Browser and desktop push notifications.",
    enforced: false,
  },
  {
    key: "inAppEnabled",
    title: "In-app",
    hint: "The notification bell and pop-up alerts inside WarpTalk.",
    enforced: false,
  },
];

/** The band divider, as on Security. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
      {children}
    </div>
  );
}

function Row({
  title,
  hint,
  children,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="flex max-w-[70%] flex-col gap-0.5">
        <span className="text-xs font-semibold text-ink">{title}</span>
        {hint ? <span className="text-[11px] text-ink-muted">{hint}</span> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

export default function PersonalNotificationsPage() {
  const preferencesQuery = useNotificationPreferences();
  const updateMutation = useUpdateNotificationPreferences();

  /**
   * The switches on screen, seeded from the server once. A mirror rather than the query itself so
   * a Switch moves under the finger before the PUT returns, and a refetch cannot throw away an
   * edit still waiting in the save queue.
   */
  const [draft, setDraft] = useState<Record<Channel, boolean> | null>(null);
  const initializedRef = useRef(false);
  const lastQueuedRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const data = preferencesQuery.data;
    if (!data || initializedRef.current) return;
    setDraft({
      emailEnabled: data.emailEnabled,
      pushEnabled: data.pushEnabled,
      inAppEnabled: data.inAppEnabled,
    });
    lastQueuedRef.current = {
      emailEnabled: JSON.stringify(data.emailEnabled),
      pushEnabled: JSON.stringify(data.pushEnabled),
      inAppEnabled: JSON.stringify(data.inAppEnabled),
    };
    initializedRef.current = true;
  }, [preferencesQuery.data]);

  const savePatch = useCallback(
    (patch: UpdateNotificationPreferenceRequest) => updateMutation.mutateAsync(patch),
    [updateMutation],
  );

  const autoSave = useAutoSaveQueue<UpdateNotificationPreferenceRequest>({
    save: savePatch,
    onError: (error) => toast.error(getErrorMessage(error, "Failed to save notification settings.")),
  });

  const commit = (channel: Channel, value: boolean) => {
    setDraft((current) => (current ? { ...current, [channel]: value } : current));
    const serialized = JSON.stringify(value);
    if (lastQueuedRef.current[channel] === serialized) return;
    lastQueuedRef.current[channel] = serialized;
    // Only the switch that moved: the PUT is a patch, and sending all three would let a queued
    // older value overwrite a newer one for a channel nobody touched.
    autoSave.enqueue({ [channel]: value });
  };

  if (preferencesQuery.isPending) {
    return (
      <WorkspacePage>
        <div className="flex h-[80vh] items-center justify-center">
          <Spinner className="h-8 w-8 animate-spin text-primary" />
        </div>
      </WorkspacePage>
    );
  }

  // A failed load is not a set of preferences. Rendering all-on defaults here would let the first
  // switch someone touched save a fiction over their real choices.
  if (preferencesQuery.isError || !draft) {
    return (
      <WorkspacePage>
        <div className="flex h-[80vh] items-center justify-center px-4">
          <div className="flex max-w-md flex-col items-center gap-2 rounded-lg border border-hairline bg-surface-1 p-6 text-center shadow-linear">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Warning className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-ink">Couldn&apos;t load notification settings</p>
            <p className="text-xs text-ink-muted">
              Nothing is shown rather than defaults that may not be yours. Retry, and if it keeps
              failing check that the notification service is reachable.
            </p>
            <button
              type="button"
              onClick={() => preferencesQuery.refetch()}
              disabled={preferencesQuery.isFetching}
              className="mt-2 inline-flex h-9 items-center rounded-md border border-hairline bg-surface-2 px-4 text-xs font-semibold transition hover:bg-surface-3 disabled:opacity-60"
            >
              {preferencesQuery.isFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        </div>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 text-ink">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-bold tracking-tight text-ink">Notifications</h1>
              <p className="text-xs text-ink-muted">
                Choose which channels WarpTalk may use to reach you. These apply across every
                workspace.
              </p>
            </div>
            <AutoSaveStatusBadge status={autoSave.status} onRetry={autoSave.retry} />
          </div>

          <div className="flex flex-col gap-3">
            <SectionLabel>Channels</SectionLabel>
            <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface-1 shadow-linear">
              {CHANNELS.map((channel) => (
                <Row
                  key={channel.key}
                  title={
                    <span className="flex items-center gap-2">
                      {channel.title}
                      {!channel.enforced && (
                        <span className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                          Not applied yet
                        </span>
                      )}
                    </span>
                  }
                  hint={
                    channel.enforced
                      ? channel.hint
                      : `${channel.hint} Your choice is saved, but delivery does not read it yet.`
                  }
                >
                  <Switch
                    aria-label={`${channel.title} notifications`}
                    checked={draft[channel.key]}
                    onCheckedChange={(value) => commit(channel.key, value)}
                  />
                </Row>
              ))}
            </div>
          </div>
        </div>
      </div>
    </WorkspacePage>
  );
}
