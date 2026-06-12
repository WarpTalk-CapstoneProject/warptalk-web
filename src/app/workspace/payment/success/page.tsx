import { CheckCircle, Receipt, ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function PaymentSuccessPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-xl border-hairline bg-surface-1 shadow-linear overflow-hidden">
        <div className="bg-surface-2 p-8 flex flex-col items-center text-center border-b border-hairline">
          <div className="h-16 w-16 bg-semantic-success/10 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-10 w-10 text-semantic-success" weight="fill" />
          </div>
          <h1 className="text-2xl font-semibold text-ink">Payment Successful!</h1>
          <p className="text-sm text-muted-foreground mt-2">Your workspace has been successfully topped up.</p>
        </div>
        
        <CardContent className="p-6">
          <div className="space-y-4 mb-8">
            <div className="flex justify-between items-center py-3 border-b border-hairline-tertiary">
              <span className="text-sm text-muted-foreground">Transaction ID</span>
              <span className="text-sm font-mono text-ink">tx_987654321</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-hairline-tertiary">
              <span className="text-sm text-muted-foreground">Amount Paid</span>
              <span className="text-sm font-medium text-ink">$50.00</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-sm text-muted-foreground">Credits Added</span>
              <span className="text-sm font-medium text-semantic-success">+15,000</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-3">
            <Link href="/workspace/wallet" className="w-full">
              <Button className="w-full rounded-md h-10 bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm">
                Return to Wallet
              </Button>
            </Link>
            <Button variant="outline" className="w-full rounded-md h-10 border-hairline bg-surface-1 text-ink hover:bg-surface-2">
              <Receipt className="mr-2 h-4 w-4" /> Download Receipt
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
