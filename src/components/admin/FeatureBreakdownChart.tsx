"use client";

import { useQuery } from "@tanstack/react-query";
import { billingService } from "@/services/billing.service";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
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
  refetchIntervalMs?: number;
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f43f5e",
];

export function FeatureBreakdownChart({
  workspaceId,
  className,
  refetchIntervalMs,
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
    refetchInterval: refetchIntervalMs,
  });

  const chartData = useMemo(() => {
    if (!data) return [];

    // Convert generic names to friendly names if needed
    return data
      .map((d) => {
        let label = d.usageType;
        if (label === "chat") label = "AI Chat";
        else if (label === "translation" || label === "voice_translation")
          label = "Translation";
        else if (label === "summary" || label === "meeting_summary")
          label = "AI Summary";
        else if (label === "voice_clone" || label === "voice_cloning")
          label = "Voice Clone";
        else if (label === "text_to_speech") label = "AI Voice Synthesis";

        return {
          name: label,
          value: d.totalCreditsConsumed,
        };
      })
      .filter((d) => d.value > 0);
  }, [data]);

  const hasData = chartData.length > 0;

  return (
    <Card
      className={`min-w-0 bg-surface-1 border-hairline shadow-linear ${className || ""}`}
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
          <div className="mt-4 h-[250px] min-h-[250px] w-full min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={250}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "8px",
                    color: "#f8fafc",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    fontSize: "13px",
                  }}
                  itemStyle={{ fontWeight: 500 }}
                  formatter={(value) => [
                    `${value?.toLocaleString()} Credits`,
                    "Consumed",
                  ]}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: "13px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
