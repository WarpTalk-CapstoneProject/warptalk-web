"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle } from "@phosphor-icons/react";
import { paymentService } from "@/services/payment.service";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    const fetchSession = async () => {
      try {
        const data = await paymentService.getCheckoutSession(sessionId);
        setSession(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [sessionId]);

  const currency = session?.currency?.toUpperCase() || "VND";
  const amountPaid = session 
    ? (currency === "VND" ? session.amountTotal : session.amountTotal / 100) 
    : 0;
  const paymentType = session?.metadata?.PaymentType || "TopUp";

  // Calculate credits added
  let creditsAdded = 0;
  if (paymentType === "Subscription") {
    if (amountPaid === 190000 || amountPaid === 1800000) {
      creditsAdded = 30000;
    } else if (amountPaid === 490000 || amountPaid === 4800000) {
      creditsAdded = 100000;
    } else {
      creditsAdded = 30000; // Default fallback
    }
  } else {
    // TopUp (10 VND = 1 Credit)
    creditsAdded = amountPaid / 10;
  }

  // Format currency
  const formattedAmount = currency === "VND" 
    ? `${amountPaid.toLocaleString("vi-VN")}đ` 
    : `$${amountPaid.toFixed(2)}`;

  const returnLink = "/warptalk-global/billing";

  if (loading) {
    return (
      <Card className="w-full max-w-md rounded-xl border-hairline bg-surface-1 shadow-linear p-8 flex flex-col items-center justify-center text-center">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <h2 className="text-xl font-semibold text-ink">Verifying payment...</h2>
        <p className="text-sm text-ink-muted mt-2">Please wait while we confirm your transaction details.</p>
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
        <p className="text-sm text-muted-foreground mt-2">Your workspace has been successfully updated.</p>
      </div>
      
      <CardContent className="p-6">
        <div className="space-y-4 mb-8">
          <div className="flex justify-between items-center py-3 border-b border-hairline-tertiary">
            <span className="text-sm text-muted-foreground">Transaction ID</span>
            <span className="text-sm font-mono text-ink text-right break-all max-w-[200px]">
              {session?.paymentIntentId || session?.id || "N/A"}
            </span>
          </div>
          <div className="flex justify-between items-center py-3 border-b border-hairline-tertiary">
            <span className="text-sm text-muted-foreground">Amount Paid</span>
            <span className="text-sm font-medium text-ink">{formattedAmount}</span>
          </div>
          <div className="flex justify-between items-center py-3">
            <span className="text-sm text-muted-foreground">Credits Added</span>
            <span className="text-sm font-medium text-semantic-success">+{creditsAdded.toLocaleString()}</span>
          </div>
        </div>
        
        <div className="flex flex-col gap-3">
          <Link href={returnLink} className="w-full">
            <Button className="w-full rounded-md h-10 bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm cursor-pointer">
              Return to Billing
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
      <Suspense fallback={
        <Card className="w-full max-w-md rounded-xl border-hairline bg-surface-1 shadow-linear p-8 flex flex-col items-center justify-center text-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
          <h2 className="text-xl font-semibold text-ink">Loading details...</h2>
        </Card>
      }>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
