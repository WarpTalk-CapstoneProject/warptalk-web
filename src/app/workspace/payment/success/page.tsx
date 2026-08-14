"use client";

/**
 * Where Stripe sends someone after they pay.
 *
 * WT-370 — WHY THIS PAGE IS THE BUG, NOT JUST THE MESSENGER
 *   A workspace owner paid ₫1,900,000, saw "Payment Successful!", and landed on a Billing page
 *   reading "No active subscription". The page had told them their workspace was upgraded and
 *   that the balance was "Pending webhook confirmation" — so the incident was filed as a webhook
 *   problem. The page had no evidence for either claim.
 *
 *   Three things were wrong here, and each one alone is enough to produce that report:
 *
 *   1. IT ASKED ONCE. Activation is not instant — GET /payments/checkout-session/{id} retrieves
 *      the session from Stripe, verifies the caller's workspace role, writes the subscription,
 *      the payment, the invoice and the credit grant, then publishes. Reading the subscription
 *      immediately after page load and never again turns a slow success into a permanent failure.
 *
 *   2. ONE try FOR TWO INDEPENDENT FETCHES. The session fetch and the subscription fetch shared a
 *      try block, so a throw in the first skipped the second entirely. That is exactly the
 *      screenshot on the ticket: transaction "Pending", amount "Processing…", balance "Pending
 *      webhook confirmation" — three blank rows from one failed request.
 *
 *   3. IT ANNOUNCED SUCCESS UNCONDITIONALLY. Every error was swallowed and the headline said
 *      "Payment Successful!" regardless. A page that cannot fail cannot report a failure, and the
 *      owner is left believing the money moved and the plan will follow.
 *
 *   So: retry for a bounded window, keep the two questions apart, and say which of the two facts
 *   is actually established. "We took your money" and "your workspace has the plan" are different
 *   claims and this page now only makes the ones it has checked.
 *
 * THE FETCH IS ALSO THE FIX
 *   GET /payments/checkout-session/{id} is not a read. When the session is paid it runs the same
 *   ProcessPaymentEventAsync the webhook does, so polling it IS a recovery path for a webhook that
 *   never arrived — which is why retrying matters more than reporting.
 */

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/api/errors";
import { billingService } from "@/services/billing.service";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { CheckoutSessionDto, SubscriptionDto } from "@/types/billing";
import { CheckCircle, Warning } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/format/currency";

const REDIRECT_SECONDS = 6;

/**
 * Delays before each activation check, in ms. Front-loaded because the common case is that the
 * webhook has already landed, and bounded at ~17s because past that a person is owed an answer
 * rather than another spinner.
 */
const RETRY_DELAYS_MS = [0, 1_500, 3_000, 5_000, 8_000];

/** Stripe's own value for a session that has been paid for. */
const STRIPE_PAID = "paid";

type Phase =
  | "confirming"
  /** The workspace really has the plan — checked, not assumed. */
  | "active"
  /** Stripe says paid, the workspace still has no plan. The honest, actionable failure. */
  | "unconfirmed"
  /** We could not even establish that the payment went through. */
  | "failed";

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

  const [phase, setPhase] = useState<Phase>("confirming");
  const [session, setSession] = useState<CheckoutSessionDto | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(
    null,
  );
  const [failureDetail, setFailureDetail] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  // Bumped by the Retry button to re-run the effect without remounting the page.
  const [retryToken, setRetryToken] = useState(0);
  const cancelledRef = useRef(false);

  const returnLink = activeWorkspaceSlug
    ? `/${activeWorkspaceSlug}/billing`
    : "/workspace";

  const confirm = useCallback(async () => {
    if (!sessionId) {
      setPhase("failed");
      setFailureDetail(
        "This page was opened without a checkout reference, so there is nothing to look up.",
      );
      return;
    }

    let latestSession: CheckoutSessionDto | null = null;
    let lastError: unknown = null;

    for (let i = 0; i < RETRY_DELAYS_MS.length; i += 1) {
      if (cancelledRef.current) return;
      // Awaited even for the zero delay: it keeps every setState below off the effect's
      // synchronous path, which is what react-hooks/set-state-in-effect is asking for.
      await sleep(RETRY_DELAYS_MS[i]);
      if (cancelledRef.current) return;
      setAttempt(i + 1);

      // (a) The session. Retrieving it is what re-runs activation server-side, so this is
      //     attempted on every pass rather than cached after the first success.
      try {
        latestSession = await billingService.getCheckoutSession(sessionId);
        if (cancelledRef.current) return;
        setSession(latestSession);
      } catch (error) {
        lastError = error;
      }

      // (b) The subscription — asked separately, and asked even when (a) just threw, because
      //     the webhook may have activated the plan without our help. The workspace id comes
      //     from the session metadata first: this route lives outside the workspace layout, so
      //     the store may hold nothing at all on a hard load from Stripe.
      const workspaceId =
        latestSession?.metadata?.WorkspaceId || activeWorkspaceId;

      if (workspaceId) {
        try {
          const sub = await billingService.getActiveSubscription(workspaceId);
          if (cancelledRef.current) return;
          if (sub && sub.status?.toLowerCase() === "active") {
            setSubscription(sub);
            setPhase("active");
            return;
          }
        } catch {
          // 404 here is the account state "no plan yet", which is precisely what we are
          // waiting to stop being true. Not an error, and not worth surfacing.
        }
      }
    }

    if (cancelledRef.current) return;

    // Out of attempts. Which of the two facts did we actually establish?
    if (latestSession?.paymentStatus?.toLowerCase() === STRIPE_PAID) {
      setPhase("unconfirmed");
      setFailureDetail(null);
    } else {
      setPhase("failed");
      setFailureDetail(
        lastError
          ? getErrorMessage(lastError, "The payment could not be verified.")
          : "Stripe has not reported this checkout as paid.",
      );
    }
  }, [sessionId, activeWorkspaceId]);

  useEffect(() => {
    cancelledRef.current = false;
    // react-hooks/set-state-in-effect cannot see that confirm() awaits before it touches state:
    // every setState inside it sits behind `await sleep(...)`, so none of them run in this
    // effect's synchronous pass and there is no render cascade to avoid. Reaching an external
    // system — Stripe, through our API — and syncing the result back is what an effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void confirm();
    return () => {
      cancelledRef.current = true;
    };
  }, [confirm, retryToken]);

  // The countdown starts only once the plan is confirmed on the workspace. Redirecting away from
  // a failure is how a failure goes unreported.
  useEffect(() => {
    if (phase !== "active") return;
    const timer = setInterval(
      () => setCountdown((c) => (c > 0 ? c - 1 : 0)),
      1000,
    );
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "active" && countdown === 0) router.push(returnLink);
  }, [phase, countdown, returnLink, router]);

  const currency = session?.currency?.toUpperCase() || "VND";
  // Stripe VND is zero-decimal; everything else arrives in minor units.
  const rawAmount = session?.amountTotal ?? 0;
  const amountPaid = currency === "VND" ? rawAmount : rawAmount / 100;
  const formattedAmount =
    currency === "VND"
      ? formatMoney(amountPaid, "VND")
      : `$${amountPaid.toFixed(2)}`;

  const transactionId = session?.paymentIntentId || session?.id || null;
  const planName = session?.metadata?.PlanSlug
    ? session.metadata.PlanSlug.charAt(0).toUpperCase() +
      session.metadata.PlanSlug.slice(1)
    : null;

  if (phase === "confirming") {
    return (
      <Card className="w-full max-w-md rounded-xl border-hairline bg-surface-1 shadow-linear p-8 flex flex-col items-center justify-center text-center min-h-[260px]">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <h2 className="text-xl font-semibold text-ink">
          Activating your plan…
        </h2>
        <p className="text-sm text-ink-muted mt-2">
          Your payment went through. We are waiting for the workspace to pick it
          up.
        </p>
        {attempt > 1 ? (
          <p className="text-xs text-ink-subtle mt-3 tabular-nums">
            Check {attempt} of {RETRY_DELAYS_MS.length}
          </p>
        ) : null}
      </Card>
    );
  }

  const isActive = phase === "active";

  return (
    <Card className="w-full max-w-md rounded-xl border-hairline bg-surface-1 shadow-linear overflow-hidden">
      <div className="bg-surface-2 p-8 flex flex-col items-center text-center border-b border-hairline">
        <div
          className={`h-16 w-16 rounded-full flex items-center justify-center mb-4 ${
            isActive ? "bg-semantic-success/10" : "bg-amber-500/10"
          }`}
        >
          {isActive ? (
            <CheckCircle
              className="h-10 w-10 text-semantic-success"
              weight="fill"
            />
          ) : (
            <Warning className="h-10 w-10 text-amber-500" weight="fill" />
          )}
        </div>

        {/* The headline states only what was checked. "Payment Successful" over a workspace with
            no plan is the sentence that turned this into a webhook ticket. */}
        <h1 className="text-2xl font-semibold text-ink">
          {isActive
            ? "Payment Successful!"
            : phase === "unconfirmed"
              ? "Paid — plan not active yet"
              : "We could not confirm this payment"}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {isActive
            ? planName
              ? `Your workspace has been upgraded to the ${planName} plan.`
              : "Your workspace has been successfully updated."
            : phase === "unconfirmed"
              ? "Stripe has your payment, but the plan has not been applied to this workspace yet. Nothing has been charged twice — retrying below is safe."
              : (failureDetail ??
                "Please check your Billing page before paying again.")}
        </p>
      </div>

      <CardContent className="p-6">
        <div className="space-y-0 mb-6 rounded-lg border border-hairline overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 bg-surface-2/50">
            <span className="text-sm text-muted-foreground">
              Transaction ID
            </span>
            <span className="text-sm font-mono text-ink text-right break-all max-w-[200px]">
              {transactionId ? (
                transactionId.length > 20 ? (
                  `...${transactionId.slice(-12)}`
                ) : (
                  transactionId
                )
              ) : (
                <span className="text-ink-muted italic text-xs">Unknown</span>
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
                <span className="text-ink-muted italic text-xs">Unknown</span>
              )}
            </span>
          </div>
          <div className="flex justify-between items-center px-4 py-3 border-t border-hairline">
            <span className="text-sm text-muted-foreground">
              Current Credit Balance
            </span>
            <span
              className={`text-sm font-semibold ${
                subscription ? "text-semantic-success" : "text-ink-muted"
              }`}
            >
              {subscription ? (
                subscription.creditsRemaining.toLocaleString()
              ) : (
                /* NOT "Pending webhook confirmation". That named a cause this page never
                   verified, and it went into the bug report as the diagnosis. */
                <span className="italic text-xs">Not applied yet</span>
              )}
            </span>
          </div>
        </div>

        {isActive ? (
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
        ) : (
          <p className="mb-4 text-center text-xs text-ink-subtle">
            Keep this page open — the reference above is what support needs to
            find your payment.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {!isActive ? (
            <Button
              onClick={() => {
                // Reset here rather than at the top of confirm(): this is an event handler, so
                // it is not the effect's synchronous render cascade.
                setPhase("confirming");
                setFailureDetail(null);
                setAttempt(0);
                setRetryToken((t) => t + 1);
              }}
              className="w-full rounded-md h-10 bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm cursor-pointer"
            >
              Try activating again
            </Button>
          ) : null}
          <Link href={returnLink} className="w-full">
            <Button
              variant={isActive ? "default" : "outline"}
              className={`w-full rounded-md h-10 cursor-pointer ${
                isActive
                  ? "bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm"
                  : ""
              }`}
            >
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
