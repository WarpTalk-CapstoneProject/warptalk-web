import type { ReactNode } from "react";
import { AlertTriangle, Database, Globe2, ServerCog, ShieldCheck, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const incidents = [
  { service: "Translation API", region: "Singapore", status: "Operational", latency: "142ms" },
  { service: "Transcript storage", region: "Tokyo", status: "Operational", latency: "88ms" },
  { service: "SignalR realtime", region: "Singapore", status: "Degraded", latency: "310ms" },
  { service: "AI summaries", region: "US West", status: "Operational", latency: "1.2s" },
];

const auditEvents = [
  { actor: "System", event: "Workspace quota refreshed", time: "09:30" },
  { actor: "Host admin", event: "Updated room retention policy", time: "08:45" },
  { actor: "Support", event: "Reviewed feedback queue", time: "08:10" },
];

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-primary">
            <ServerCog className="h-4 w-4" />
            Platform control
          </div>
          <h1 className="text-3xl font-bold tracking-tight">System dashboard</h1>
          <p className="max-w-2xl text-muted-foreground">
            Admin-facing shadcn surface for platform health, tenants, audit events, and service status.
          </p>
        </div>
        <Badge variant="outline" className="w-fit bg-background">
          Admin preview
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Globe2 />} label="Workspaces" value="124" detail="8 trial accounts" />
        <MetricCard icon={<UsersRound />} label="Active users" value="1,024" detail="Last 24 hours" />
        <MetricCard icon={<Database />} label="Stored artifacts" value="42.8k" detail="Transcripts and summaries" />
        <MetricCard icon={<AlertTriangle />} label="Open alerts" value="1" detail="Realtime latency" />
      </div>

      <Tabs defaultValue="services" className="space-y-4">
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="services">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Service health</CardTitle>
              <CardDescription>Operational view modeled after the template dashboard tables.</CardDescription>
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
                  {incidents.map((incident) => (
                    <TableRow key={incident.service}>
                      <TableCell className="font-medium">{incident.service}</TableCell>
                      <TableCell>{incident.region}</TableCell>
                      <TableCell>{incident.latency}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={incident.status === "Operational" ? "secondary" : "destructive"}>
                          {incident.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Audit events</CardTitle>
              <CardDescription>Recent admin changes and automated platform actions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {auditEvents.map((event) => (
                <div key={`${event.actor}-${event.time}`} className="flex items-center justify-between rounded-lg border bg-background p-4">
                  <div>
                    <p className="font-medium">{event.event}</p>
                    <p className="text-sm text-muted-foreground">{event.actor}</p>
                  </div>
                  <Badge variant="outline">{event.time}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">
            {icon}
          </div>
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
