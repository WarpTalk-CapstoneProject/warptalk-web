"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, Check, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { billingService } from "@/services/billing.service";
import type { SubscriptionDto } from "@/types/billing";

const PAGE_SIZE = 20;
const TRIAL_ENDING_SOON_DAYS = 3;
const LOW_BALANCE_PERCENT = 20;

interface ContractReviewItem {
  workspaceId: string;
  workspaceName?: string | null;
  severity: "critical" | "warning" | "info";
  status: string;
  reason: string;
  detail: string;
}

function WorkspaceBadge({ id, name }: { id: string; name?: string | null }) {
  const [copied, setCopied] = useState(false);
  const displayName = name && name.trim() !== "" ? name : id.substring(0, 8);

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
        title="Copy workspace ID"
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

function buildReviewItems(subscriptions: SubscriptionDto[]): ContractReviewItem[] {
  const now = Date.now();
  const trialEndingSoonMs = TRIAL_ENDING_SOON_DAYS * 24 * 60 * 60 * 1000;

  return subscriptions.flatMap((sub) => {
    if (!sub.workspaceId) return [];

    const items: ContractReviewItem[] = [];
    const effectiveCredits = sub.effectiveCreditsPerCycle ?? 0;
    const creditsRemaining = sub.creditsRemaining ?? 0;
    const usedPercent = effectiveCredits > 0
      ? Math.max(0, Math.round(((effectiveCredits - creditsRemaining) / effectiveCredits) * 100))
      : 0;
    const normalizedState = sub.serviceState?.toLowerCase();

    if (normalizedState === "suspended") {
      items.push({
        workspaceId: sub.workspaceId,
        workspaceName: sub.workspaceName,
        severity: "critical",
        status: "Suspended",
        reason: sub.suspendedReason === "invoice_overdue"
          ? "Invoice is overdue past grace period."
          : "AI service is paused for this workspace.",
        detail: "Review the workspace contract before resuming service.",
      });
    }

    if (normalizedState === "in_overage" || (sub.overageCreditsThisCycle ?? 0) > 0) {
      items.push({
        workspaceId: sub.workspaceId,
        workspaceName: sub.workspaceName,
        severity: "warning",
        status: "Extra usage",
        reason: `${(sub.overageCreditsThisCycle ?? 0).toLocaleString()} extra credits used this cycle.`,
        detail: "Review extra usage with the billing contact.",
      });
    }

    if (normalizedState === "low_balance" || (effectiveCredits > 0 && creditsRemaining <= effectiveCredits * (LOW_BALANCE_PERCENT / 100))) {
      items.push({
        workspaceId: sub.workspaceId,
        workspaceName: sub.workspaceName,
        severity: "warning",
        status: "Low balance",
        reason: `${creditsRemaining.toLocaleString()} credits remaining (${usedPercent}% used).`,
        detail: "Notify the billing contact.",
      });
    }

    if (sub.trialEndsAt) {
      const trialEndsAt = new Date(sub.trialEndsAt).getTime();
      const isActiveTrial = trialEndsAt > now;
      const isEndingSoon = trialEndsAt - now <= trialEndingSoonMs;

      if (isActiveTrial && isEndingSoon) {
        items.push({
          workspaceId: sub.workspaceId,
          workspaceName: sub.workspaceName,
          severity: "info",
          status: "Trial ending",
          reason: `Trial ends on ${new Date(sub.trialEndsAt).toLocaleDateString()}.`,
          detail: "Confirm Enterprise contract terms before the trial expires.",
        });
      }
    }

    return items;
  });
}

export function AdminAlertsTab() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["contract-review-subscriptions"],
    queryFn: () => billingService.getGlobalSubscriptions(1, 200),
  });

  const reviewItems = useMemo(() => buildReviewItems(data?.items ?? []), [data?.items]);
  const signalCounts = useMemo(() => ({
    trialEnding: reviewItems.filter((item) => item.status === "Trial ending").length,
    lowBalance: reviewItems.filter((item) => item.status === "Low balance").length,
    extraUsage: reviewItems.filter((item) => item.status === "Extra usage").length,
    suspended: reviewItems.filter((item) => item.status === "Suspended").length,
  }), [reviewItems]);
  const totalCount = reviewItems.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageItems = useMemo(
    () => reviewItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, reviewItems]
  );

  const showingFrom = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <Card className="flex flex-col rounded-xl border border-hairline bg-surface-1 shadow-linear">
      <CardHeader className="border-b border-hairline bg-surface-1/50 p-5">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Review queue</CardTitle>
        </div>
        <CardDescription className="mt-1 text-sm text-muted-foreground">
          Workspaces with billing signals that need finance or account follow-up.
        </CardDescription>

        <div className="mt-4 grid gap-2 rounded-lg border border-hairline bg-surface-2/45 p-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md bg-surface-1 px-3 py-2">
            <p className="text-[11px] font-medium text-muted-foreground">Trial ending</p>
            <p className="mt-1 text-lg font-semibold text-ink">{signalCounts.trialEnding}</p>
          </div>
          <div className="rounded-md bg-surface-1 px-3 py-2">
            <p className="text-[11px] font-medium text-muted-foreground">Low balance</p>
            <p className="mt-1 text-lg font-semibold text-ink">{signalCounts.lowBalance}</p>
          </div>
          <div className="rounded-md bg-surface-1 px-3 py-2">
            <p className="text-[11px] font-medium text-muted-foreground">Extra usage</p>
            <p className="mt-1 text-lg font-semibold text-ink">{signalCounts.extraUsage}</p>
          </div>
          <div className="rounded-md bg-surface-1 px-3 py-2">
            <p className="text-[11px] font-medium text-muted-foreground">Suspended</p>
            <p className="mt-1 text-lg font-semibold text-ink">{signalCounts.suspended}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-surface-2">
            <TableRow className="border-hairline hover:bg-transparent">
              <TableHead>Workspace</TableHead>
              <TableHead>Contract signal</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Next action</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : pageItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-sm text-muted-foreground">
                  No workspace needs contract review right now.
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((item, index) => (
                <TableRow key={`${item.workspaceId}-${item.status}-${index}`} className="border-hairline hover:bg-surface-2">
                  <TableCell>
                    <WorkspaceBadge id={item.workspaceId} name={item.workspaceName} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        item.severity === "critical"
                          ? "border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : item.severity === "warning"
                            ? "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            : "border-primary/30 bg-primary/10 text-primary"
                      }
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{item.reason}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.detail}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/billing/workspace/${item.workspaceId}`}>
                      <Button variant="outline" size="sm" className="h-8 rounded-md px-3 text-xs font-medium">
                        Open contract
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <div className="flex flex-col gap-3 border-t border-hairline bg-surface-1 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isLoading
            ? "Loading contract review..."
            : totalCount === 0
              ? "0 workspaces need review"
              : `Showing ${showingFrom}-${showingTo} of ${totalCount} review items`}
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
