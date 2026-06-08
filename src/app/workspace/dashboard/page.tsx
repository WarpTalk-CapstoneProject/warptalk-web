import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  CalendarDays,
  Coins,
  CreditCard,
  DollarSign,
  Users,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { aiCreditUsage, workspaceRooms } from "@/lib/workspace-preview";

const metrics = [
  { label: "Monthly revenue", value: "$42,680", detail: "+12.4% from May", icon: DollarSign },
  { label: "AI credits remaining", value: "32,480", detail: "68% of monthly quota", icon: Coins },
  { label: "Workspace members", value: "128 / 160", detail: "14 invitations pending", icon: Users },
  { label: "Meetings this month", value: "84", detail: "9 currently active", icon: Video },
];

const billingRows = [
  { item: "Enterprise platform", amount: "$8,400", status: "Fixed" },
  { item: "Realtime translation", amount: "$6,218", status: "Usage" },
  { item: "AI summary & analysis", amount: "$2,062", status: "Usage" },
];

export default function WorkspaceDashboardPage() {
  const maxUsage = Math.max(...aiCreditUsage.map((item) => item.value));
  const points = aiCreditUsage
    .map((item, index) => `${index * 100},${104 - (item.value / maxUsage) * 82}`)
    .join(" ");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden pb-1">
      <div className="flex items-center justify-end gap-3">
        <div className="flex gap-2">
          <Link href="/workspace/billing" className="inline-flex h-8 items-center justify-center rounded-full border bg-white px-3 text-sm font-medium transition hover:bg-neutral-100">View billing</Link>
          <Link href="/workspace/members" className="inline-flex h-8 items-center justify-center rounded-full bg-neutral-950 px-3 text-sm font-medium text-white transition hover:bg-neutral-800">Manage members</Link>
        </div>
      </div>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => (
          <MetricCard key={metric.label} {...metric} emphasized={index === 1} />
        ))}
      </section>

      <section className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,.75fr)]">
        <Card className="rounded-3xl border-white/70 bg-white/86 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <CardHeader className="flex-row items-center justify-between space-y-0 px-4 py-3">
            <div>
              <CardTitle className="text-base">AI credit usage</CardTitle>
              <p className="text-xs text-muted-foreground">Realtime translation, summaries, and workspace AI chat.</p>
            </div>
            <Badge variant="outline" className="rounded-full">Last 7 days</Badge>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_165px]">
              <div className="min-w-0">
                <svg viewBox="0 0 600 120" className="h-32 w-full overflow-visible" role="img" aria-label="AI credit usage chart">
                  {[22, 49, 76, 103].map((y) => (
                    <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 5" />
                  ))}
                  <defs>
                    <linearGradient id="creditArea" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#111827" stopOpacity=".2" />
                      <stop offset="100%" stopColor="#111827" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon points={`0,110 ${points} 600,110`} fill="url(#creditArea)" />
                  <polyline points={points} fill="none" stroke="#111827" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  {aiCreditUsage.map((item, index) => (
                    <circle key={item.label} cx={index * 100} cy={104 - (item.value / maxUsage) * 82} r="4.5" fill="white" stroke="#111827" strokeWidth="3" />
                  ))}
                </svg>
                <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
                  {aiCreditUsage.map((item) => <span key={item.label}>{item.label.replace("Jun ", "")}</span>)}
                </div>
              </div>
              <div className="space-y-2 rounded-2xl bg-neutral-950 p-3 text-white">
                <Bot className="h-5 w-5" />
                <div>
                  <p className="text-xs text-white/60">Credits consumed</p>
                  <p className="text-2xl font-semibold">17,520</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full w-[35%] rounded-full bg-white" />
                </div>
                <p className="text-xs leading-5 text-white/65">Current forecast stays within the 50,000-credit Enterprise allowance.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-white/70 bg-white/86 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <CardHeader className="flex-row items-center justify-between space-y-0 px-4 py-3">
            <CardTitle className="text-base">Billing snapshot</CardTitle>
            <CreditCard className="h-5 w-5" />
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            {billingRows.map((row) => (
              <div key={row.item} className="flex items-center justify-between rounded-2xl border bg-white/80 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{row.item}</p>
                  <p className="text-xs text-muted-foreground">{row.status}</p>
                </div>
                <p className="font-semibold">{row.amount}</p>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">Estimated June invoice</span>
              <span className="text-xl font-semibold">$16,680</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,.6fr)]">
        <Card className="rounded-3xl border-white/70 bg-white/86">
          <CardHeader className="flex-row items-center justify-between space-y-0 px-4 py-2.5">
            <div>
              <CardTitle className="text-base">Meeting activity</CardTitle>
              <p className="text-xs text-muted-foreground">Live and upcoming workspace sessions.</p>
            </div>
            <Link href="/workspace/rooms" className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[0.8rem] font-medium transition hover:bg-neutral-100">All rooms <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </CardHeader>
          <CardContent className="grid gap-2 px-4 pb-3 md:grid-cols-3">
            {workspaceRooms.slice(0, 3).map((room) => (
              <Link key={room.id} href={`/rooms/${room.id === "WARP-241" ? "preview-investor-qa" : "preview-partner-sync"}`} className="rounded-2xl border bg-white/80 p-2.5 transition hover:border-neutral-400">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="rounded-full text-[10px]">{room.status}</Badge>
                  <span className="text-[11px] text-muted-foreground">{room.participants}</span>
                </div>
                <p className="mt-2 truncate text-sm font-semibold">{room.name}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3 w-3" />{room.startsAt}</p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card
          className="workspace-dark-card rounded-3xl border-white/70 bg-neutral-950 text-white"
          style={{ backgroundColor: "#0a0a0a" }}
        >
          <CardContent className="flex h-full items-center justify-between gap-3 p-3">
            <div>
              <p className="text-xs text-white/60">Enterprise seats</p>
              <p className="mt-1 text-xl font-semibold">32 available</p>
              <p className="mt-1 text-xs text-white/60">128 of 160 assigned</p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-neutral-950">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  emphasized,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  emphasized?: boolean;
}) {
  return (
    <Card
      className={`rounded-3xl border-white/70 shadow-[0_14px_34px_rgba(15,23,42,0.07)] ${emphasized ? "workspace-dark-card bg-neutral-950 text-white" : "bg-white/88"}`}
      style={emphasized ? { backgroundColor: "#0a0a0a" } : undefined}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${emphasized ? "bg-white text-neutral-950" : "bg-neutral-950 text-white"}`}>
            <Icon className="h-4 w-4" />
          </div>
          <ArrowUpRight className={`h-4 w-4 ${emphasized ? "text-white/55" : "text-muted-foreground"}`} />
        </div>
        <p className={`mt-2 text-xs ${emphasized ? "text-white/60" : "text-muted-foreground"}`}>{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</p>
        <p className={`mt-1 text-xs ${emphasized ? "text-white/60" : "text-muted-foreground"}`}>{detail}</p>
      </CardContent>
    </Card>
  );
}
