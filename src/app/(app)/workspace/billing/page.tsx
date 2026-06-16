import { Download, Robot, Coins, CreditCard, Translate, Users } from "@phosphor-icons/react/dist/ssr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const costs = [
  { name: "Realtime translation", value: 6218, percent: 62, icon: Translate },
  { name: "AI summaries", value: 2062, percent: 21, icon: Robot },
  { name: "AI workspace chat", value: 1740, percent: 17, icon: Coins },
];

const invoices = [
  { period: "May 2026", amount: "$15,940", status: "Paid", issued: "Jun 01, 2026" },
  { period: "April 2026", amount: "$14,820", status: "Paid", issued: "May 01, 2026" },
  { period: "March 2026", amount: "$13,960", status: "Paid", issued: "Apr 01, 2026" },
];

export default function WorkspaceBillingPage() {
  return (
    <div className="flex min-h-full flex-col gap-3 pb-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing & AI usage</h1>
          <p className="text-sm text-muted-foreground">Monitor Enterprise seats, AI credits, translation cost, and invoices.</p>
        </div>
        <Button variant="outline" className="rounded-full"><Download weight="light" /> Export usage</Button>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <BillingMetric icon={Coins} label="AI credits remaining" value="32,480" detail="17,520 of 50,000 used" dark />
        <BillingMetric icon={CreditCard} label="Estimated June bill" value="$16,680" detail="Renews July 01, 2026" />
        <BillingMetric icon={Users} label="Enterprise seats" value="128 / 160" detail="32 seats available" />
      </section>

      <section className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-3xl border-hairline bg-surface-1 text-ink shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle className="text-base">Cost by AI service</CardTitle><p className="text-xs text-muted-foreground">June usage before the fixed Enterprise platform fee.</p></div>
            <Badge variant="outline" className="rounded-full">June 2026</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {costs.map(({ name, value, percent, icon: Icon }) => (
              <div key={name} className="rounded-2xl border border-hairline bg-surface-2 p-4 text-ink">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-1 border border-hairline text-ink"><Icon className="h-4 w-4" /></span>
                    <div><p className="text-sm font-medium">{name}</p><p className="text-xs text-muted-foreground">{percent}% of variable AI spend</p></div>
                  </div>
                  <p className="text-lg font-semibold">${value.toLocaleString()}</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div>
              </div>
            ))}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-surface-2 border border-hairline p-4 text-ink"><p className="text-xs text-ink-muted">Average translation cost</p><p className="text-xl font-semibold">$0.34 / minute</p></div>
              <div className="rounded-2xl bg-surface-2 border border-hairline p-4 text-ink"><p className="text-xs text-ink-muted">Average cost per meeting</p><p className="text-xl font-semibold">$19.88</p></div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-hairline bg-surface-1 text-ink shadow-sm">
          <CardHeader><CardTitle className="text-base">Credit allocation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="relative mx-auto flex h-44 w-44 items-center justify-center rounded-full" style={{ background: "conic-gradient(var(--primary) 0 35%, var(--surface-3) 35% 100%)" }}>
              <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-surface-1">
                <p className="text-3xl font-semibold">35%</p><p className="text-xs text-ink-muted">used</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Monthly allowance</span><strong>50,000</strong></div>
              <div className="flex justify-between"><span className="text-ink-muted">Consumed</span><strong>17,520</strong></div>
              <div className="flex justify-between"><span className="text-ink-muted">Remaining</span><strong>32,480</strong></div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-3xl border-hairline bg-surface-1 text-ink shadow-sm">
        <CardHeader className="py-3"><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
        <CardContent className="grid gap-2 pb-3 md:grid-cols-3">
          {invoices.map((invoice) => (
            <div key={invoice.period} className="flex items-center justify-between rounded-2xl border border-hairline bg-surface-2 p-3 text-ink">
              <div><p className="text-sm font-medium">{invoice.period}</p><p className="text-xs text-ink-muted">{invoice.issued}</p></div>
              <div className="text-right"><p className="text-sm font-semibold">{invoice.amount}</p><Badge variant="secondary" className="rounded-full text-[10px]">{invoice.status}</Badge></div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function BillingMetric({ icon: Icon, label, value, detail, dark }: { icon: typeof Coins; label: string; value: string; detail: string; dark?: boolean }) {
  return (
    <Card
      className={`rounded-3xl border-hairline shadow-sm ${dark ? "bg-primary text-primary-foreground border-transparent" : "bg-surface-1 text-ink"}`}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${dark ? "bg-primary-foreground text-primary" : "bg-surface-2 border border-hairline text-ink"}`}><Icon className="h-5 w-5" /></div>
        <div><p className={`text-xs ${dark ? "text-primary-foreground/80" : "text-ink-muted"}`}>{label}</p><p className="text-2xl font-semibold">{value}</p><p className={`text-xs ${dark ? "text-primary-foreground/75" : "text-ink-muted"}`}>{detail}</p></div>
      </CardContent>
    </Card>
  );
}
