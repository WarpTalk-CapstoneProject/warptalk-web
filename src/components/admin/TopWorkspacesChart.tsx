"use client";

import { useQuery } from "@tanstack/react-query";
import { billingService } from "@/services/billing.service";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";

interface TopWorkspacesChartProps {
  className?: string;
}

export function TopWorkspacesChart({ className }: TopWorkspacesChartProps) {
  const [days, setDays] = useState<number>(30);
  const router = useRouter();

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
          <CardDescription>
            Highest credit consumption
          </CardDescription>
        </div>
        <div>
          <Tabs value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
            <TabsList className="h-8">
              <TabsTrigger value="7" className="text-xs px-3 h-6">7d</TabsTrigger>
              <TabsTrigger value="30" className="text-xs px-3 h-6">30d</TabsTrigger>
              <TabsTrigger value="90" className="text-xs px-3 h-6">90d</TabsTrigger>
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
            Failed to load workspace data
          </div>
        ) : !hasData ? (
          <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
            No consumption recorded for this period
          </div>
        ) : (
          <div className="h-[250px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.5} />
                <XAxis 
                  type="number" 
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={{ stroke: "#334155" }}
                  tickLine={false}
                />
                <YAxis 
                  type="category" 
                  dataKey="workspaceName" 
                  tick={{ fill: "#e2e8f0", fontSize: 13 }}
                  axisLine={{ stroke: "#334155" }}
                  tickLine={false}
                  width={100}
                />
                <Tooltip
                  cursor={{ fill: "#1e293b", opacity: 0.4 }}
                  contentStyle={{ 
                    backgroundColor: "#0f172a", 
                    borderColor: "#334155",
                    borderRadius: "8px",
                    color: "#f8fafc",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  itemStyle={{ color: "#3b82f6", fontWeight: 500 }}
                  formatter={(value: number) => [value.toLocaleString() + " Credits", "Consumed"]}
                />
                <Bar 
                  dataKey="consumedCredits" 
                  fill="#3b82f6" 
                  radius={[0, 4, 4, 0]}
                  barSize={24}
                  onClick={(data) => {
                    const id = data?.workspaceId || data?.payload?.workspaceId;
                    if (id) {
                      router.push(`/internal/billing/workspace/${id}`);
                    }
                  }}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
