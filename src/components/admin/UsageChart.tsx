"use client";

import { useQuery } from "@tanstack/react-query";
import { billingService } from "@/services/billing.service";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Rectangle } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface UsageChartProps {
  workspaceId?: string;
  className?: string;
}

type Grouping = "month" | "quarter" | "year";

export function UsageChart({ workspaceId, className }: UsageChartProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [grouping, setGrouping] = useState<Grouping>("month");

  // If grouping is 'year', fetch last 5 years. Otherwise fetch selected year.
  const { data, isLoading, isError } = useQuery({
    queryKey: workspaceId
      ? ["workspace-usage-chart", workspaceId, year, grouping === "year"]
      : ["global-usage-chart", year, grouping === "year"],
    queryFn: async () => {
      if (grouping === "year") {
        const yearsToFetch = [currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1, currentYear];
        const promises = yearsToFetch.map(y =>
          workspaceId
            ? billingService.getWorkspaceUsageChart(workspaceId!, y)
            : billingService.getGlobalUsageChart(y)
        );
        const results = await Promise.all(promises);
        return results;
      } else {
        const result = workspaceId
          ? await billingService.getWorkspaceUsageChart(workspaceId!, year)
          : await billingService.getGlobalUsageChart(year);
        return [result];
      }
    },
  });

  const chartData = useMemo(() => {
    if (!data) return [];

    if (grouping === "year") {
      // Group by year
      return data.map(d => {
        const consumed = d.monthlyData.reduce((sum, m) => sum + m.consumedCredits, 0);
        const topUp = d.monthlyData.reduce((sum, m) => sum + m.topUpCredits, 0);
        return {
          label: d.year.toString(),
          consumedCredits: consumed,
          topUpCredits: topUp
        };
      });
    }

    const singleYearData = data[0]?.monthlyData || [];

    if (grouping === "quarter") {
      // Group into Q1, Q2, Q3, Q4
      const quarters = [
        { label: "Q1", months: [1, 2, 3], consumedCredits: 0, topUpCredits: 0 },
        { label: "Q2", months: [4, 5, 6], consumedCredits: 0, topUpCredits: 0 },
        { label: "Q3", months: [7, 8, 9], consumedCredits: 0, topUpCredits: 0 },
        { label: "Q4", months: [10, 11, 12], consumedCredits: 0, topUpCredits: 0 },
      ];

      singleYearData.forEach(m => {
        const qIndex = Math.floor((m.month - 1) / 3);
        quarters[qIndex].consumedCredits += m.consumedCredits;
        quarters[qIndex].topUpCredits += m.topUpCredits;
      });

      return quarters.map(q => ({
        label: q.label,
        consumedCredits: q.consumedCredits,
        topUpCredits: q.topUpCredits
      }));
    }

    // Default: month
    return singleYearData.map(m => ({
      label: m.monthName,
      consumedCredits: m.consumedCredits,
      topUpCredits: m.topUpCredits
    }));
  }, [data, grouping]);

  const hasData = chartData.some(d => d.consumedCredits > 0 || d.topUpCredits > 0);

  return (
    <Card className={`bg-surface-1 border-hairline shadow-linear ${className || ""}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-medium">
            {workspaceId ? "Workspace Usage Over Time" : "Global Usage Over Time"}
          </CardTitle>
          <CardDescription>
            Comparing Consumed Credits vs Top-up Credits
          </CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={grouping} onValueChange={(v) => setGrouping(v as Grouping)}>
            <TabsList className="h-8">
              <TabsTrigger value="month" className="text-xs px-3 h-6">Month</TabsTrigger>
              <TabsTrigger value="quarter" className="text-xs px-3 h-6">Quarter</TabsTrigger>
              <TabsTrigger value="year" className="text-xs px-3 h-6">Year</TabsTrigger>
            </TabsList>
          </Tabs>

          {grouping !== "year" && (
            <div className="w-[90px]">
              <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v || ""))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((y) => (
                    <SelectItem key={y} value={y.toString()} className="text-xs">
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-red-500">
            Failed to load chart data
          </div>
        ) : !hasData ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            No data available for selected period
          </div>
        ) : (
          <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                barGap={8}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  dx={-10}
                  tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                />
                <Tooltip
                  cursor={{ fill: "#334155", opacity: 0.1 }}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "8px",
                    color: "#f8fafc",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                    fontSize: "13px"
                  }}
                  itemStyle={{ fontWeight: 500 }}
                  formatter={(value: any) => [value?.toLocaleString(), "Credits"]}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: "13px", paddingTop: "20px" }}
                />
                <Bar
                  dataKey="consumedCredits"
                  name="Consumed"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                  activeBar={<Rectangle fill="#2563eb" />}
                />
                <Bar
                  dataKey="topUpCredits"
                  name="Top-up"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                  activeBar={<Rectangle fill="#059669" />}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
