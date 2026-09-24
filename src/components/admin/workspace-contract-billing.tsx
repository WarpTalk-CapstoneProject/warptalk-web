"use client";

/**
 * Contract and bank-transfer reconciliation for ONE workspace, on its admin Billing tab.
 *
 * Why here rather than a new "Contracts" page: every write is keyed by a workspace (terms, create)
 * or by an invoice the workspace owes (mark paid), the list of contract workspaces already exists
 * as the Subscriptions directory, and the credit adjustment an admin reaches for in the same
 * conversation is already pinned to this tab. A separate page would need a workspace picker —
 * the one thing this tab was built to avoid.
 *
 * Every money write goes through a review step that spells the amount WITH its currency. The
 * contract price is VND by name; an invoice is in whatever currency its row states.
 *
 * `POST /payments` is not offered — see admin-contract-billing.service.ts for why it would record
 * the wrong amount against nothing.
 */

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  ArrowCounterClockwise,
  CheckCircle,
  FileText,
  PencilSimple,
  Plus,
  Signature,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  INVOICE_PAGE_SIZE,
  useAdminWorkspaceInvoices,
  useAdminWorkspaceSubscription,
  useCreateAdminContract,
  useMarkAdminInvoicePaid,
  useResumeAdminWorkspaceService,
  useUpdateAdminContractTerms,
} from "@/hooks/use-admin-contract-billing";
import { useAdminPlans } from "@/hooks/use-admin-pricing";
import { formatAdminMoney } from "@/lib/billing/admin-money";
import {
  CONTRACT_TERMS_KEYS,
  canMarkInvoicePaid,
  describeContractTermsChanges,
  draftFromSubscription,
  formatContractTerm,
  invoiceConfirmationMatches,
  isInvoiceOverdue,
  parseContractTermsDraft,
  spellMoney,
  termsFromSubscription,
  type ContractTermsDraft,
  type ContractTermsValues,
} from "@/lib/billing/contract-billing";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminContractSubscriptionDto } from "@/types/admin-contract-billing";
import type { InvoiceDto } from "@/types/billing";

const numberFormatter = new Intl.NumberFormat("en-US");

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
    >
      <WarningCircle size={14} weight="duotone" className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline/60 py-2.5 last:border-b-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-right text-[13px] tabular-nums text-ink">
        {value}
        {hint ? <span className="block text-[11px] text-ink-subtle">{hint}</span> : null}
      </span>
    </div>
  );
}

export function WorkspaceContractBilling({
  workspaceId,
  workspaceName,
  ownerId,
}: {
  workspaceId: string;
  workspaceName: string;
  ownerId: string;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ContractSection workspaceId={workspaceId} workspaceName={workspaceName} ownerId={ownerId} />
      <InvoicesSection workspaceId={workspaceId} workspaceName={workspaceName} />
    </div>
  );
}

/* ── contract ─────────────────────────────────────────────────────────────── */

function ContractSection({
  workspaceId,
  workspaceName,
  ownerId,
}: {
  workspaceId: string;
  workspaceName: string;
  ownerId: string;
}) {
  const t = useTranslations("adminWorkspaces.contractBilling");
  const subscriptionQuery = useAdminWorkspaceSubscription(workspaceId);
  const subscription = subscriptionQuery.data;
  const [mode, setMode] = useState<"edit" | "create" | null>(null);
  const [resumeOpen, setResumeOpen] = useState(false);

  const isSuspended = subscription?.serviceState === "suspended";

  return (
    <section className="rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Signature size={15} weight="duotone" className="text-ink-subtle" />
            {t("contractHeading")}
          </h2>
          <p className="mt-1 text-xs text-ink-muted">{t("contractSubtitle")}</p>
        </div>
        {subscription ? (
          <Button variant="outline" size="sm" onClick={() => setMode("edit")}>
            <PencilSimple size={13} />
            {t("editTerms")}
          </Button>
        ) : subscription === null ? (
          <Button size="sm" onClick={() => setMode("create")}>
            <Plus size={13} />
            {t("createContract")}
          </Button>
        ) : null}
      </div>

      <div className="mt-3">
        {subscriptionQuery.isError ? (
          <div className="flex items-start gap-3 py-4 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t("subscriptionLoadError")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void subscriptionQuery.refetch()}
              >
                {t("tryAgain")}
              </Button>
            </div>
          </div>
        ) : subscriptionQuery.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-8 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        ) : subscription === null || subscription === undefined ? (
          <p className="py-4 text-[13px] text-ink-muted">{t("noSubscription")}</p>
        ) : (
          <>
            {isSuspended ? (
              <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
                <span>
                  {subscription.suspendedReason
                    ? t("serviceSuspendedWithReason", { reason: subscription.suspendedReason })
                    : t("serviceSuspended")}
                  {t("serviceSuspendedSuffix")}
                </span>
                <Button variant="outline" size="sm" onClick={() => setResumeOpen(true)}>
                  <ArrowCounterClockwise size={13} />
                  {t("resumeService")}
                </Button>
              </div>
            ) : null}
            <Row label={t("planLabel")} value={subscription.planName} hint={subscription.status} />
            <Row
              label={t("periodLabel")}
              value={`${formatDate(subscription.currentPeriodStart)} – ${formatDate(subscription.currentPeriodEnd)}`}
            />
            {CONTRACT_TERMS_KEYS.map((key) => (
              <TermRow key={key} termKey={key} subscription={subscription} />
            ))}
            <p className="mt-3 text-[11px] leading-5 text-ink-subtle">{t("footNote")}</p>
          </>
        )}
      </div>

      <ContractTermsDialog
        mode={mode}
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        ownerId={ownerId}
        subscription={subscription ?? null}
        onClose={() => setMode(null)}
      />

      <ResumeServiceDialog
        open={resumeOpen}
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        onOpenChange={setResumeOpen}
      />
    </section>
  );
}

const EFFECTIVE_KEY: Partial<Record<keyof ContractTermsValues, keyof AdminContractSubscriptionDto>> = {
  contractPriceVnd: "effectiveContractPriceVnd",
  creditsPerCycleOverride: "effectiveCreditsPerCycle",
  overageCapCreditsOverride: "effectiveOverageCapCredits",
  overagePricePerCreditOverride: "effectiveOveragePricePerCredit",
  invoiceTermsDaysOverride: "effectiveInvoiceTermsDays",
};

function TermRow({
  termKey,
  subscription,
}: {
  termKey: keyof ContractTermsValues;
  subscription: AdminContractSubscriptionDto;
}) {
  const t = useTranslations("adminWorkspaces.contractBilling");
  const stored = termsFromSubscription(subscription)[termKey];
  const effectiveKey = EFFECTIVE_KEY[termKey];
  const effective = effectiveKey ? subscription[effectiveKey] : undefined;
  const label = t(`termLabels.${termKey}`);

  if (stored != null) {
    return <Row label={label} value={formatContractTerm(termKey, stored)} />;
  }
  return (
    <Row
      label={label}
      value={
        typeof effective === "number" ? (
          formatContractTerm(termKey, effective)
        ) : (
          <span className="text-ink-subtle">—</span>
        )
      }
      hint={t("planDefault")}
    />
  );
}

function ContractTermsDialog({
  mode,
  workspaceId,
  workspaceName,
  ownerId,
  subscription,
  onClose,
}: {
  mode: "edit" | "create" | null;
  workspaceId: string;
  workspaceName: string;
  ownerId: string;
  subscription: AdminContractSubscriptionDto | null;
  onClose: () => void;
}) {
  const t = useTranslations("adminWorkspaces.contractBilling");
  const updateTerms = useUpdateAdminContractTerms(workspaceId);
  const createContract = useCreateAdminContract();
  const isSaving = updateTerms.isPending || createContract.isPending;

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => (!open && !isSaving ? onClose() : undefined)}>
      <DialogContent className="gap-0 sm:max-w-lg">
        {mode ? (
          <ContractTermsForm
            key={`${mode}:${subscription?.id ?? "none"}`}
            mode={mode}
            workspaceName={workspaceName}
            subscription={mode === "edit" ? subscription : null}
            isSaving={isSaving}
            onCancel={onClose}
            onSubmit={async (terms, planId) => {
              if (mode === "edit") {
                await updateTerms.mutateAsync(terms);
                toast.success(t("toastTermsSaved"));
              } else {
                await createContract.mutateAsync({
                  workspaceId,
                  planId: planId!,
                  contractTerms: terms,
                  userId: ownerId,
                });
                toast.success(t("toastContractCreated"));
              }
              onClose();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_TERMS: ContractTermsValues = {
  creditsPerCycleOverride: null,
  contractPriceVnd: null,
  overageCapCreditsOverride: null,
  overagePricePerCreditOverride: null,
  invoiceTermsDaysOverride: null,
  billingContactEmail: null,
};

function ContractTermsForm({
  mode,
  workspaceName,
  subscription,
  isSaving,
  onCancel,
  onSubmit,
}: {
  mode: "edit" | "create";
  workspaceName: string;
  subscription: AdminContractSubscriptionDto | null;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (terms: ContractTermsValues, planId: string | null) => Promise<void>;
}) {
  const t = useTranslations("adminWorkspaces.contractBilling");
  const plansQuery = useAdminPlans();
  const plans = (plansQuery.data ?? []).filter((plan) => plan.isActive);
  // Seeded from the STORED overrides: the PUT replaces all six, so a draft seeded any other way
  // would reset the fields nobody touched.
  const [draft, setDraft] = useState<ContractTermsDraft>(() => draftFromSubscription(subscription));
  const [planId, setPlanId] = useState("");
  const [review, setReview] = useState<ContractTermsValues | null>(null);
  const [error, setError] = useState<string | null>(null);

  const before = subscription ? termsFromSubscription(subscription) : EMPTY_TERMS;
  const plan = plans.find((candidate) => candidate.id === planId) ?? null;

  const handleReview = () => {
    if (mode === "create" && !planId) {
      setError(t("errorChoosePlan"));
      return;
    }
    const parsed = parseContractTermsDraft(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    // A blank price is stored as the PLAN's price in a column the server reads as VND. On a plan
    // priced in anything else that would relabel the number, so the price must be typed.
    if (mode === "create" && plan && plan.currency.toUpperCase() !== "VND" && parsed.terms.contractPriceVnd == null) {
      setError(t("errorPlanCurrency", { planName: plan.name, currency: plan.currency.toUpperCase() }));
      return;
    }
    if (mode === "edit" && describeContractTermsChanges(before, parsed.terms).length === 0) {
      setError(t("errorNoChanges"));
      return;
    }
    setError(null);
    setReview(parsed.terms);
  };

  const handleConfirm = async () => {
    if (!review) return;
    try {
      setError(null);
      await onSubmit(review, mode === "create" ? planId : null);
    } catch (err) {
      setError(
        getErrorMessage(err, mode === "edit" ? t("errorSaveTerms") : t("errorCreateContract")),
      );
    }
  };

  if (review) {
    const changes = describeContractTermsChanges(before, review).map((change) => ({
      ...change,
      label: t(`termLabels.${change.key}`),
    }));
    return (
      <>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? t("confirmEditTitle") : t("confirmCreateTitle")}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? t("confirmEditDescription", { workspaceName })
              : t("confirmCreateDescription", { workspaceName })}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-3">
          {mode === "create" && plan ? (
            <div className="rounded-lg border border-hairline/60 bg-surface-2 px-3 py-2 text-[12px]">
              <p className="font-medium text-ink">{plan.name}</p>
              <p className="mt-0.5 text-ink-muted">
                {t("pricePerCycle")}{" "}
                <span className="font-semibold text-ink">
                  {review.contractPriceVnd != null
                    ? spellMoney({ amount: review.contractPriceVnd, currency: "VND" })
                    : `${spellMoney({ amount: plan.price, currency: plan.currency })} ${t("planPriceNote")}`}
                </span>
              </p>
            </div>
          ) : null}

          <ul className="rounded-lg border border-hairline/60">
            {(mode === "edit"
              ? changes
              : CONTRACT_TERMS_KEYS.map((key) => ({
                  key,
                  label: t(`termLabels.${key}`),
                  from: "",
                  to: formatContractTerm(key, review[key]),
                }))
            ).map((change) => (
              <li
                key={change.key}
                className="flex items-baseline justify-between gap-3 border-b border-hairline/60 px-3 py-2 text-[12px] last:border-b-0"
              >
                <span className="text-ink-muted">{change.label}</span>
                <span className="text-right tabular-nums">
                  {change.from ? <span className="text-ink-subtle line-through">{change.from}</span> : null}
                  {change.from ? " → " : null}
                  <span
                    className={cn(
                      "text-ink",
                      (change.key === "contractPriceVnd" || change.key === "overagePricePerCreditOverride") &&
                        "font-semibold",
                    )}
                  >
                    {change.to}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <ErrorLine message={error} />
        </div>

        <DialogFooter className="mt-5">
          <Button variant="outline" onClick={() => setReview(null)} disabled={isSaving}>
            {t("back")}
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={isSaving}>
            {isSaving ? t("saving") : mode === "edit" ? t("saveTerms") : t("createContract")}
          </Button>
        </DialogFooter>
      </>
    );
  }

  const set = (key: keyof ContractTermsDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{mode === "edit" ? t("editTermsTitle") : t("createContract")}</DialogTitle>
        <DialogDescription>{t("formDescription")}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-3">
        {mode === "create" ? (
          <div>
            <Label htmlFor="contract-plan" className="text-[12px] text-ink-muted">
              {t("planLabel")}
            </Label>
            <select
              id="contract-plan"
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
              disabled={plansQuery.isPending || isSaving}
              className="mt-1.5 h-9 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            >
              <option value="">{plansQuery.isPending ? t("loadingPlans") : t("choosePlan")}</option>
              {plans.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {t("planOption", {
                    name: candidate.name,
                    price: formatAdminMoney({ amount: candidate.price, currency: candidate.currency }),
                    cycle: candidate.billingCycle,
                    credits: numberFormatter.format(candidate.creditsPerCycle),
                  })}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {CONTRACT_TERMS_KEYS.map((key) => (
            <div key={key} className={cn("min-w-0", key === "billingContactEmail" && "sm:col-span-2")}>
              <Label htmlFor={`contract-${key}`} className="text-[12px] text-ink-muted">
                {t(`termLabels.${key}`)}
              </Label>
              <Input
                id={`contract-${key}`}
                className="mt-1.5"
                inputMode={key === "billingContactEmail" ? "email" : "numeric"}
                placeholder={t("planDefault")}
                value={draft[key]}
                onChange={(event) => set(key, event.target.value)}
                disabled={isSaving}
              />
            </div>
          ))}
        </div>

        <ErrorLine message={error} />
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          {t("cancel")}
        </Button>
        <Button onClick={handleReview} disabled={isSaving}>
          {t("review")}
        </Button>
      </DialogFooter>
    </>
  );
}

function ResumeServiceDialog({
  open,
  workspaceId,
  workspaceName,
  onOpenChange,
}: {
  open: boolean;
  workspaceId: string;
  workspaceName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("adminWorkspaces.contractBilling");
  const resume = useResumeAdminWorkspaceService(workspaceId);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      setError(t("resumeReasonTooShort"));
      return;
    }
    try {
      setError(null);
      await resume.mutateAsync(trimmed);
      toast.success(t("toastServiceResumed"));
      setReason("");
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, t("errorResumeService")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (resume.isPending ? undefined : onOpenChange(next))}>
      <DialogContent className="gap-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("resumeDialogTitle")}</DialogTitle>
          <DialogDescription>{t("resumeDialogDescription", { workspaceName })}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-3">
          <div>
            <Label htmlFor="resume-reason" className="text-[12px] text-ink-muted">
              {t("reasonLabel")}
            </Label>
            <Textarea
              id="resume-reason"
              className="mt-1.5"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("resumeReasonPlaceholder")}
            />
          </div>
          <ErrorLine message={error} />
        </div>
        <DialogFooter className="mt-5">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={resume.isPending}>
            {t("back")}
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={resume.isPending}>
            {resume.isPending ? t("resuming") : t("resumeService")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── invoices ─────────────────────────────────────────────────────────────── */

function InvoicesSection({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const t = useTranslations("adminWorkspaces.contractBilling");
  const [page, setPage] = useState(1);
  const invoicesQuery = useAdminWorkspaceInvoices(workspaceId, page);
  const invoices = invoicesQuery.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((invoicesQuery.data?.totalCount ?? 0) / INVOICE_PAGE_SIZE));
  const [settling, setSettling] = useState<InvoiceDto | null>(null);

  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-linear">
      <div className="border-b border-hairline px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FileText size={15} weight="duotone" className="text-ink-subtle" />
          {t("invoicesHeading")}
        </h2>
        <p className="mt-1 text-xs text-ink-muted">{t("invoicesSubtitle")}</p>
      </div>

      {invoicesQuery.isError ? (
        <div className="flex items-start gap-3 px-4 py-6 text-sm">
          <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">{t("invoicesLoadError")}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void invoicesQuery.refetch()}>
              {t("tryAgain")}
            </Button>
          </div>
        </div>
      ) : invoicesQuery.isPending ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-ink-muted">{t("invoicesEmpty")}</p>
      ) : (
        <ol>
          {invoices.map((invoice) => {
            const overdue = isInvoiceOverdue(invoice);
            return (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center gap-3 border-b border-hairline/60 px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[12px] text-ink">{invoice.invoiceNumber}</p>
                  <p className="mt-0.5 text-[11px] text-ink-subtle">
                    {t("issued", { date: formatDate(invoice.issuedAt) })}
                    {invoice.dueAt ? ` · ${t("due", { date: formatDate(invoice.dueAt) })}` : ""}
                    {invoice.paidAt ? ` · ${t("paid", { date: formatDate(invoice.paidAt) })}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    invoice.status === "paid"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : overdue
                        ? "border-destructive/20 bg-destructive/10 text-destructive"
                        : invoice.status === "open"
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          : "border-border bg-surface-2 text-ink-muted",
                  )}
                >
                  {overdue ? t("overdue") : invoice.status}
                </span>
                <span className="w-[130px] shrink-0 text-right text-[13px] font-medium tabular-nums text-ink">
                  {formatAdminMoney({ amount: invoice.total, currency: invoice.currency })}
                </span>
                <div className="w-[96px] shrink-0 text-right">
                  {canMarkInvoicePaid(invoice) ? (
                    <Button variant="outline" size="sm" onClick={() => setSettling(invoice)}>
                      {t("markPaid")}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-hairline px-4 py-2 text-[12px] text-ink-muted">
          <span>{t("pageOf", { page, totalPages })}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </div>
      ) : null}

      <MarkInvoicePaidDialog
        invoice={settling}
        workspaceName={workspaceName}
        onOpenChange={(open) => {
          if (!open) setSettling(null);
        }}
      />
    </section>
  );
}

function MarkInvoicePaidDialog({
  invoice,
  workspaceName,
  onOpenChange,
}: {
  invoice: InvoiceDto | null;
  workspaceName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("adminWorkspaces.contractBilling");
  const markPaid = useMarkAdminInvoicePaid();

  return (
    <Dialog open={invoice !== null} onOpenChange={(next) => (markPaid.isPending ? undefined : onOpenChange(next))}>
      <DialogContent className="gap-0 sm:max-w-md">
        {invoice ? (
          <MarkPaidForm
            key={invoice.id}
            invoice={invoice}
            workspaceName={workspaceName}
            isSaving={markPaid.isPending}
            onCancel={() => onOpenChange(false)}
            onConfirm={async () => {
              await markPaid.mutateAsync(invoice.id);
              toast.success(t("toastInvoicePaid", { invoiceNumber: invoice.invoiceNumber }));
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidForm({
  invoice,
  workspaceName,
  isSaving,
  onCancel,
  onConfirm,
}: {
  invoice: InvoiceDto;
  workspaceName: string;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations("adminWorkspaces.contractBilling");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const matches = invoiceConfirmationMatches(invoice, typed);
  const amount = spellMoney({ amount: invoice.total, currency: invoice.currency });

  const handleConfirm = async () => {
    if (!matches) return;
    try {
      setError(null);
      await onConfirm();
    } catch (err) {
      setError(getErrorMessage(err, t("errorMarkPaid")));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("recordPaymentTitle")}</DialogTitle>
        <DialogDescription>{t("recordPaymentDescription")}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-3">
        <div className="rounded-lg border border-hairline/60 bg-surface-2 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-ink-subtle">{t("amountReceived")}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{amount}</p>
          <p className="mt-1 text-[12px] text-ink-muted">
            {t("amountSummary", {
              subtotal: formatAdminMoney({ amount: invoice.subtotal, currency: invoice.currency }),
              tax: formatAdminMoney({ amount: invoice.tax, currency: invoice.currency }),
              workspaceName,
            })}
          </p>
        </div>

        <div>
          <Label htmlFor="mark-paid-confirm" className="text-[12px] text-ink-muted">
            {t.rich("confirmInvoiceLabel", {
              invoiceNumber: invoice.invoiceNumber,
              num: (chunks) => <span className="font-mono text-ink">{chunks}</span>,
            })}
          </Label>
          <Input
            id="mark-paid-confirm"
            className="mt-1.5 font-mono"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={isSaving}
          />
        </div>

        <ErrorLine message={error} />
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          {t("back")}
        </Button>
        <Button onClick={() => void handleConfirm()} disabled={!matches || isSaving}>
          <CheckCircle size={14} />
          {isSaving ? t("recording") : t("markPaidWithAmount", { amount })}
        </Button>
      </DialogFooter>
    </>
  );
}
