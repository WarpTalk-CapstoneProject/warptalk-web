"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { billingService } from "@/services/billing.service";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Building2,
  Check,
  Copy,
  Loader2,
  Shield,
  ShieldAlert,
  User,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

function IdBadge({
  id,
  type,
  name,
}: {
  id: string;
  type: "workspace" | "user" | "system" | "admin";
  name?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortId = id.substring(0, 8);
  const displayName = name && name.trim() !== "" ? name : shortId;

  return (
    <div className="flex items-center gap-1.5 min-w-[120px]">
      <div className="p-1 rounded bg-surface-1/50 border border-border-dim border-b-border">
        {type === "workspace" && (
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        {type === "user" && (
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        {type === "admin" && <Shield className="w-3.5 h-3.5 text-primary" />}
        {type === "system" && <Bot className="w-3.5 h-3.5 text-blue-400" />}
      </div>
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-1 border border-border-dim border-b-border cursor-pointer hover:bg-surface-2 hover:border-border transition-colors group relative"
        onClick={handleCopy}
        title={`Click to copy ID: ${id}`}
      >
        <span
          className={`text-xs font-mono font-medium ${type === "system" ? "text-blue-400" : type === "admin" ? "text-primary" : "text-foreground-muted"}`}
        >
          {displayName}
        </span>
        {copied ? (
          <Check className="w-3 h-3 text-semantic-success" />
        ) : (
          <Copy className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
}

export function AdminAlertsTab() {
  const [page, setPage] = useState(1);
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [minCreditsFilter, setMinCreditsFilter] = useState<number | "">("");

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["global-usage-alerts"],
    queryFn: () => billingService.getUsageAlerts(),
  });

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const matchWorkspace = workspaceFilter
        ? alert.workspaceId
            ?.toLowerCase()
            .includes(workspaceFilter.toLowerCase()) ||
          alert.workspaceName
            ?.toLowerCase()
            .includes(workspaceFilter.toLowerCase())
        : true;
      const matchCredits =
        minCreditsFilter !== ""
          ? alert.consumedCreditsIn24h >= minCreditsFilter
          : true;
      return matchWorkspace && matchCredits;
    });
  }, [alerts, workspaceFilter, minCreditsFilter]);

  const displayTotalCount = filteredAlerts.length;
  const totalPages = Math.ceil(displayTotalCount / 20);
  const paginatedAlerts = useMemo(() => {
    return filteredAlerts.slice((page - 1) * 20, page * 20);
  }, [filteredAlerts, page]);

  const activeFiltersCount = [
    workspaceFilter !== "",
    minCreditsFilter !== "",
  ].filter(Boolean).length;

  const resetFilters = () => {
    setWorkspaceFilter("");
    setMinCreditsFilter("");
    setPage(1);
  };

  return (
    <Card className="rounded-xl border border-hairline bg-surface-1 shadow-linear flex flex-col h-[600px]">
      <CardHeader className="p-4 border-b border-hairline bg-surface-1/50 flex-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-500" />
            <CardTitle className="text-lg">Fraud & Usage Alerts</CardTitle>
          </div>
        </div>
        <CardDescription className="text-xs text-muted-foreground mt-1">
          Workspaces with unusually high credit consumption (&gt;50,000 credits
          in the last 24 hours).
        </CardDescription>

        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-hairline">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">
              Workspace ID / Name
            </Label>
            <Input
              type="text"
              placeholder="Search workspace..."
              className="h-8 text-sm w-[180px]"
              value={workspaceFilter}
              onChange={(e) => {
                setWorkspaceFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">
              Min 24h Consumption (cr)
            </Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 50000"
              className="h-8 text-sm w-[180px]"
              value={minCreditsFilter}
              onChange={(e) => {
                setMinCreditsFilter(
                  e.target.value ? Number(e.target.value) : "",
                );
                setPage(1);
              }}
            />
          </div>

          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground gap-1.5 self-end"
              onClick={resetFilters}
            >
              <span>Clear</span>
              <Badge className="h-4 px-1 text-[10px] font-semibold rounded-full">
                {activeFiltersCount}
              </Badge>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-surface-2 sticky top-0 z-10">
            <TableRow className="border-hairline hover:bg-transparent">
              <TableHead>Workspace</TableHead>
              <TableHead>Workspace Name</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">24h Consumption</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : paginatedAlerts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  No anomalous usage detected in the last 24 hours.
                </TableCell>
              </TableRow>
            ) : (
              paginatedAlerts.map((alert, idx) => (
                <TableRow
                  key={idx}
                  className="border-hairline hover:bg-surface-2"
                >
                  <TableCell>
                    <Link
                      href={`/billing/workspace/${alert.workspaceId}`}
                      className="block hover:opacity-80 transition-opacity"
                    >
                      <IdBadge id={alert.workspaceId} type="workspace" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-ink">
                    {alert.workspaceName}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-rose-500 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">{alert.reason}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold font-mono text-rose-500">
                    {alert.consumedCreditsIn24h.toLocaleString()} cr
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/billing/workspace/${alert.workspaceId}`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs font-medium rounded-md"
                      >
                        Investigate
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Pagination */}
      <div className="p-4 border-t border-hairline flex items-center justify-between bg-surface-1">
        <p className="text-xs text-muted-foreground">
          {alerts ? (
            <>
              Showing{" "}
              <strong>
                {(page - 1) * 20 + 1}–{Math.min(page * 20, displayTotalCount)}
              </strong>{" "}
              of <strong>{displayTotalCount}</strong> alerts
            </>
          ) : (
            "Loading..."
          )}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 rounded-md"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </Button>

            {(() => {
              const pages: (number | "...")[] = [];
              const delta = 2;
              for (let i = 1; i <= totalPages; i++) {
                if (
                  i === 1 ||
                  i === totalPages ||
                  (i >= page - delta && i <= page + delta)
                ) {
                  pages.push(i);
                } else if (pages[pages.length - 1] !== "...") {
                  pages.push("...");
                }
              }
              return pages.map((p, i) =>
                p === "..." ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="h-7 w-7 flex items-center justify-center text-xs text-muted-foreground"
                  >
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    className="h-7 w-7 p-0 rounded-md text-xs"
                    onClick={() => setPage(p as number)}
                  >
                    {p}
                  </Button>
                ),
              );
            })()}

            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 rounded-md"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
