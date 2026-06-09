import type { ReactNode } from "react";
import { Warning, Robot, Database, Globe, HardDrives, ShieldCheck, Users } from "@phosphor-icons/react/dist/ssr";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const services = [
  { service: "Translation API", region: "Singapore", status: "Operational", latency: "142ms" },
  { service: "Transcript storage", region: "Tokyo", status: "Operational", latency: "88ms" },
  { service: "SignalR realtime", region: "Singapore", status: "Degraded", latency: "310ms" },
  { service: "AI summaries", region: "US West", status: "Operational", latency: "1.2s" },
];

const tenants = [
  { workspace: "Acme Global", plan: "Enterprise", rooms: 284, status: "Healthy" },
  { workspace: "Northwind Legal", plan: "Pro", rooms: 96, status: "Review" },
  { workspace: "Contoso Research", plan: "Enterprise", rooms: 142, status: "Healthy" },
];

export default function InternalDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-primary">
            <HardDrives weight="light" className="h-4 w-4" />
            WarpTalk internal
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Internal dashboard</h1>
          <p className="max-w-2xl text-muted-foreground">
            Manage tenants, platform health, AI operations, subscriptions, and support visibility.
          </p>
        </div>
        <Badge variant="outline" className="w-fit bg-background">Internal preview</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Globe weight="light" />} label="Workspaces" value="124" detail="8 trial accounts" />
        <MetricCard icon={<Users weight="light" />} label="Active users" value="1,024" detail="Last 24 hours" />
        <MetricCard icon={<Database weight="light" />} label="Stored artifacts" value="42.8k" detail="Transcripts and summaries" />
        <MetricCard icon={<Warning weight="light" />} label="Open alerts" value="1" detail="Realtime latency" />
      </div>

      <Tabs defaultValue="services" className="space-y-4">
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="ai">AI Ops</TabsTrigger>
        </TabsList>

        <TabsContent value="services">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Service health</CardTitle>
              <CardDescription>Internal platform view for support and operations.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service) => (
                    <TableRow key={service.service}>
                      <TableCell className="font-medium">{service.service}</TableCell>
                      <TableCell>{service.region}</TableCell>
                      <TableCell>{service.latency}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={service.status === "Operational" ? "secondary" : "destructive"}>{service.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tenants">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Tenant overview</CardTitle>
              <CardDescription>B2B workspaces watched by WarpTalk managers.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {tenants.map((tenant) => (
                <div key={tenant.workspace} className="flex items-center justify-between rounded-lg border bg-background p-4">
                  <div>
                    <p className="font-medium">{tenant.workspace}</p>
                    <p className="text-sm text-muted-foreground">{tenant.plan} - {tenant.rooms} rooms</p>
                  </div>
                  <Badge variant={tenant.status === "Healthy" ? "secondary" : "outline"}>{tenant.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>AI pipeline</CardTitle>
              <CardDescription>Preview monitoring for STT, translation, TTS, and summary workers.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <PipelineCard label="STT worker lag" value="18 msgs" />
              <PipelineCard label="Translation latency" value="0.4s" />
              <PipelineCard label="Summary queue" value="3 jobs" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">
            {icon}
          </div>
          <ShieldCheck weight="light" className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function PipelineCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <Robot weight="light" className="mb-3 h-5 w-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
