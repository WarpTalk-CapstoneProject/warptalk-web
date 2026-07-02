"use client";

import { XCircle, ArrowCounterClockwise, ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWorkspaceStore } from "@/stores/workspace-store";

export default function PaymentCancelledPage() {
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const billingLink = activeWorkspaceSlug ? `/${activeWorkspaceSlug}/billing` : "/";
  const plansLink = activeWorkspaceSlug ? `/${activeWorkspaceSlug}/payment/plans` : "/";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md rounded-xl border-hairline bg-surface-1 shadow-linear overflow-hidden">
        <div className="bg-surface-2 p-8 flex flex-col items-center text-center border-b border-hairline">
          <div className="h-16 w-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
            <XCircle className="h-10 w-10 text-red-500" weight="fill" />
          </div>
          <h1 className="text-2xl font-semibold text-ink">Payment Cancelled</h1>
          <p className="text-sm text-muted-foreground mt-2">
            The checkout session was cancelled. No charges were made to your account.
          </p>
        </div>

        <CardContent className="p-6">
          <p className="text-sm text-ink-muted text-center mb-6">
            If you experienced issues during checkout, you can try again or contact support for assistance.
          </p>

          <div className="flex flex-col gap-3">
            <Link href={plansLink} className="w-full">
              <Button className="w-full rounded-md h-10 bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm cursor-pointer inline-flex items-center gap-2">
                <ArrowCounterClockwise className="h-4 w-4" />
                Try Again
              </Button>
            </Link>
            <Link href={billingLink} className="w-full">
              <Button
                variant="outline"
                className="w-full rounded-md h-10 border-hairline bg-surface-1 hover:bg-surface-2 text-ink cursor-pointer inline-flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Billing
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}