"use client";

import { useQuery } from "@tanstack/react-query";
import { billingService } from "@/services/billing.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarList } from "@/components/admin/charts/bar-list";

const workspaceName = (name: string | null | undefined, id: string) =>
  name && !name.startsWith("Workspace ") ? name : `WS-${id.substring(0, 8).toUpperCase()}`;

interface TopWorkspacesChartProps {
  className?: string;
}

export function TopWorkspacesChart({ className }: TopWorkspacesChartProps) {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["global-top-workspaces", days],
    queryFn: () => billingService.getTopWorkspaces(days, 5),
  });

  const hasData = data && data.length > 0;

  return (
    <Card className={`bg-surface-1 border-hairline shadow-linear ${className || ""}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-medium">Top Workspaces</CardTitle>
          <CardDescription>Highest credit consumption</CardDescription>
        </div>
        <Tabs value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
          <TabsList className="h-8">
            <TabsTrigger value="7" className="text-xs px-3 h-6">7d</TabsTrigger>
            <TabsTrigger value="30" className="text-xs px-3 h-6">30d</TabsTrigger>
            <TabsTrigger value="90" className="text-xs px-3 h-6">90d</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="pt-2">
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-rose-500">
            Failed to load workspace data
          </div>
        ) : !hasData ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            No consumption recorded for this period
          </div>
        ) : (
          // Ranked bars in the admin chart style. The gold/silver/bronze badges were three more
          // hardcoded palettes, and a medal says nothing a rank number and a bar length do not.
          <div className="mt-1">
            <BarList
              ariaLabel="Top workspaces by credit consumption"
              formatValue={(value) => `${value.toLocaleString("en-US")} cr`}
              rows={data.map((ws, index) => ({
                key: ws.workspaceId,
                label: `${index + 1}. ${workspaceName(ws.workspaceName, ws.workspaceId)}`,
                href: `/billing/workspace/${ws.workspaceId}`,
                segments: [{ key: "credits", label: "Credits", value: ws.totalCreditsConsumed ?? 0 }],
              }))}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
