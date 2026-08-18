"use client";

import { useEffect, useRef, useState } from "react";
import { PlusMinus, WarningCircle, CheckCircle } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { billingService } from "@/services/billing.service";
import { getErrorMessage } from "@/lib/api/errors";
import { useAdminWorkspaceDirectory } from "@/hooks/use-admin-workspaces";

const MAX_CREDIT_ADJUSTMENT = 1_000_000;

interface CreditAdjustmentConfirmation {
  workspaceId: string;
  workspaceName: string;
  amount: number;
  reason: string;
}

export function AdjustCreditModal({ workspaceId }: { workspaceId?: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [inputWorkspaceId, setInputWorkspaceId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmation, setConfirmation] =
    useState<CreditAdjustmentConfirmation | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The picker replaces a paste-a-UUID field: nobody carries workspace ids in their head, and a
   * typo'd UUID silently adjusted the wrong tenant. Only fetched while the dialog is open and
   * only when no workspaceId was pinned by the page. Suspended workspaces are listed too — a
   * suspension is precisely when a compensating adjustment happens.
   */
  const directoryQuery = useAdminWorkspaceDirectory(
    { page: 1, pageSize: 200, sort: "name_asc" },
    { enabled: open && !workspaceId },
  );
  const workspaceOptions = (directoryQuery.data?.items ?? []).filter(
    (workspace) => workspace.status !== "deleted",
  );

  useEffect(
    () => () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    },
    [],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (confirmation) {
      setIsLoading(true);
      try {
        await billingService.adjustCredits(
          confirmation.workspaceId,
          confirmation.amount,
          confirmation.reason,
        );
        queryClient.invalidateQueries({ queryKey: ["billing"] });
        setSuccess(
          `Successfully adjusted ${confirmation.amount > 0 ? "+" : ""}${confirmation.amount} credits.`,
        );
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => {
          setOpen(false);
          setAmount("");
          setReason("");
          setInputWorkspaceId("");
          setConfirmation(null);
          setSuccess("");
        }, 1500);
      } catch (err: unknown) {
        setError(
          getErrorMessage(err, "Failed to adjust credits. Please try again."),
        );
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const targetWorkspaceId = workspaceId || inputWorkspaceId;
    if (!targetWorkspaceId) {
      setError("Choose a workspace.");
      return;
    }
    const selectedWorkspace = workspaceOptions.find((w) => w.id === targetWorkspaceId);
    const workspaceName = selectedWorkspace
      ? `${selectedWorkspace.name} (${selectedWorkspace.slug})`
      : targetWorkspaceId;

    const numericAmount = Number(amount);
    if (
      !amount ||
      !Number.isFinite(numericAmount) ||
      !Number.isInteger(numericAmount) ||
      numericAmount === 0
    ) {
      setError("Please enter a valid whole-number amount (non-zero).");
      return;
    }

    if (Math.abs(numericAmount) > MAX_CREDIT_ADJUSTMENT) {
      setError(
        `A single adjustment cannot exceed ${MAX_CREDIT_ADJUSTMENT.toLocaleString()} credits.`,
      );
      return;
    }

    if (!reason.trim()) {
      setError("Reason is required for audit trail.");
      return;
    }

    setConfirmation({
      workspaceId: targetWorkspaceId,
      workspaceName,
      amount: numericAmount,
      reason: reason.trim(),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
          setError("");
          setSuccess("");
          setConfirmation(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button className="rounded-md h-9 px-4 bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm" />
        }
      >
        <PlusMinus className="mr-2 h-4 w-4" /> Adjust Credits
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-surface-1 border-hairline shadow-linear rounded-xl p-0 overflow-hidden">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-medium text-ink">
              Adjust Credits
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-2">
              Manually add or remove credits.
              {workspaceId ? ` Target: ${workspaceId}` : ""} This action will be
              recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">
                <WarningCircle className="h-4 w-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-semantic-success/10 text-semantic-success text-sm border border-semantic-success/20">
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                <p>{success}</p>
              </div>
            )}

            {confirmation ? (
              <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-ink">
                <p className="font-medium">Confirm this credit adjustment</p>
                <p className="break-all text-xs text-muted-foreground">
                  Workspace: {confirmation.workspaceName}
                </p>
                <p className="text-lg font-semibold">
                  {confirmation.amount > 0 ? "+" : ""}
                  {confirmation.amount.toLocaleString()} credits
                </p>
                <p className="text-xs text-muted-foreground">
                  Reason: {confirmation.reason}
                </p>
              </div>
            ) : null}

            {!workspaceId && (
              <div className="space-y-2">
                <Label
                  htmlFor="workspaceId"
                  className="text-sm font-medium text-ink"
                >
                  Workspace
                </Label>
                <select
                  id="workspaceId"
                  value={inputWorkspaceId}
                  onChange={(e) => setInputWorkspaceId(e.target.value)}
                  disabled={Boolean(confirmation) || directoryQuery.isPending}
                  className={`h-10 w-full rounded-md border bg-surface-2 px-3 text-sm text-ink outline-none ${error && !inputWorkspaceId ? "border-destructive focus-visible:ring-2 focus-visible:ring-destructive" : "border-hairline focus-visible:ring-2 focus-visible:ring-primary-focus"}`}
                >
                  <option value="">
                    {directoryQuery.isPending
                      ? "Loading workspaces…"
                      : directoryQuery.isError
                        ? "Workspaces could not be loaded"
                        : "Choose a workspace…"}
                  </option>
                  {workspaceOptions.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name} ({workspace.slug})
                      {workspace.status === "suspended" ? " — suspended" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-sm font-medium text-ink">
                Amount
              </Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  step="1"
                  min={-MAX_CREDIT_ADJUSTMENT}
                  max={MAX_CREDIT_ADJUSTMENT}
                  placeholder="e.g. 500 or -500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={Boolean(confirmation)}
                  className={`pl-3 bg-surface-2 border ${error && (!amount || Number(amount) === 0) ? "border-destructive focus-visible:ring-destructive" : "border-hairline focus-visible:ring-primary-focus"} rounded-md h-10`}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Use negative values to deduct credits.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm font-medium text-ink">
                Reason (Required)
              </Label>
              <Input
                id="reason"
                placeholder="e.g. Compensation for downtime"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={Boolean(confirmation)}
                className={`bg-surface-2 border ${error && !reason.trim() ? "border-destructive focus-visible:ring-destructive" : "border-hairline focus-visible:ring-primary-focus"} rounded-md h-10`}
              />
            </div>

            <DialogFooter className="mt-8 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  confirmation ? setConfirmation(null) : setOpen(false)
                }
                className="rounded-md border-hairline bg-surface-2 text-ink hover:bg-surface-3"
              >
                {confirmation ? "Back" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !!success}
                className="rounded-md bg-primary hover:bg-primary-hover text-primary-foreground"
              >
                {isLoading
                  ? "Processing..."
                  : confirmation
                    ? "Confirm Adjustment"
                    : "Review Adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
