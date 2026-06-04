import { Activity, Building2, Clock3, CreditCard, Gauge, Users } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const usageRows = [
  { metric: "Live translation minutes", used: "18,420", limit: "50,000", status: "Healthy" },
  { metric: "AI summaries", used: "238", limit: "1,000", status: "Healthy" },
  { metric: "Voice profiles", used: "26", limit: "75", status: "Review" },
  { metric: "Stored transcripts", used: "612", limit: "2,500", status: "Healthy" },
];

const departments = [
  { name: "Operations", rooms: 36, minutes: "8,140", owners: 8 },
  { name: "Customer success", rooms: 24, minutes: "5,860", owners: 5 },
  { name: "Product research", rooms: 18, minutes: "3,440", owners: 4 },
];

export default function WorkspaceDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-primary">
            <Building2 className="h-4 w-4" />
            Customer workspace
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Workspace dashboard</h1>
          <p className="max-w-2xl text-muted-foreground">
            Manage company usage, members, room activity, quota pressure, and artifact governance.
          </p>
        </div>
        <Badge variant="outline" className="w-fit bg-background">Preview data</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<CreditCard />} label="Credits used" value="45,000" detail="Reset in 12 days" />
        <MetricCard icon={<Users />} label="Members" value="128" detail="14 invited" />
        <MetricCard icon={<Activity />} label="Active rooms" value="9" detail="Across 3 teams" />
        <MetricCard icon={<Clock3 />} label="Translated time" value="18.4k" detail="Minutes this month" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Usage limits</CardTitle>
            <CardDescription>Workspace-level quotas and operational thresholds.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Limit</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usageRows.map((row) => (
                  <TableRow key={row.metric}>
                    <TableCell className="font-medium">{row.metric}</TableCell>
                    <TableCell>{row.used}</TableCell>
                    <TableCell>{row.limit}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={row.status === "Healthy" ? "secondary" : "outline"}>{row.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Department activity</CardTitle>
            <CardDescription>Teams driving room volume.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {departments.map((department) => (
              <div key={department.name} className="rounded-lg border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{department.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {department.rooms} rooms - {department.owners} owners
                    </p>
                  </div>
                  <Badge variant="outline">{department.minutes} min</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
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
          <Gauge className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
