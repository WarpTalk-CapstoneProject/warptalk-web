"use client";

import { useState } from "react";
import { PlusMinus, WarningCircle, CheckCircle } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { billingService } from "@/services/billing.service";

export function AdjustCreditModal({ workspaceId }: { workspaceId?: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [inputWorkspaceId, setInputWorkspaceId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const targetWorkspaceId = workspaceId || inputWorkspaceId.trim();
    if (!targetWorkspaceId) {
      setError("Workspace ID is required.");
      return;
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) === 0) {
      setError("Please enter a valid amount (non-zero).");
      return;
    }

    if (!reason.trim()) {
      setError("Reason is required for audit trail.");
      return;
    }

    setIsLoading(true);
    try {
      await billingService.adjustCredits(targetWorkspaceId, Number(amount), reason.trim());
      // Invalidate relevant queries so Audit Trail refreshes
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      setSuccess(`Successfully adjusted ${Number(amount) > 0 ? "+" : ""}${Number(amount)} credits.`);
      // Reset form after short delay
      setTimeout(() => {
        setOpen(false);
        setAmount("");
        setReason("");
        setInputWorkspaceId("");
        setSuccess("");
      }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to adjust credits. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setError(""); setSuccess(""); } }}>
      <DialogTrigger render={<Button className="rounded-md h-9 px-4 bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm" />}>
        <PlusMinus className="mr-2 h-4 w-4" /> Adjust Credits
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-surface-1 border-hairline shadow-linear rounded-xl p-0 overflow-hidden">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-medium text-ink">Adjust Credits</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-2">
              Manually add or remove credits.{workspaceId ? ` Target: ${workspaceId}` : ""} This action will be recorded in the audit trail.
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
            
            {!workspaceId && (
              <div className="space-y-2">
                <Label htmlFor="workspaceId" className="text-sm font-medium text-ink">Workspace ID</Label>
                <Input
                  id="workspaceId"
                  placeholder="e.g. paste workspace UUID here"
                  value={inputWorkspaceId}
                  onChange={(e) => setInputWorkspaceId(e.target.value)}
                  className={`bg-surface-2 border ${error && !inputWorkspaceId.trim() ? "border-destructive focus-visible:ring-destructive" : "border-hairline focus-visible:ring-primary-focus"} rounded-md h-10 font-mono text-sm`}
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-sm font-medium text-ink">Amount</Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  placeholder="e.g. 500 or -500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`pl-3 bg-surface-2 border ${error && (!amount || Number(amount) === 0) ? "border-destructive focus-visible:ring-destructive" : "border-hairline focus-visible:ring-primary-focus"} rounded-md h-10`}
                />
              </div>
              <p className="text-xs text-muted-foreground">Use negative values to deduct credits.</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm font-medium text-ink">Reason (Required)</Label>
              <Input
                id="reason"
                placeholder="e.g. Compensation for downtime"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={`bg-surface-2 border ${error && !reason.trim() ? "border-destructive focus-visible:ring-destructive" : "border-hairline focus-visible:ring-primary-focus"} rounded-md h-10`}
              />
            </div>
            
            <DialogFooter className="mt-8 gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="rounded-md border-hairline bg-surface-2 text-ink hover:bg-surface-3">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !!success} className="rounded-md bg-primary hover:bg-primary-hover text-primary-foreground">
                {isLoading ? "Processing..." : "Submit Adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
