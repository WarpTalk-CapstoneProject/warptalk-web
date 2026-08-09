"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { billingService } from "@/services/billing.service";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { CheckoutSessionDto, SubscriptionDto } from "@/types/billing";
import { CheckCircle } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/currency";

const REDIRECT_SECONDS = 8;
const MAX_POLL_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 1500;

function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");

  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId,
  );
  const activeWorkspaceSlug = useWorkspaceStore(
    (state) => state.activeWorkspaceSlug,
  );

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<CheckoutSessionDto | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(null);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  // workspaceId extracted from session metadata (not from store — store is unavailable here)
  const workspaceIdFromSession = useRef<string | null>(null);

  const returnLink = activeWorkspaceSlug
    ? `/${activeWorkspaceSlug}/settings/billing`
    : "/";

  // Fetch session info (amount, transaction id) — one-time
  useEffect(() => {
    const fetchSession = async () => {
      try {
        if (sessionId) {
          const data = await billingService.getCheckoutSession(sessionId);
          setSession(data);
          // Extract workspaceId from Stripe metadata
          const wid = data.metadata?.WorkspaceId ?? null;
          workspaceIdFromSession.current = wid;
        }
      } catch {
        // Non-fatal: still show success page without session details
      }
    };
    fetchSession();
  }, [sessionId]);

  // Poll for subscription until it becomes active (webhook may have a small delay)
  // Starts after session is fetched and workspaceId is known
  useEffect(() => {
    // Use workspaceId from store if available, fall back to session metadata
    const wid = activeWorkspaceId ?? workspaceIdFromSession.current;
    if (!wid) return;

    const pollSubscription = async () => {
      try {
        const sub = await billingService.getActiveSubscription(wid);
        if (sub && sub.status === "active") {
          setSubscription(sub);
          setLoading(false);
          return; // Stop polling — subscription is live
        }
      } catch {
        // Not ready yet — keep polling
      }

      pollCountRef.current += 1;
      if (pollCountRef.current < MAX_POLL_ATTEMPTS) {
        setTimeout(pollSubscription, POLL_INTERVAL_MS);
      } else {
        // Give up after MAX attempts — still show success without credits
        setLoading(false);
      }
    };

    pollSubscription();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, session]); // re-run when session is fetched (gives us workspaceId from metadata)


  // Start countdown only after loading resolves
  useEffect(() => {
    if (loading) return;

    timerRef.current = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  // Navigate when countdown hits 0
  useEffect(() => {
    if (countdown === 0) {
      router.push(returnLink);
    }
  }, [countdown, returnLink, router]);

  const currency = session?.currency?.toUpperCase() || "VND";

  // Amount: Stripe VND is zero-decimal (no /100 needed)
  const rawAmount = session?.amountTotal ?? 0;
  const amountPaid = currency === "VND" ? rawAmount : rawAmount / 100;
  const formattedAmount =
    currency === "VND"
      ? formatMoney(amountPaid, "VND")
      : `$${amountPaid.toFixed(2)}`;

  const transactionId = session?.paymentIntentId || session?.id || null;
  const currentCredits = subscription?.creditsRemaining ?? null;

  const planName = session?.metadata?.PlanSlug
    ? session.metadata.PlanSlug.charAt(0).toUpperCase() +
      session.metadata.PlanSlug.slice(1)
    : null;

  if (loading) {
    return (
      <Card className="w-full max-w-md rounded-xl border-hairline bg-surface-1 shadow-linear p-8 flex flex-col items-center justify-center text-center min-h-[280px]">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <h2 className="text-xl font-semibold text-ink">Confirming payment...</h2>
        <p className="text-sm text-ink-muted mt-2">
          Waiting for subscription to activate. This may take a few seconds.
        </p>
        <p className="text-xs text-ink-muted/60 mt-3">
          Attempt {Math.min(pollCountRef.current + 1, MAX_POLL_ATTEMPTS)} of{" "}
          {MAX_POLL_ATTEMPTS}
        </p>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md rounded-xl border-hairline bg-surface-1 shadow-linear overflow-hidden">
      {/* Success header */}
      <div className="bg-surface-2 p-8 flex flex-col items-center text-center border-b border-hairline">
        <div className="h-16 w-16 bg-semantic-success/10 rounded-full flex items-center justify-center mb-4">
          <CheckCircle
            className="h-10 w-10 text-semantic-success"
            weight="fill"
          />
        </div>
        <h1 className="text-2xl font-semibold text-ink">Payment Successful!</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {planName
            ? `Your workspace has been upgraded to the ${planName} plan.`
            : "Your workspace has been successfully updated."}
        </p>
      </div>

      <CardContent className="p-6">
        {/* Receipt rows */}
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
            <span className="text-sm text-muted-foreground">Amount Paid</span>
            <span className="text-sm font-semibold text-ink">
              {amountPaid > 0 ? (
                formattedAmount
              ) : (
                <span className="text-ink-muted italic text-xs">
                  See invoice
                </span>
              )}
            </span>
          </div>
          <div className="flex justify-between items-center px-4 py-3 border-t border-hairline">
            <span className="text-sm text-muted-foreground">
              Current Credit Balance
            </span>
            <span className="text-sm font-semibold text-semantic-success">
              {currentCredits !== null ? (
                currentCredits.toLocaleString() + " cr"
              ) : (
                <span className="text-ink-muted italic text-xs">
                  Check billing page
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Countdown auto-redirect notice */}
        <div className="text-center mb-4">
          <p className="text-xs text-ink-muted">
            Redirecting to billing in{" "}
            <span className="font-semibold text-ink tabular-nums">
              {countdown}s
            </span>
            ...
          </p>
          <div className="mt-2 h-1 w-full bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${((REDIRECT_SECONDS - countdown) / REDIRECT_SECONDS) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* CTA buttons */}
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
            <h2 className="text-xl font-semibold text-ink">
              Loading details...
            </h2>
          </Card>
        }
      >
        <SuccessContent />
      </Suspense>
    </div>
  );
}
