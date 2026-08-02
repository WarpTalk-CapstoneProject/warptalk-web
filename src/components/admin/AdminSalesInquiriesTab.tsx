"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BILLING_POLICY } from "@/constants/billing-policy";
import { billingService } from "@/services/billing.service";
import type { PlanDto, PricingConfigDto, SalesInquiryDto, UpdateSubscriptionContractTermsRequest } from "@/types/billing";

const statusOptions = ["new", "reviewing", "closed"];
const statusSortRank: Record<string, number> = {
  new: 0,
  reviewing: 1,
  closed: 2,
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const response = (error as { response?: { data?: { error?: unknown; message?: unknown } } }).response;
    const message = response?.data?.error ?? response?.data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function getWorkflowStatus(status: string) {
  if (status === "converted" || status === "closed") return "closed";
  if (status === "quoted") return "reviewing";
  return status;
}

function getEstimateNumber(inquiry: SalesInquiryDto, key: string): number | null {
  const estimate = inquiry.pricingEstimate;
  if (!estimate || typeof estimate !== "object") return null;
  const value = (estimate as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "N/A";
}

function getRequestedCredits(inquiry: SalesInquiryDto): number | null {
  const match = inquiry.currentMonthlyMeetingVolume.match(/([\d,.]+)\s*credits?/i);
  if (!match) return getEstimateNumber(inquiry, "estimatedCredits");
  const value = Number(match[1].replace(/[,.]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function getBaselineCredits(plan?: PlanDto | null): number | null {
  return typeof plan?.creditsPerCycle === "number" ? plan.creditsPerCycle : null;
}

function formatCreditDelta(requested: number | null, baseline: number | null) {
  if (requested == null || baseline == null) return "No comparison yet";
  const delta = requested - baseline;
  if (delta === 0) return "Matches baseline";
  return `${delta > 0 ? "+" : ""}${delta.toLocaleString()} vs baseline`;
}

function CompareCell({ value, tone = "default" }: { value: React.ReactNode; tone?: "default" | "muted" | "warning" }) {
  return (
    <span className={`text-sm font-medium ${tone === "warning" ? "text-amber-600" : tone === "muted" ? "text-muted-foreground" : "text-foreground"}`}>
      {value}
    </span>
  );
}

function countCsvItems(value?: string) {
  if (!value || value === "N/A") return null;
  return value.split(",").map((item) => item.trim()).filter(Boolean).length;
}

function compactList(value?: string) {
  const count = countCsvItems(value);
  if (!count) return value || "N/A";
  return `${count} selected`;
}

function parseInteger(value?: string | null): number | null {
  if (!value) return null;
  const match = value.match(/[\d,.]+/);
  if (!match) return null;
  const parsed = Number(match[0].replace(/[,.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePaymentTerms(value?: string | null, fallback: number = BILLING_POLICY.defaultInvoiceTermsDays): number {
  const parsed = parseInteger(value);
  return parsed && parsed > 0 ? parsed : fallback;
}

function getDefaultInvoiceTerms(plan?: PlanDto | null, pricingConfig?: PricingConfigDto | null) {
  return plan?.invoiceTermsDays ?? pricingConfig?.defaultInvoiceTermsDays ?? BILLING_POLICY.defaultInvoiceTermsDays;
}

function getEffectiveBillingPolicy(config?: PricingConfigDto | null) {
  return {
    minimumPricePerCreditVnd: config?.minimumPricePerCreditVnd ?? BILLING_POLICY.minimumPricePerCreditVnd,
    minimumContractPriceVnd: config?.minimumContractPriceVnd ?? BILLING_POLICY.minimumContractPriceVnd,
    defaultOverageCapRatio: config?.defaultOverageCapRatio ?? BILLING_POLICY.defaultOverageCapRatio,
  };
}

function calculateSuggestedTerms(inquiry: SalesInquiryDto, plan?: PlanDto | null, pricingConfig?: PricingConfigDto | null): UpdateSubscriptionContractTermsRequest {
  const policy = getEffectiveBillingPolicy(pricingConfig);
  const requestDetails = parseRequestNotes(inquiry);
  const baselineCredits = getBaselineCredits(plan) ?? 0;
  const requestedCredits = getRequestedCredits(inquiry) ?? baselineCredits;
  const approvedCredits = Math.max(1, requestedCredits || baselineCredits);
  const creditFloorPrice = approvedCredits * policy.minimumPricePerCreditVnd;
  const suggestedPrice = Math.ceil(Math.max(policy.minimumContractPriceVnd, plan?.price ?? 0, creditFloorPrice));

  return {
    creditsPerCycleOverride: Math.ceil(approvedCredits),
    contractPriceVnd: suggestedPrice,
    overageCapCreditsOverride: Math.min(
      plan?.overageCapCredits ?? Math.ceil(approvedCredits * policy.defaultOverageCapRatio),
      Math.ceil(approvedCredits)
    ),
    overagePricePerCreditOverride: plan?.overagePricePerCredit ?? null,
    invoiceTermsDaysOverride: normalizePaymentTerms(requestDetails.paymentTerms, getDefaultInvoiceTerms(plan, pricingConfig)),
    billingContactEmail: inquiry.workEmail,
  };
}

function parseRequestNotes(inquiry: SalesInquiryDto) {
  const details: Record<string, string> = {};
  const lines = (inquiry.useCaseNotes ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const readValue = (line: string, label: string) => line.startsWith(`${label}:`) ? line.slice(label.length + 1).trim() : null;

  for (const line of lines) {
    const company = readValue(line, "Company legal name");
    const billing = readValue(line, "Billing contact");
    const invoice = readValue(line, "Invoice email");
    const payment = readValue(line, "Payment terms");
    const credits = readValue(line, "Requested monthly credits");
    const frequency = readValue(line, "Billing frequency");
    const members = readValue(line, "Workspace members requested");
    const languages = readValue(line, "Languages");
    const aiServices = readValue(line, "AI services");
    const required = readValue(line, "Required features / limits");

    if (company) details.companyLegalName = company;
    if (billing) details.billingContact = billing;
    if (invoice) details.invoiceEmail = invoice;
    if (payment) details.paymentTerms = payment;
    if (credits) details.requestedMonthlyCredits = credits;
    if (frequency) details.billingFrequency = frequency;
    if (members) details.workspaceMembers = members;
    if (languages) details.languages = languages;
    if (aiServices) details.aiServices = aiServices;
    if (required) {
      const requiredMembers = required.match(/Workspace members requested:\s*([^,]+)/i)?.[1]?.trim();
      if (requiredMembers) details.workspaceMembers = requiredMembers;
    }
  }

  return details;
}

function statusClass(status: string) {
  switch (getWorkflowStatus(status)) {
    case "new":
      return "bg-primary/10 text-primary border-primary/20";
    case "reviewing":
      return "bg-amber-500/10 text-amber-700 border-amber-500/20";
    case "closed":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
    default:
      return "bg-surface-2 text-foreground border-hairline";
  }
}

function buildInitialTerms(inquiry: SalesInquiryDto, plan?: PlanDto | null, pricingConfig?: PricingConfigDto | null): UpdateSubscriptionContractTermsRequest {
  return calculateSuggestedTerms(inquiry, plan, pricingConfig);
}

export function AdminSalesInquiriesTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedInquiry, setSelectedInquiry] = useState<SalesInquiryDto | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [terms, setTerms] = useState<UpdateSubscriptionContractTermsRequest>({});

  const { data, isLoading } = useQuery({
    queryKey: ["sales-inquiries", statusFilter, search],
    queryFn: () => billingService.getSalesInquiries(1, 100, {
      status: statusFilter === "new" || statusFilter === "reviewing" ? statusFilter : "all",
      search,
    }),
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["billing-plans-for-sales-inquiries"],
    queryFn: () => billingService.getPlans(),
  });

  const { data: pricingConfig } = useQuery({
    queryKey: ["billing", "pricing-config"],
    queryFn: () => billingService.getPricingConfig(),
  });

  const enterprisePlan = useMemo(
    () => plans.find((plan) => plan.slug === "enterprise") ?? plans.find((plan) => plan.name.toLowerCase().includes("enterprise")),
    [plans]
  );

  const inquiries = useMemo(
    () => [...(data?.items ?? [])]
      .filter((inquiry) => statusFilter === "all" || getWorkflowStatus(inquiry.status) === statusFilter)
      .sort((left, right) => {
      const statusRank = (statusSortRank[getWorkflowStatus(left.status)] ?? 99) - (statusSortRank[getWorkflowStatus(right.status)] ?? 99);
      if (statusRank !== 0) return statusRank;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }),
    [data?.items, statusFilter]
  );

  const convertMutation = useMutation({
    mutationFn: () => {
      if (!selectedInquiry) throw new Error("No sales inquiry selected.");
      if (!workspaceId.trim()) throw new Error("This request is not linked to a workspace yet.");
      return billingService.convertSalesInquiryToContract(selectedInquiry.id, {
        workspaceId: workspaceId.trim(),
        planId: enterprisePlan?.id ?? null,
        contractTerms: terms,
      });
    },
    onSuccess: () => {
      toast.success("Workspace contract created.");
      setSelectedInquiry(null);
      setWorkspaceId("");
      setTerms({});
      queryClient.invalidateQueries({ queryKey: ["sales-inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["global-subscriptions-list"] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to convert sales inquiry."));
    },
  });

  const openConvertDialog = (inquiry: SalesInquiryDto) => {
    setSelectedInquiry(inquiry);
    setWorkspaceId(inquiry.workspaceId ?? "");
    setTerms(buildInitialTerms(inquiry, enterprisePlan, pricingConfig));
  };

  const updateTerm = (key: keyof UpdateSubscriptionContractTermsRequest, value: string) => {
    setTerms((current) => ({
      ...current,
      [key]: key === "billingContactEmail" ? value : value.trim() === "" ? null : Number(value),
    }));
  };

  return (
    <>
      <Card className="flex flex-col rounded-xl border border-hairline bg-surface-1 shadow-linear">
        <CardHeader className="border-b border-hairline bg-surface-1/50 p-5">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">Sales inquiries</CardTitle>
            <p className="text-sm text-muted-foreground">
              Review landing pricing requests and turn qualified demand into workspace contract terms.
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-hairline bg-surface-2/45 px-3 py-2.5 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search company, contact, or name"
                className="h-9 rounded-md border-transparent bg-surface-1 pl-8 pr-3 text-sm shadow-none focus-visible:border-primary/30"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "all")}>
              <SelectTrigger className="h-9 w-[160px] rounded-md bg-surface-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-surface-2">
              <TableRow className="border-hairline hover:bg-transparent">
                <TableHead>Company</TableHead>
                <TableHead>Requested credits</TableHead>
                <TableHead>Baseline</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : inquiries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                    No sales inquiries found.
                  </TableCell>
                </TableRow>
              ) : (
                inquiries.map((inquiry) => {
                  const requestedCredits = getRequestedCredits(inquiry);
                  const baselineCredits = getBaselineCredits(enterprisePlan);
                  const workflowStatus = getWorkflowStatus(inquiry.status);
                  return (
                    <TableRow key={inquiry.id} className="border-hairline">
                      <TableCell>
                        <div className="min-w-[190px]">
                          <p className="font-semibold text-foreground">{inquiry.company}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {inquiry.firstName} {inquiry.lastName} - {inquiry.workEmail}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-semibold text-foreground">
                          {requestedCredits != null ? `${requestedCredits.toLocaleString()} / month` : inquiry.currentMonthlyMeetingVolume}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-semibold text-foreground">{formatNumber(baselineCredits)} / month</p>
                          <p className={requestedCredits != null && baselineCredits != null && requestedCredits > baselineCredits ? "mt-0.5 text-xs text-amber-600" : "mt-0.5 text-xs text-muted-foreground"}>
                            {formatCreditDelta(requestedCredits, baselineCredits)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`inline-flex h-7 w-[92px] justify-center rounded-md px-2.5 text-xs font-medium ${statusClass(inquiry.status)}`}
                        >
                          {workflowStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        {workflowStatus === "closed" ? (
                          <span className="inline-flex h-8 w-[134px] items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-xs font-semibold text-emerald-700">
                            Done
                          </span>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" className="h-8 w-[134px] rounded-md text-xs" onClick={() => openConvertDialog(inquiry)}>
                              Create contract
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedInquiry)} onOpenChange={(open) => !open && setSelectedInquiry(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-xl border-hairline bg-surface-1 sm:max-w-[860px]">
          <DialogHeader>
            <DialogTitle>Create workspace contract</DialogTitle>
          </DialogHeader>

          {selectedInquiry ? (
            <div className="grid gap-4 py-2">
              {(() => {
                const requestDetails = parseRequestNotes(selectedInquiry);
                const requestedCredits = getRequestedCredits(selectedInquiry);
                const baselineCredits = getBaselineCredits(enterprisePlan);
                const suggestedTerms = calculateSuggestedTerms(selectedInquiry, enterprisePlan, pricingConfig);
                const defaultInvoiceTerms = getDefaultInvoiceTerms(enterprisePlan, pricingConfig);
                return (
              <>
              <div className="overflow-hidden rounded-lg border border-hairline">
                <div className="grid grid-cols-[150px_1fr_1fr] bg-surface-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Item</span>
                  <span>Baseline template</span>
                  <span className="text-primary">Company requested</span>
                </div>
                <div className="divide-y divide-hairline">
                  {[
                    {
                      item: "Credits",
                      baseline: `${formatNumber(baselineCredits)} / month`,
                      request: `${formatNumber(requestedCredits)} / month`,
                    },
                    {
                      item: "Payment terms",
                      baseline: `NET ${defaultInvoiceTerms}`,
                      request: requestDetails.paymentTerms ?? "N/A",
                    },
                    {
                      item: "Workspace members",
                      baseline: enterprisePlan?.maxParticipants ? `Up to ${formatNumber(enterprisePlan.maxParticipants)}` : "Set in contract",
                      request: requestDetails.workspaceMembers ?? "N/A",
                    },
                    {
                      item: "Languages",
                      baseline: enterprisePlan?.maxLanguages ? `Up to ${formatNumber(enterprisePlan.maxLanguages)}` : "Set in contract",
                      request: compactList(requestDetails.languages),
                      requestTitle: requestDetails.languages,
                    },
                    {
                      item: "AI services",
                      baseline: "System supported",
                      request: compactList(requestDetails.aiServices),
                      requestTitle: requestDetails.aiServices,
                    },
                    {
                      item: "Difference",
                      baseline: "-",
                      request: formatCreditDelta(requestedCredits, baselineCredits),
                      tone: requestedCredits != null && baselineCredits != null && requestedCredits > baselineCredits ? "warning" as const : "default" as const,
                    },
                  ].map((row) => (
                    <div key={row.item} className="grid grid-cols-[150px_1fr_1fr] gap-4 px-4 py-2">
                      <span className="text-sm text-muted-foreground">{row.item}</span>
                      <CompareCell value={row.baseline} tone={row.item === "Price" ? "default" : undefined} />
                      <span title={row.requestTitle ?? (typeof row.request === "string" ? row.request : undefined)}>
                        <CompareCell value={row.request} tone={row.tone} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs md:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Suggested credits</p>
                  <p className="mt-1 font-semibold text-foreground">{formatNumber(suggestedTerms.creditsPerCycleOverride)} / cycle</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Suggested price</p>
                  <p className="mt-1 font-semibold text-foreground">{formatNumber(suggestedTerms.contractPriceVnd)} VND</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Suggested terms</p>
                  <p className="mt-1 font-semibold text-foreground">NET {suggestedTerms.invoiceTermsDaysOverride ?? defaultInvoiceTerms}</p>
                </div>
              </div>
              </>
                );
              })()}

              <div className="border-t border-hairline pt-4">
                <p className="mb-3 text-sm font-semibold text-foreground">Approved contract terms</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Billing contact</Label>
                  <Input
                    value={terms.billingContactEmail ?? ""}
                    onChange={(event) => updateTerm("billingContactEmail", event.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Credits / cycle</Label>
                  <Input
                    type="number"
                    value={terms.creditsPerCycleOverride ?? ""}
                    onChange={(event) => updateTerm("creditsPerCycleOverride", event.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Contract price (VND)</Label>
                  <Input
                    type="number"
                    value={terms.contractPriceVnd ?? ""}
                    onChange={(event) => updateTerm("contractPriceVnd", event.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Overage cap credits</Label>
                  <Input
                    type="number"
                    value={terms.overageCapCreditsOverride ?? ""}
                    onChange={(event) => updateTerm("overageCapCreditsOverride", event.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Overage price / credit</Label>
                  <Input
                    type="number"
                    value={terms.overagePricePerCreditOverride ?? ""}
                    onChange={(event) => updateTerm("overagePricePerCreditOverride", event.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Invoice terms days</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={terms.invoiceTermsDaysOverride ?? ""}
                    placeholder={String(getDefaultInvoiceTerms(enterprisePlan, pricingConfig))}
                    onChange={(event) => updateTerm("invoiceTermsDaysOverride", event.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedInquiry(null)}>Cancel</Button>
            <Button
              onClick={() => convertMutation.mutate()}
              disabled={
                convertMutation.isPending ||
                !enterprisePlan
              }
            >
              {convertMutation.isPending
                ? "Saving..."
                : "Create workspace contract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
