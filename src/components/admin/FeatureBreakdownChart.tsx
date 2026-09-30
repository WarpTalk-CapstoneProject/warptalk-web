"use client";

import { useQuery } from "@tanstack/react-query";
import { billingService } from "@/services/billing.service";
import { BarList, type BarListRow } from "@/components/admin/charts/bar-list";
import { ChartFigure } from "@/components/admin/charts/time-series-chart";
import { usageServiceOf } from "@/lib/billing/usage-labels";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FeatureBreakdownChartProps {
  workspaceId?: string;
  className?: string;
}

const credits = (value: number) => value.toLocaleString("en-US");

export function FeatureBreakdownChart({
  workspaceId,
  className,
}: FeatureBreakdownChartProps) {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, isError } = useQuery({
    queryKey: workspaceId
      ? ["workspace-feature-breakdown", workspaceId, days]
      : ["global-feature-breakdown", days],
    queryFn: () =>
      workspaceId
        ? billingService.getWorkspaceUsageBreakdown(workspaceId, days)
        : billingService.getGlobalUsageBreakdown(days),
  });

  // Ranked bars, one hue: the rank is the length. The pie this replaced gave seven services seven
  // hardcoded hexes, read nothing in dark mode, and its tooltip was clipped by the card.
  const chartData = useMemo<BarListRow[]>(() => {
    if (!data) return [];
    const grouped = new Map<string, { label: string; value: number }>();
    for (const row of data) {
      const service = usageServiceOf(row.usageType);
      const entry = grouped.get(service.key) ?? { label: service.label, value: 0 };
      entry.value += row.totalCreditsConsumed ?? 0;
      grouped.set(service.key, entry);
    }
    return [...grouped.entries()]
      .filter(([, entry]) => entry.value > 0)
      .sort((a, b) => b[1].value - a[1].value)
      .map(([key, entry]) => ({ key, label: entry.label, segments: [{ key, label: entry.label, value: entry.value }] }));
  }, [data]);
  const total = chartData.reduce((sum, row) => sum + row.segments[0].value, 0);

  const hasData = chartData.length > 0;

  return (
    <Card
      className={`bg-surface-1 border-hairline shadow-linear ${className || ""}`}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-medium">
            Feature Adoption
          </CardTitle>
          <CardDescription>Credit consumption by service</CardDescription>
        </div>
        <div>
          <Tabs
            value={days.toString()}
            onValueChange={(v) => setDays(parseInt(v))}
          >
            <TabsList className="h-8">
              <TabsTrigger value="7" className="text-xs px-3 h-6">
                7d
              </TabsTrigger>
              <TabsTrigger value="30" className="text-xs px-3 h-6">
                30d
              </TabsTrigger>
              <TabsTrigger value="90" className="text-xs px-3 h-6">
                90d
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[250px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="h-[250px] flex items-center justify-center text-sm text-red-500">
            Failed to load breakdown data
          </div>
        ) : !hasData ? (
          <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
            No consumption recorded for this period
          </div>
        ) : (
          <div className="mt-2">
            <ChartFigure value={credits(total)} caption={`Credits consumed · last ${days} days`} />
            <BarList ariaLabel="Credit consumption by service" rows={chartData} formatValue={credits} showShare />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
