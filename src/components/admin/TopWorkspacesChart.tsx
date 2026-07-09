"use client";

import { useQuery } from "@tanstack/react-query";
import { billingService } from "@/services/billing.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

const RANK_STYLES = [
  { badge: "bg-amber-400 text-amber-900",   bar: "bg-amber-400" },
  { badge: "bg-slate-300 text-slate-800",   bar: "bg-slate-300" },
  { badge: "bg-orange-400 text-orange-900", bar: "bg-orange-400" },
];

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
  const max = hasData ? Math.max(...data.map((w) => w.totalCreditsConsumed ?? 0)) : 1;

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
          <div className="flex flex-col gap-2 mt-1">
            {data.map((ws, idx) => {
              const rank = RANK_STYLES[idx] ?? { badge: "bg-surface-3 text-muted-foreground", bar: "bg-primary/60" };
              const pct = Math.round(((ws.totalCreditsConsumed ?? 0) / max) * 100);
              return (
                <Link
                  key={ws.workspaceId}
                  href={`/billing/workspace/${ws.workspaceId}`}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2 transition-colors"
                >
                  {/* Rank badge */}
                  <span className={`flex-none w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${rank.badge}`}>
                    {idx + 1}
                  </span>

                  {/* Name + progress bar */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {ws.workspaceName && !ws.workspaceName.startsWith("Workspace ")
                        ? ws.workspaceName
                        : `WS-${ws.workspaceId.substring(0, 8).toUpperCase()}`}
                    </p>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${rank.bar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Credits count */}
                  <span className="flex-none text-sm font-semibold tabular-nums text-ink">
                    {(ws.totalCreditsConsumed ?? 0).toLocaleString()}
                    <span className="text-xs font-normal text-muted-foreground ml-1">cr</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
