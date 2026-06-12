"use client";

import { CheckCircle, Lightning, ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { paymentService } from "@/services/payment.service";


const plans = [
  {
    name: "Free",
    monthlyPrice: "Free",
    yearlyPrice: "Free",
    interval: "",
    description: "For teams trying real-time interpretation across first conversations.",
    features: [
      "Up to 3 live translation rooms each month",
      "Real-time captions for bilingual meetings",
      "Basic transcript export",
      "Web access for small teams",
      "Community support",
    ],
    buttonText: "Choose Plan",
    featured: false,
  },
  {
    name: "Standard",
    monthlyPrice: "$9.99",
    yearlyPrice: "$7.99",
    interval: "/m",
    description: "For growing global teams that need reliable AI summaries and history.",
    features: [
      "Up to 50 live translation rooms each month",
      "AI meeting summary and action items",
      "Speaker timeline and transcript search",
      "Team collaboration up to 5 members",
      "Priority web and mobile access",
    ],
    buttonText: "Choose Plan",
    featured: true,
  },
  {
    name: "Pro",
    monthlyPrice: "$19.99",
    yearlyPrice: "$15.99",
    interval: "/m",
    description: "For operators using voice cloning and native-feeling interpretation at scale.",
    features: [
      "Unlimited live translation rooms",
      "Human voice cloning for supported speakers",
      "Advanced AI analysis and conversation insights",
      "Unlimited team members",
      "Brand and workspace customization",
    ],
    buttonText: "Choose Plan",
    featured: false,
  },
];

export default function PaymentPlansPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCheckout = async (amount: number, paymentType: string) => {
    if (!isAuthenticated || !user) {
      router.push("/login");
      return;
    }

    try {
      setIsProcessing(true);
      const url = await paymentService.createCheckoutSession({
        userId: user.id,
        workspaceId: user.id,
        amount,
        currency: "usd",
        paymentType,
      });
      if (url) {
        window.location.href = url; // Redirect to Stripe Checkout
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to initiate checkout. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center pb-12 pt-8">
      <div className="text-center max-w-2xl mb-12">
        <Badge variant="secondary" className="mb-4 bg-surface-2 text-primary border border-hairline hover:bg-surface-2">Pricing & Subscriptions</Badge>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-ink mb-4">Choose the right plan for your team</h1>
        <p className="text-lg text-muted-foreground">Upgrade your workspace to unlock advanced AI capabilities, real-time translation, and more credits.</p>
        
        <div className="mt-8 flex justify-center">
          <Tabs value={billingInterval} onValueChange={(val) => setBillingInterval(val as "monthly" | "yearly")} className="w-fit">
            <TabsList className="bg-surface-2 p-1 rounded-full border border-hairline">
              <TabsTrigger value="monthly" className="rounded-full text-sm px-6 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Monthly</TabsTrigger>
              <TabsTrigger value="yearly" className="rounded-full text-sm px-6 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Yearly (Save 20%)</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 w-full max-w-6xl px-4">
        {plans.map((plan) => (
          <Card key={plan.name} className={`relative flex flex-col rounded-xl shadow-linear transition-transform duration-300 hover:-translate-y-1 ${plan.featured ? "border-primary/50 bg-surface-2 shadow-[0_8px_30px_rgb(94,106,210,0.12)]" : "border-hairline bg-surface-1"}`}>
            {plan.featured && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary hover:bg-primary text-primary-foreground border-none shadow-sm rounded-full px-3 py-0.5">Most Popular</Badge>
              </div>
            )}
            <CardHeader className="p-6 pb-4">
              <CardTitle className="text-xl font-medium">{plan.name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-2 min-h-[40px]">{plan.description}</p>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-4xl font-semibold tracking-tight">{billingInterval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice}</span>
                {plan.interval && <span className="text-sm text-muted-foreground mb-1">{plan.interval}</span>}
              </div>
              {billingInterval === "yearly" && plan.interval && (
                <p className="text-xs text-semantic-success mt-1">Save 20% compared to monthly</p>
              )}
            </CardHeader>
            <CardContent className="flex-1 p-6 pt-4">
              <ul className="space-y-3">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" weight="fill" />
                    <span className="text-sm text-ink">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="p-6 pt-0">
              <button 
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  if (plan.name === "Free") {
                    router.push("/workspace"); // Free plan just goes to workspace
                    return;
                  }
                  const price = billingInterval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
                  const numericPrice = parseFloat(price.replace("$", ""));
                  handleCheckout(numericPrice, "Subscription");
                }}
                className={`inline-flex items-center justify-center w-full rounded-md h-10 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${plan.featured ? "bg-primary hover:bg-primary-hover text-primary-foreground" : "bg-surface-2 hover:bg-surface-3 text-ink border border-hairline"}`}
              >
                {isProcessing ? "Processing..." : plan.buttonText}
              </button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="mt-16 w-full max-w-4xl px-4">
        <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear p-1">
          <div className="flex flex-col md:flex-row items-center justify-between p-6 bg-surface-2 rounded-lg border border-hairline-tertiary">
            <div className="flex items-center gap-4 mb-4 md:mb-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Lightning className="h-6 w-6" weight="fill" />
              </div>
              <div>
                <h3 className="text-lg font-medium">Need more credits?</h3>
                <p className="text-sm text-muted-foreground">Top up your AI credits without changing your plan.</p>
              </div>
            </div>
            <button 
              type="button"
              disabled={isProcessing}
              onClick={() => handleCheckout(50, "CreditTopUp")}
              className="inline-flex items-center justify-center rounded-md h-10 px-6 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus bg-surface-1 hover:bg-surface-3 text-ink border border-hairline shadow-sm w-full md:w-auto cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? "Loading..." : <>Top up $50 <ArrowRight className="ml-2 h-4 w-4" /></>}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
