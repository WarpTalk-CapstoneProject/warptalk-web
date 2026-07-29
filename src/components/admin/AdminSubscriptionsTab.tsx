"use client";

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Building2, Check, Copy, Loader2, Search, Play, XCircle, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { billingService } from "@/services/billing.service";
import { WorkspaceService } from "@/services/workspace.service";
import { toast } from "sonner";

const DEFAULT_PAGE_SIZE = 10;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const response = (error as { response?: { data?: { error?: unknown; message?: unknown } } }).response;
    const message = response?.data?.message ?? response?.data?.error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "N/A";
}

function formatMoney(value: number | null | undefined) {
  return typeof value === "number" ? `${value.toLocaleString()} VND` : "N/A";
}

function getBillingStateLabel(status?: string | null, isTrial?: boolean) {
  const normalized = status?.toLowerCase() || "unknown";
  if (isTrial) {
    if (normalized === "active") return "Trial active";
    if (normalized === "cancelled") return "Trial cancelled";
    if (normalized === "expired") return "Trial expired";
    if (normalized === "pending") return "Trial pending";
    return `Trial ${normalized}`;
  }
  if (normalized === "active") return "Contract active";
  if (normalized === "cancelled") return "Contract cancelled";
  if (normalized === "expired") return "Contract expired";
  if (normalized === "pending") return "Contract pending";
  return normalized;
}

function WorkspaceBadge({ id, name }: { id: string; name?: string | null }) {
  const [copied, setCopied] = useState(false);
  const displayName = name?.trim() || id.substring(0, 8);

  const handleCopy = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex min-w-[180px] items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-surface-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
      </div>
      <button
        type="button"
        onClick={handleCopy}
        title={`Copy workspace ID: ${id}`}
        className="group min-w-0 rounded-md border border-hairline bg-surface-2 px-2 py-1 text-left transition hover:border-primary/40 hover:bg-surface-3"
      >
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
          {copied ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-semantic-success" />
          ) : (
            <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          )}
        </span>
      </button>
    </div>
  );
}

export function AdminSubscriptionsTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["global-subscriptions-list"],
    queryFn: () => billingService.getGlobalSubscriptions(1, 200),
  });

  const subscriptions = useMemo(() => data?.items ?? [], [data?.items]);

  const { data: workspaces } = useQuery({
    queryKey: ["admin-subscription-workspace-names"],
    queryFn: () => WorkspaceService.list(1, 500, ""),
  });

  const { data: workspaceDetailsById } = useQuery({
    queryKey: ["admin-subscription-workspace-details", subscriptions.map((sub) => sub.workspaceId).filter(Boolean).join(",")],
    queryFn: async () => {
      const ids = Array.from(new Set(subscriptions.map((sub) => sub.workspaceId).filter(Boolean))) as string[];
      const results = await Promise.allSettled(ids.map((id) => WorkspaceService.getById(id)));
      return new Map(
        results.flatMap((result) => result.status === "fulfilled"
          ? [[result.value.id, result.value.name] as const]
          : [])
      );
    },
    enabled: subscriptions.some((sub) => Boolean(sub.workspaceId)),
  });

  const { data: salesInquiries } = useQuery({
    queryKey: ["admin-subscription-sales-inquiry-names"],
    queryFn: () => billingService.getSalesInquiries(1, 500),
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: (workspaceId: string) => billingService.cancelSubscription(workspaceId, "Cancelled by Admin"),
    onSuccess: () => {
      toast.success("Subscription cancelled successfully.");
      queryClient.invalidateQueries({ queryKey: ["global-subscriptions-list"] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to cancel subscription."));
    },
  });

  const resumeSubscriptionMutation = useMutation({
    mutationFn: (workspaceId: string) => billingService.resumeSubscription(workspaceId, "Resumed by Admin"),
    onSuccess: () => {
      toast.success("Subscription resumed successfully.");
      queryClient.invalidateQueries({ queryKey: ["global-subscriptions-list"] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to resume subscription."));
    },
  });

  const workspaceNamesById = useMemo(() => {
    const names = new Map<string, string>();
    (salesInquiries?.items ?? []).forEach((inquiry) => {
      if (inquiry.workspaceId && inquiry.company) names.set(inquiry.workspaceId, inquiry.company);
    });
    (workspaces?.items ?? []).forEach((workspace) => {
      names.set(workspace.id, workspace.name);
    });
    (workspaceDetailsById ?? new Map<string, string>()).forEach((name, id) => {
      names.set(id, name);
    });
    return names;
  }, [salesInquiries?.items, workspaceDetailsById, workspaces?.items]);

  const filteredSubscriptions = useMemo(() => {
    const query = workspaceFilter.trim().toLowerCase();

    return subscriptions.filter((sub) => {
      const resolvedWorkspaceName = sub.workspaceId ? workspaceNamesById.get(sub.workspaceId) : undefined;
      const matchesWorkspace = query
        ? sub.workspaceId?.toLowerCase().includes(query)
          || sub.workspaceName?.toLowerCase().includes(query)
          || resolvedWorkspaceName?.toLowerCase().includes(query)
          || sub.billingContactEmail?.toLowerCase().includes(query)
        : true;
      const matchesStatus = statusFilter === "all" || sub.status?.toLowerCase() === statusFilter;

      return matchesWorkspace && matchesStatus;
    });
  }, [statusFilter, subscriptions, workspaceFilter, workspaceNamesById]);

  const totalCount = filteredSubscriptions.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageItems = useMemo(
    () => filteredSubscriptions.slice((page - 1) * pageSize, page * pageSize),
    [filteredSubscriptions, page, pageSize]
  );

  const activeFiltersCount = [
    workspaceFilter.trim() !== "",
    statusFilter !== "all",
  ].filter(Boolean).length;

  const resetFilters = () => {
    setWorkspaceFilter("");
    setStatusFilter("all");
    setPage(1);
  };

  const showingFrom = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, totalCount);

  return (
    <Card className="flex flex-col rounded-xl border border-hairline bg-surface-1 shadow-linear">
      <CardHeader className="border-b border-hairline bg-surface-1/50 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">Workspace contracts</CardTitle>
            <p className="text-sm text-muted-foreground">
              Review Enterprise contract terms, billing contacts, service state, and invoice controls.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-hairline bg-surface-2/45 px-3 py-2.5 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={workspaceFilter}
              onChange={(event) => {
                setWorkspaceFilter(event.target.value);
                setPage(1);
              }}
              placeholder="Search company, workspace ID, or finance email"
              className="h-9 rounded-md border-transparent bg-surface-1 pl-8 pr-3 text-sm shadow-none focus-visible:border-primary/30"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2 py-1">
              <span className="text-[11px] font-medium text-muted-foreground">Status</span>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value ?? "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-7 w-[112px] border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2 py-1">
              <span className="text-[11px] font-medium text-muted-foreground">Rows</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-7 w-[64px] border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {activeFiltersCount > 0 && (
              <Badge className="h-7 rounded-md px-2 text-[11px] font-semibold">{activeFiltersCount} active</Badge>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={resetFilters}
              disabled={activeFiltersCount === 0}
            >
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-surface-2">
            <TableRow className="border-hairline hover:bg-transparent">
              <TableHead>Workspace</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>Cycle & invoice</TableHead>
              <TableHead>Billing contact</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : pageItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                  No contracts match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((sub) => {
                const isTrial = !!sub.trialEndsAt;
                const isSuspended = sub.serviceState === "suspended" || sub.status === "suspended";

                return (
                  <TableRow key={sub.id} className="border-hairline hover:bg-surface-2">
                    <TableCell>
                      <WorkspaceBadge
                        id={sub.workspaceId!}
                        name={(sub.workspaceId ? workspaceNamesById.get(sub.workspaceId) : undefined) ?? sub.workspaceName}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          sub.status === "active" && !isSuspended
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : isSuspended
                              ? "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              : sub.status === "cancelled"
                                ? "border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                : "bg-surface-3 text-ink"
                        }
                      >
                        {isSuspended ? "Suspended" : getBillingStateLabel(sub.status, isTrial)}
                      </Badge>
                      {!isSuspended && sub.serviceState && sub.serviceState !== "healthy" && (
                        <div className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          {sub.serviceState.replace("_", " ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-xs">
                        <div className="font-semibold text-ink">{formatNumber(sub.creditsRemaining)} remaining</div>
                        <div className="text-muted-foreground">
                          {isTrial ? "Trial credits" : `${formatNumber(sub.effectiveCreditsPerCycle)} / cycle`}
                        </div>
                        {!isTrial && (
                          <div className="text-muted-foreground">{formatMoney(sub.effectiveContractPriceVnd)} before VAT</div>
                        )}
                        {(sub.overageCreditsThisCycle ?? 0) > 0 && (
                          <div className="font-medium text-amber-600 dark:text-amber-400">
                            {formatNumber(sub.overageCreditsThisCycle)} overage used
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="space-y-0.5">
                        <div>
                          {isTrial ? "Trial ends" : "Renews"}:{" "}
                          <span className="font-mono text-ink">
                            {sub.trialEndsAt
                              ? format(new Date(sub.trialEndsAt), "MMM d, yyyy")
                              : sub.currentPeriodEnd
                                ? format(new Date(sub.currentPeriodEnd), "MMM d, yyyy")
                                : "N/A"}
                          </span>
                        </div>
                        {!isTrial && (
                          <>
                            <div>NET-{formatNumber(sub.effectiveInvoiceTermsDays)}</div>
                            <div>Overage {formatNumber(sub.effectiveOveragePricePerCredit)} VND/cr</div>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-xs">
                        <div className="max-w-[180px] truncate font-medium text-ink" title={sub.billingContactEmail ?? undefined}>
                          {sub.billingContactEmail || "No finance email"}
                        </div>
                        {sub.suspendedReason && (
                          <div className="text-amber-600 dark:text-amber-400">{sub.suspendedReason}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isSuspended ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-md px-2 text-xs font-medium text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                            onClick={() => sub.workspaceId && resumeSubscriptionMutation.mutate(sub.workspaceId)}
                            title="Resume Suspended Contract"
                          >
                            <Play className="h-3.5 w-3.5 mr-1" /> Resume
                          </Button>
                        ) : sub.status === "active" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-md px-2 text-xs font-medium text-rose-600 border-rose-500/30 hover:bg-rose-500/10"
                            onClick={() => sub.workspaceId && cancelSubscriptionMutation.mutate(sub.workspaceId)}
                            title="Cancel Contract"
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                          </Button>
                        ) : null}

                        <Link href={`/billing/workspace/${sub.workspaceId}`}>
                          <Button variant="default" size="sm" className="h-8 rounded-md px-3 text-xs font-medium gap-1">
                            Open <ArrowUpRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>

      <div className="flex flex-col gap-3 border-t border-hairline bg-surface-1 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isLoading
            ? "Loading contracts..."
            : `Showing ${showingFrom}-${showingTo} of ${totalCount} contracts`}
        </p>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 rounded-md p-0"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            {"<"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 rounded-md p-0"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            {">"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
