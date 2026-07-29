"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle } from "@phosphor-icons/react";
import { billingService } from "@/services/billing.service";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { CheckoutSessionDto, SubscriptionDto } from "@/types/billing";

const REDIRECT_SECONDS = 6;
const PAYMENT_VERIFY_TIMEOUT_MS = 8_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Payment verification timed out.")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");

  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);

  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSessionDto | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const returnLink = activeWorkspaceSlug ? `/${activeWorkspaceSlug}/billing` : "/";

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        let workspaceId = activeWorkspaceId;

        try {
          const session = await withTimeout(
            billingService.getCheckoutSession(sessionId),
            PAYMENT_VERIFY_TIMEOUT_MS,
          );
          if (cancelled) return;
          setCheckoutSession(session);
          workspaceId =
            workspaceId ||
            session.metadata?.WorkspaceId ||
            session.metadata?.workspaceId ||
            null;
        } catch (err) {
          if (cancelled) return;
          const message =
            err instanceof Error ? err.message : "Payment verification is still pending.";
          setVerificationError(message);
        }

        if (workspaceId) {
          try {
            const sub = await withTimeout(
              billingService.getActiveSubscription(workspaceId),
              PAYMENT_VERIFY_TIMEOUT_MS,
            );
            if (cancelled) return;
            setSubscription(sub);
          } catch {
            // Subscription might not be ready yet - non-fatal.
          }
        }
      } catch {
        // Non-fatal: still show success page without details.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    const timeoutId = sessionId
      ? window.setTimeout(() => {
          if (cancelled) return;
          setVerificationError("Payment verification timed out.");
          setLoading(false);
        }, PAYMENT_VERIFY_TIMEOUT_MS + 500)
      : undefined;

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [sessionId, activeWorkspaceId]);

  useEffect(() => {
    if (loading) return;

    timerRef.current = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  useEffect(() => {
    if (countdown === 0) {
      router.push(returnLink);
    }
  }, [countdown, returnLink, router]);

  const transactionId = checkoutSession?.id || sessionId;
  const planName = subscription?.planName ?? null;
  const paymentStatus = checkoutSession?.paymentStatus || (verificationError ? "pending" : "paid");
  const isPaymentConfirmed = paymentStatus.toLowerCase() === "paid";

  if (loading) {
    return (
      <Card className="w-full max-w-md rounded-xl border-hairline bg-surface-1 shadow-linear p-8 flex flex-col items-center justify-center text-center min-h-[260px]">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <h2 className="text-xl font-semibold text-ink">Verifying payment...</h2>
        <p className="text-sm text-ink-muted mt-2">
          Please wait while we confirm your transaction details.
        </p>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md rounded-xl border-hairline bg-surface-1 shadow-linear overflow-hidden">
      <div className="bg-surface-2 p-8 flex flex-col items-center text-center border-b border-hairline">
        <div className="h-16 w-16 bg-semantic-success/10 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="h-10 w-10 text-semantic-success" weight="fill" />
        </div>
        <h1 className="text-2xl font-semibold text-ink">Payment Successful!</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {verificationError
            ? "Stripe redirected successfully. Payment verification is still pending locally."
            : planName
              ? `Your workspace has been upgraded to the ${planName} plan.`
              : "Your workspace has been successfully updated."}
        </p>
      </div>

      <CardContent className="p-6">
        <div className="space-y-0 mb-6 rounded-lg border border-hairline overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 bg-surface-2/50">
            <span className="text-sm text-muted-foreground">Transaction ID</span>
            <span className="text-sm font-mono text-ink text-right break-all max-w-[200px]">
              {transactionId ? (
                transactionId.length > 20 ? (
                  `...${transactionId.slice(-12)}`
                ) : (
                  transactionId
                )
              ) : (
                <span className="text-ink-muted italic text-xs">Pending</span>
              )}
            </span>
          </div>
          {planName && (
            <div className="flex justify-between items-center px-4 py-3 border-t border-hairline">
              <span className="text-sm text-muted-foreground">Plan</span>
              <span className="text-sm font-medium text-ink">{planName}</span>
            </div>
          )}
          <div className="flex justify-between items-center px-4 py-3 border-t border-hairline">
            <span className="text-sm text-muted-foreground">Status</span>
            <span className="text-sm font-semibold text-ink">
              {isPaymentConfirmed
                ? "Payment confirmation received"
                : "Payment verification pending"}
            </span>
          </div>
          {checkoutSession?.amountTotal !== undefined && checkoutSession.amountTotal !== null && (
            <div className="flex justify-between items-center px-4 py-3 border-t border-hairline">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="text-sm font-medium text-ink">
                {checkoutSession.amountTotal.toLocaleString()} {checkoutSession.currency.toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center px-4 py-3 border-t border-hairline">
            <span className="text-sm text-muted-foreground">Cycle Credits Available</span>
            <span className="text-sm font-semibold text-semantic-success">
              {subscription?.creditsRemaining !== undefined ? (
                subscription.creditsRemaining.toLocaleString()
              ) : (
                <span className="text-ink-muted italic text-xs">Processing...</span>
              )}
            </span>
          </div>
        </div>

        <div className="text-center mb-4">
          <p className="text-xs text-ink-muted">
            Redirecting to billing in{" "}
            <span className="font-semibold text-ink tabular-nums">{countdown}s</span>
            ...
          </p>
          <div className="mt-2 h-1 w-full bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${((REDIRECT_SECONDS - countdown) / REDIRECT_SECONDS) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Link href={returnLink} className="w-full">
            <Button className="w-full rounded-md h-10 bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm cursor-pointer">
              Go to Billing
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-4">
      <Suspense
        fallback={
          <Card className="w-full max-w-md rounded-xl border-hairline bg-surface-1 shadow-linear p-8 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
            <h2 className="text-xl font-semibold text-ink">Loading details...</h2>
          </Card>
        }
      >
        <SuccessContent />
      </Suspense>
    </div>
  );
}
