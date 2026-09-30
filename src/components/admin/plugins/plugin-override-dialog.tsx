"use client";

/**
 * Confirms Enable / Disable / Reset of a plugin on one or many workspaces, with the reason the
 * audit log records. Shared by the plugin's "Workspaces" tab and the workspace's "Plugins" tab.
 *
 * The server records every workspace in the audit log before it commits and refuses the whole
 * change if it cannot — so a failure here means nothing changed, and the copy says so.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/api/errors";
import { overrideReasonError, PLUGIN_OVERRIDE_REASON_MAX } from "@/lib/admin/plugin-workspace-access";
import type { PluginOverrideAction } from "@/types/admin-plugin-workspaces";

export function PluginOverrideDialog({
  action,
  target,
  onOpenChange,
  onSubmit,
  isSaving,
  extra,
}: {
  /** Null while closed. */
  action: PluginOverrideAction | null;
  /** What is being changed, already phrased: "Acme", "3 workspaces", "Notion in Acme". */
  target: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<unknown>;
  isSaving: boolean;
  /** Extra controls above the reason (the plan picker of an apply-to-plan). */
  extra?: React.ReactNode;
}) {
  return (
    <Dialog open={action !== null} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-md">
        {action ? (
          <OverrideForm
            // Keyed on the target only: switching the action in an apply-to-plan keeps the reason typed.
            key={target}
            action={action}
            target={target}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            isSaving={isSaving}
            extra={extra}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function OverrideForm({
  action,
  target,
  onCancel,
  onSubmit,
  isSaving,
  extra,
}: {
  action: PluginOverrideAction;
  target: string;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
  isSaving: boolean;
  extra?: React.ReactNode;
}) {
  const t = useTranslations("adminPlugins.workspaceAccess.dialog");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const reasonError = overrideReasonError(action, reason);

  const submit = async () => {
    setTouched(true);
    if (reasonError) return;
    setServerError(null);
    try {
      await onSubmit(reason.trim());
    } catch (error) {
      setServerError(getErrorMessage(error, t("failed")));
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <DialogHeader className="px-5 pt-5">
        <DialogTitle>{t(`${action}.title`, { target })}</DialogTitle>
        <DialogDescription>{t(`${action}.body`)}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3 px-5 py-4">
        {extra}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plugin-override-reason">
            {action === "disable" ? t("reasonRequired") : t("reasonOptional")}
          </Label>
          <Textarea
            id="plugin-override-reason"
            value={reason}
            maxLength={PLUGIN_OVERRIDE_REASON_MAX}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reasonPlaceholder")}
            rows={3}
          />
          {touched && reasonError ? (
            <p className="text-[12px] text-destructive">{t(`errors.${reasonError}`)}</p>
          ) : null}
        </div>
        {serverError ? <p className="text-[12px] text-destructive">{serverError}</p> : null}
      </div>
      <DialogFooter className="px-5 pb-5">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant={action === "disable" ? "destructive" : "default"} disabled={isSaving}>
          {isSaving ? t("saving") : t(`${action}.confirm`)}
        </Button>
      </DialogFooter>
    </form>
  );
}
