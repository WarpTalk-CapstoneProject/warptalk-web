"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, AlertTriangle, Building2, User, Bot, Check, Copy, Shield, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { billingService } from "@/services/billing.service";
import Link from "next/link";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function IdBadge({ id, type, name }: { id: string, type: "workspace" | "user" | "system" | "admin", name?: string | null }) {
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
        {type === "workspace" && <Building2 className="w-3.5 h-3.5 text-muted-foreground" />}
        {type === "user" && <User className="w-3.5 h-3.5 text-muted-foreground" />}
        {type === "admin" && <Shield className="w-3.5 h-3.5 text-primary" />}
        {type === "system" && <Bot className="w-3.5 h-3.5 text-blue-400" />}
      </div>
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-1 border border-border-dim border-b-border cursor-pointer hover:bg-surface-2 hover:border-border transition-colors group relative"
        onClick={handleCopy}
        title={`Click to copy ID: ${id}`}
      >
        <span className={`text-xs font-mono font-medium ${type === "system" ? "text-blue-400" : type === "admin" ? "text-primary" : "text-foreground-muted"}`}>
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

export function AdminSubscriptionsTab() {
  const [page, setPage] = useState(1);
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [planFilter, setPlanFilter] = useState("ALL");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["global-subscriptions-list"],
    queryFn: () => billingService.getGlobalSubscriptions(1, 200), // Fetch up to 200 for client-side filtering
  });

  const cancelMutation = useMutation({
    mutationFn: (workspaceId: string) => billingService.cancelSubscription(workspaceId, "Admin force cancel"),
    onSuccess: () => {
      toast.success("Subscription cancelled successfully");
      queryClient.invalidateQueries({ queryKey: ["global-subscriptions-list"] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || "Failed to cancel subscription"),
  });

  const subscriptions = data?.items || [];

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter(sub => {
      const matchWorkspace = workspaceFilter ? sub.workspaceId?.toLowerCase().includes(workspaceFilter.toLowerCase()) : true;
      const matchStatus = statusFilter !== "ALL" ? sub.status?.toLowerCase() === statusFilter.toLowerCase() : true;
      const matchPlan = planFilter !== "ALL" ? sub.planName?.toLowerCase().includes(planFilter.toLowerCase()) : true;
      return matchWorkspace && matchStatus && matchPlan;
    });
  }, [subscriptions, workspaceFilter, statusFilter, planFilter]);

  const displayTotalCount = filteredSubscriptions.length;
  const totalPages = Math.ceil(displayTotalCount / 20);
  const paginatedSubscriptions = useMemo(() => {
    return filteredSubscriptions.slice((page - 1) * 20, page * 20);
  }, [filteredSubscriptions, page]);

  const activeFiltersCount = [
    workspaceFilter !== "",
    statusFilter !== "ALL",
    planFilter !== "ALL",
  ].filter(Boolean).length;

  const resetFilters = () => {
    setWorkspaceFilter("");
    setStatusFilter("ALL");
    setPlanFilter("ALL");
    setPage(1);
  };

  return (
    <Card className="rounded-xl border border-hairline bg-surface-1 shadow-linear flex flex-col h-[600px]">
      <CardHeader className="p-4 border-b border-hairline bg-surface-1/50 flex-none">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Global Subscriptions</CardTitle>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-hairline">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val || "ALL"); setPage(1); }}>
              <SelectTrigger className="w-[140px] h-8 text-sm">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Plan Tier</Label>
            <Select value={planFilter} onValueChange={(val) => { setPlanFilter(val || "ALL"); setPage(1); }}>
              <SelectTrigger className="w-[140px] h-8 text-sm">
                <SelectValue placeholder="All plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Plans</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Workspace ID</Label>
            <Input type="text" placeholder="Enter ID..." className="h-8 text-sm w-[160px]"
              value={workspaceFilter}
              onChange={(e) => { setWorkspaceFilter(e.target.value); setPage(1); }} />
          </div>

          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1.5 self-end" onClick={resetFilters}>
              <span>Clear</span>
              <Badge className="h-4 px-1 text-[10px] font-semibold rounded-full">{activeFiltersCount}</Badge>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-surface-2 sticky top-0 z-10">
            <TableRow className="border-hairline hover:bg-transparent">
              <TableHead>Workspace</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Billing Cycle End</TableHead>
              <TableHead className="text-right">Credits Remaining</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : paginatedSubscriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No subscriptions found
                </TableCell>
              </TableRow>
            ) : paginatedSubscriptions.map((sub) => (
              <TableRow key={sub.id} className="border-hairline hover:bg-surface-2">
                <TableCell>
                  <Link href={`/billing/workspace/${sub.workspaceId}`} className="block hover:opacity-80 transition-opacity">
                    <IdBadge id={sub.workspaceId!} type="workspace" name={sub.workspaceName} />
                  </Link>
                </TableCell>
                <TableCell className="text-sm font-semibold text-ink">{sub.planName}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={
                    sub.status === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" : 
                    sub.status === "cancelled" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30" : "bg-surface-3 text-ink"
                  }>
                    {sub.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">
                  {sub.currentPeriodEnd ? format(new Date(sub.currentPeriodEnd), "MMM d, yyyy HH:mm") : "N/A"}
                </TableCell>
                <TableCell className="text-right font-medium font-mono text-sm text-ink">
                  {sub.creditsRemaining.toLocaleString()}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  {sub.status === "active" && (
                    <Dialog>
                      <DialogTrigger render={<Button variant="destructive" size="sm" className="h-7 text-xs font-medium rounded-md px-2.5" />}>
                        Force Cancel
                      </DialogTrigger>
                      <DialogContent className="bg-surface-1 border-hairline rounded-xl">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                            Force Cancel Subscription
                          </DialogTitle>
                          <DialogDescription className="text-sm text-muted-foreground mt-2">
                            Are you sure you want to cancel the subscription for Workspace <strong>{sub.workspaceId?.substring(0,8) || "Unknown"}</strong>? 
                            This action cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="mt-4 gap-2">
                          <Button variant="outline" size="sm" className="rounded-md">Close</Button>
                          <Button variant="destructive" size="sm" className="rounded-md" onClick={() => cancelMutation.mutate(sub.workspaceId!)}>
                            Confirm Cancel
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Pagination */}
      <div className="p-4 border-t border-hairline flex items-center justify-between bg-surface-1">
        <p className="text-xs text-muted-foreground">
          {data ? (
            <>Showing <strong>{(page - 1) * 20 + 1}–{Math.min(page * 20, displayTotalCount)}</strong> of <strong>{displayTotalCount}</strong> subscriptions</>
          ) : "Loading..."}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md"
              disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</Button>

            {(() => {
              const pages: (number | "...")[] = [];
              const delta = 2;
              for (let i = 1; i <= totalPages; i++) {
                if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
                  pages.push(i);
                } else if (pages[pages.length - 1] !== "...") {
                  pages.push("...");
                }
              }
              return pages.map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} className="h-7 w-7 flex items-center justify-center text-xs text-muted-foreground">…</span>
                ) : (
                  <Button key={p} variant={p === page ? "default" : "outline"} size="sm"
                    className="h-7 w-7 p-0 rounded-md text-xs" onClick={() => setPage(p as number)}>{p}</Button>
                )
              );
            })()}

            <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md"
              disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
