"use client";

import { useState } from "react";
import { PlusMinus, WarningCircle } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdjustCreditModal() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!amount || isNaN(Number(amount)) || Number(amount) === 0) {
      setError("Please enter a valid amount (non-zero).");
      return;
    }
    
    if (!reason.trim()) {
      setError("Reason is required for audit trail.");
      return;
    }
    
    setError("");
    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      setOpen(false);
      // Reset form
      setAmount("");
      setReason("");
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="rounded-md h-9 px-4 bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm" />}>
        <PlusMinus className="mr-2 h-4 w-4" /> Adjust Credits
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-surface-1 border-hairline shadow-linear rounded-xl p-0 overflow-hidden">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-medium text-ink">Adjust Credits</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-2">
              Manually add or remove credits for this workspace. This action will be recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">
                <WarningCircle className="h-4 w-4" />
                <p>{error}</p>
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
              <Button type="submit" disabled={isLoading} className="rounded-md bg-primary hover:bg-primary-hover text-primary-foreground">
                {isLoading ? "Processing..." : "Submit Adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
