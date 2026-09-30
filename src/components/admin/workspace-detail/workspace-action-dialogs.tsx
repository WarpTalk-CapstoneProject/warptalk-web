"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminWorkspaceActions } from "@/hooks/use-admin-workspace-actions";
import { useAdminPlans } from "@/hooks/use-admin-pricing";
import {
  MAX_COMP_PERIODS,
  MAX_CREDIT_ADJUSTMENT,
  MAX_NOTE_LENGTH,
  MAX_NOTICE_MESSAGE,
  MAX_NOTICE_TITLE,
  MAX_TRIAL_EXTENSION_DAYS,
  buildEntitlementPatch,
  buildWorkspaceExport,
  compedPeriodEnd,
  draftFromEntitlements,
  exportFileName,
  extendedTrialEnd,
  isNumericEntitlement,
  parseCompPeriods,
  parseCreditAmount,
  parseTrialDays,
  signOutAllTargets,
  transferCandidates,
  type EntitlementDraft,
} from "@/lib/admin/workspace-actions";
import { formatAdminMoney } from "@/lib/billing/admin-money";
import type { MeetingsInsightsDto } from "@/types/admin-insights";
import type { AdminWorkspaceDetailDto, AdminWorkspaceMemberDto } from "@/types/admin-workspace";
import type { AdminWorkspaceBillingOverviewDto } from "@/types/admin-workspace-actions";

import { AdminActionDialog } from "./admin-action-dialog";

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const formatDate = (value: string | Date) => dateFormatter.format(typeof value === "string" ? new Date(value) : value);

const selectClass =
  "h-10 w-full rounded-md border border-hairline bg-surface-2 px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary-focus";

/** The dialogs the Actions menu and the row actions open. One is open at a time. */
export type OpenWorkspaceAction =
  | { id: "adjustCredits" }
  | { id: "changePlan" }
  | { id: "extendTrial" }
  | { id: "compPeriod" }
  | { id: "entitlements" }
  | { id: "transferOwnership"; memberId?: string }
  | { id: "signOutMember"; memberId: string }
  | { id: "signOutAll" }
  | { id: "sendNotice" }
  | { id: "addNote" }
  | { id: "exportSummary" };

export function WorkspaceActionDialogs({
  action,
  onClose,
  workspace,
  overview,
  members,
  meetings,
}: {
  action: OpenWorkspaceAction | null;
  onClose: () => void;
  workspace: AdminWorkspaceDetailDto;
  overview: AdminWorkspaceBillingOverviewDto | undefined;
  members: AdminWorkspaceMemberDto[];
  meetings: MeetingsInsightsDto | undefined;
}) {
  const actions = useAdminWorkspaceActions(workspace.id);
  const shared = { workspace, onClose, actions };

  switch (action?.id) {
    case "adjustCredits":
      return <AdjustCreditsDialog {...shared} overview={overview} />;
    case "changePlan":
      return <ChangePlanDialog {...shared} overview={overview} />;
    case "extendTrial":
      return <ExtendTrialDialog {...shared} overview={overview} />;
    case "compPeriod":
      return <CompPeriodDialog {...shared} overview={overview} />;
    case "entitlements":
      return <EntitlementsDialog {...shared} overview={overview} />;
    case "transferOwnership":
      return <TransferOwnershipDialog {...shared} members={members} initialMemberId={action.memberId} />;
    case "signOutMember":
      return <SignOutDialog {...shared} members={members} memberId={action.memberId} />;
    case "signOutAll":
      return <SignOutDialog {...shared} members={members} />;
    case "sendNotice":
      return <SendNoticeDialog {...shared} />;
    case "addNote":
      return <AddNoteDialog {...shared} />;
    case "exportSummary":
      return <ExportDialog {...shared} overview={overview} meetings={meetings} />;
    default:
      return null;
  }
}

type Actions = ReturnType<typeof useAdminWorkspaceActions>;

interface DialogProps {
  workspace: AdminWorkspaceDetailDto;
  onClose: () => void;
  actions: Actions;
}

// ── Billing ────────────────────────────────────────────────────────────────────────────────

function AdjustCreditsDialog({ workspace, onClose, actions, overview }: DialogProps & { overview?: AdminWorkspaceBillingOverviewDto }) {
  const t = useTranslations("adminWorkspaces.actions");
  const [amount, setAmount] = useState("");
  const balance = overview?.subscription?.creditsRemaining ?? null;
  const parsed = parseCreditAmount(amount);

  return (
    <AdminActionDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t("adjustCredits.title")}
      description={t("adjustCredits.description")}
      workspaceName={workspace.name}
      confirmLabel={t("adjustCredits.confirm")}
      validate={() => (parsed.ok ? (balance !== null && balance + parsed.value < 0 ? "belowZero" : null) : parsed.error)}
      summary={() => [
        { label: t("adjustCredits.amount"), value: parsed.ok ? `${parsed.value > 0 ? "+" : ""}${numberFormatter.format(parsed.value)}` : "—" },
        {
          label: t("adjustCredits.balanceAfter"),
          value: parsed.ok && balance !== null ? numberFormatter.format(balance + parsed.value) : "—",
        },
      ]}
      onConfirm={async (reason) => {
        if (!parsed.ok) return;
        const result = await actions.adjustCredits.mutateAsync({ amount: parsed.value, reason });
        toast.success(
          t("adjustCredits.toast", {
            amount: `${parsed.value > 0 ? "+" : ""}${numberFormatter.format(parsed.value)}`,
            balance: numberFormatter.format(result.ledgerEntry?.balanceAfter ?? 0),
          }),
        );
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="adjust-amount">{t("adjustCredits.amount")}</Label>
        <Input
          id="adjust-amount"
          type="number"
          step="1"
          min={-MAX_CREDIT_ADJUSTMENT}
          max={MAX_CREDIT_ADJUSTMENT}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder={t("adjustCredits.placeholder")}
          autoFocus
        />
        <p className="text-[11px] text-ink-subtle">
          {balance === null
            ? t("adjustCredits.noSubscription")
            : t("adjustCredits.hint", { balance: numberFormatter.format(balance) })}
        </p>
      </div>
    </AdminActionDialog>
  );
}

function ChangePlanDialog({ workspace, onClose, actions, overview }: DialogProps & { overview?: AdminWorkspaceBillingOverviewDto }) {
  const t = useTranslations("adminWorkspaces.actions");
  const plansQuery = useAdminPlans();
  const [planId, setPlanId] = useState("");
  const current = overview?.subscription ?? null;
  const plans = (plansQuery.data ?? []).filter((plan) => plan.isActive && plan.id !== current?.planId);
  const target = plans.find((plan) => plan.id === planId);

  return (
    <AdminActionDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t("changePlan.title")}
      description={t("changePlan.description")}
      workspaceName={workspace.name}
      confirmLabel={t("changePlan.confirm")}
      validate={() => (target ? null : "choosePlan")}
      summary={() => [
        { label: t("changePlan.from"), value: current?.planName ?? "—" },
        { label: t("changePlan.to"), value: target?.name ?? "—" },
      ]}
      onConfirm={async (reason) => {
        await actions.changePlan.mutateAsync({ planId, reason });
        toast.success(t("changePlan.toast", { plan: target?.name ?? "" }));
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="change-plan-select">{t("changePlan.to")}</Label>
        <select id="change-plan-select" className={selectClass} value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">{plansQuery.isPending ? t("loading") : t("changePlan.choose")}</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} — {formatAdminMoney({ amount: plan.price, currency: plan.currency })}/{plan.billingCycle}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-ink-subtle">{t("changePlan.hint")}</p>
      </div>
    </AdminActionDialog>
  );
}

function ExtendTrialDialog({ workspace, onClose, actions, overview }: DialogProps & { overview?: AdminWorkspaceBillingOverviewDto }) {
  const t = useTranslations("adminWorkspaces.actions");
  const [days, setDays] = useState("7");
  const parsed = parseTrialDays(days);
  const trialEndsAt = overview?.subscription?.trialEndsAt ?? null;

  return (
    <AdminActionDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t("extendTrial.title")}
      description={t("extendTrial.description")}
      workspaceName={workspace.name}
      confirmLabel={t("extendTrial.confirm")}
      validate={() => (parsed.ok ? null : parsed.error)}
      summary={() => [
        { label: t("extendTrial.currentEnd"), value: trialEndsAt ? formatDate(trialEndsAt) : "—" },
        { label: t("extendTrial.newEnd"), value: parsed.ok ? formatDate(extendedTrialEnd(trialEndsAt, parsed.value)) : "—" },
      ]}
      onConfirm={async (reason) => {
        if (!parsed.ok) return;
        await actions.extendTrial.mutateAsync({ days: parsed.value, reason });
        toast.success(t("extendTrial.toast", { days: parsed.value }));
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="extend-trial-days">{t("extendTrial.days")}</Label>
        <Input id="extend-trial-days" type="number" min={1} max={MAX_TRIAL_EXTENSION_DAYS} value={days} onChange={(e) => setDays(e.target.value)} />
        <p className="text-[11px] text-ink-subtle">{t("extendTrial.hint", { max: MAX_TRIAL_EXTENSION_DAYS })}</p>
      </div>
    </AdminActionDialog>
  );
}

function CompPeriodDialog({ workspace, onClose, actions, overview }: DialogProps & { overview?: AdminWorkspaceBillingOverviewDto }) {
  const t = useTranslations("adminWorkspaces.actions");
  const [periods, setPeriods] = useState("1");
  const parsed = parseCompPeriods(periods);
  const subscription = overview?.subscription ?? null;

  return (
    <AdminActionDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t("compPeriod.title")}
      description={t("compPeriod.description")}
      workspaceName={workspace.name}
      confirmLabel={t("compPeriod.confirm")}
      validate={() => (parsed.ok ? null : parsed.error)}
      summary={() => [
        { label: t("compPeriod.paidThrough"), value: subscription ? formatDate(subscription.currentPeriodEnd) : "—" },
        {
          label: t("compPeriod.newPaidThrough"),
          value: parsed.ok && subscription ? formatDate(compedPeriodEnd(subscription.currentPeriodEnd, parsed.value)) : "—",
        },
        {
          label: t("compPeriod.creditsGranted"),
          value: parsed.ok && subscription ? `+${numberFormatter.format(subscription.creditsPerCycle * parsed.value)}` : "—",
        },
      ]}
      onConfirm={async (reason) => {
        if (!parsed.ok) return;
        await actions.compPeriod.mutateAsync({ periods: parsed.value, reason });
        toast.success(t("compPeriod.toast", { periods: parsed.value }));
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="comp-periods">{t("compPeriod.periods")}</Label>
        <Input id="comp-periods" type="number" min={1} max={MAX_COMP_PERIODS} value={periods} onChange={(e) => setPeriods(e.target.value)} />
        <p className="text-[11px] text-ink-subtle">{t("compPeriod.hint")}</p>
      </div>
    </AdminActionDialog>
  );
}

function EntitlementsDialog({ workspace, onClose, actions, overview }: DialogProps & { overview?: AdminWorkspaceBillingOverviewDto }) {
  const t = useTranslations("adminWorkspaces.actions");
  const entitlements = overview?.entitlements ?? [];
  const [draft, setDraft] = useState<EntitlementDraft>(() => draftFromEntitlements(entitlements));
  const patch = buildEntitlementPatch(entitlements, draft);

  return (
    <AdminActionDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t("entitlements.title")}
      description={t("entitlements.description")}
      workspaceName={workspace.name}
      confirmLabel={t("entitlements.confirm")}
      validate={() => (patch.ok ? null : patch.error)}
      summary={() =>
        patch.ok
          ? Object.entries(patch.value).map(([key, value]) => ({
              label: key,
              value: value === null ? t("entitlements.cleared") : String(value),
            }))
          : []
      }
      onConfirm={async (reason) => {
        if (!patch.ok) return;
        await actions.setEntitlements.mutateAsync({ overrides: patch.value, reason });
        toast.success(t("entitlements.toast"));
      }}
    >
      <div className="overflow-hidden rounded-lg border border-hairline">
        {entitlements.map((entitlement) => (
          <div key={entitlement.key} className="flex items-center gap-3 border-b border-hairline/60 px-3 py-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[12px] text-ink">{entitlement.key}</p>
              <p className="text-[11px] text-ink-subtle">
                {t("entitlements.effective", { value: entitlement.value, source: entitlement.source })}
              </p>
            </div>
            {isNumericEntitlement(entitlement.key) ? (
              <Input
                aria-label={entitlement.key}
                className="h-8 w-24"
                type="number"
                min={0}
                value={draft[entitlement.key] ?? ""}
                placeholder={t("entitlements.none")}
                onChange={(e) => setDraft((d) => ({ ...d, [entitlement.key]: e.target.value }))}
              />
            ) : (
              <select
                aria-label={entitlement.key}
                className="h-8 w-28 rounded-md border border-hairline bg-surface-2 px-2 text-[12px] text-ink"
                value={draft[entitlement.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [entitlement.key]: e.target.value }))}
              >
                <option value="">{t("entitlements.none")}</option>
                <option value="true">{t("entitlements.on")}</option>
                <option value="false">{t("entitlements.off")}</option>
              </select>
            )}
          </div>
        ))}
        {entitlements.length === 0 ? <p className="px-3 py-4 text-[12px] text-ink-muted">{t("entitlements.empty")}</p> : null}
      </div>
      <p className="text-[11px] text-ink-subtle">{t("entitlements.hint")}</p>
    </AdminActionDialog>
  );
}

// ── Account ────────────────────────────────────────────────────────────────────────────────

function memberLabel(member: AdminWorkspaceMemberDto) {
  return member.resolved ? `${member.fullName ?? member.email} (${member.email})` : member.userId;
}

function TransferOwnershipDialog({
  workspace,
  onClose,
  actions,
  members,
  initialMemberId,
}: DialogProps & { members: AdminWorkspaceMemberDto[]; initialMemberId?: string }) {
  const t = useTranslations("adminWorkspaces.actions");
  const candidates = transferCandidates(members);
  const [memberId, setMemberId] = useState(initialMemberId ?? "");
  const target = candidates.find((m) => m.userId === memberId);
  const currentOwner = workspace.owner.resolved ? workspace.owner.fullName ?? workspace.owner.email : workspace.owner.id;

  return (
    <AdminActionDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t("transferOwnership.title")}
      description={t("transferOwnership.description")}
      workspaceName={workspace.name}
      destructive
      confirmLabel={t("transferOwnership.confirm")}
      validate={() => (target ? null : "chooseMember")}
      summary={() => [
        { label: t("transferOwnership.from"), value: currentOwner ?? "—" },
        { label: t("transferOwnership.to"), value: target ? memberLabel(target) : "—" },
      ]}
      onConfirm={async (reason) => {
        await actions.transferOwnership.mutateAsync({ newOwnerUserId: memberId, reason });
        toast.success(t("transferOwnership.toast"));
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="transfer-owner-select">{t("transferOwnership.to")}</Label>
        <select id="transfer-owner-select" className={selectClass} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">{t("transferOwnership.choose")}</option>
          {candidates.map((member) => (
            <option key={member.userId} value={member.userId}>
              {memberLabel(member)} — {member.role}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-ink-subtle">{t("transferOwnership.hint")}</p>
      </div>
    </AdminActionDialog>
  );
}

function SignOutDialog({
  workspace,
  onClose,
  actions,
  members,
  memberId,
}: DialogProps & { members: AdminWorkspaceMemberDto[]; memberId?: string }) {
  const t = useTranslations("adminWorkspaces.actions");
  const single = memberId ? members.find((m) => m.userId === memberId) : undefined;
  const targets = memberId ? [memberId] : signOutAllTargets(members);

  return (
    <AdminActionDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={memberId ? t("signOut.titleOne") : t("signOut.titleAll")}
      description={memberId ? t("signOut.descriptionOne") : t("signOut.descriptionAll")}
      workspaceName={workspace.name}
      destructive={!memberId}
      confirmLabel={memberId ? t("signOut.confirmOne") : t("signOut.confirmAll", { count: targets.length })}
      validate={() => (targets.length === 0 ? "chooseMember" : null)}
      summary={() => [
        {
          label: t("signOut.who"),
          value: single ? memberLabel(single) : t("signOut.allMembers", { count: targets.length }),
        },
      ]}
      onConfirm={async (reason) => {
        const result = await actions.signOut.mutateAsync({ userIds: targets, reason });
        if (result.failed.length > 0) {
          toast.warning(t("signOut.partial", { done: result.signedOut.length, failed: result.failed.length }));
        } else {
          toast.success(t("signOut.toast", { count: result.signedOut.length }));
        }
      }}
    />
  );
}

function SendNoticeDialog({ workspace, onClose, actions }: DialogProps) {
  const t = useTranslations("adminWorkspaces.actions");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const owner = workspace.owner.resolved ? `${workspace.owner.fullName} (${workspace.owner.email})` : workspace.owner.id;

  return (
    <AdminActionDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t("sendNotice.title")}
      description={t("sendNotice.description")}
      workspaceName={workspace.name}
      confirmLabel={t("sendNotice.confirm")}
      validate={() => {
        if (title.trim().length === 0 || title.trim().length > MAX_NOTICE_TITLE) return "titleInvalid";
        if (message.trim().length === 0 || message.trim().length > MAX_NOTICE_MESSAGE) return "messageInvalid";
        return null;
      }}
      summary={() => [
        { label: t("sendNotice.to"), value: owner },
        { label: t("sendNotice.subject"), value: title.trim() },
      ]}
      onConfirm={async (reason) => {
        await actions.sendNotice.mutateAsync({ title: title.trim(), message: message.trim(), reason });
        toast.success(t("sendNotice.toast"));
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="notice-title">{t("sendNotice.subject")}</Label>
        <Input id="notice-title" maxLength={MAX_NOTICE_TITLE} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notice-message">{t("sendNotice.message")}</Label>
        <Textarea id="notice-message" rows={4} maxLength={MAX_NOTICE_MESSAGE} value={message} onChange={(e) => setMessage(e.target.value)} />
        <p className="text-[11px] text-ink-subtle">{t("sendNotice.hint", { owner })}</p>
      </div>
    </AdminActionDialog>
  );
}

function AddNoteDialog({ workspace, onClose, actions }: DialogProps) {
  const t = useTranslations("adminWorkspaces.actions");
  const [body, setBody] = useState("");

  return (
    <AdminActionDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t("addNote.title")}
      description={t("addNote.description")}
      workspaceName={workspace.name}
      confirmLabel={t("addNote.confirm")}
      hideReason
      validate={() => (body.trim().length === 0 || body.trim().length > MAX_NOTE_LENGTH ? "noteInvalid" : null)}
      summary={() => [{ label: t("addNote.note"), value: <span className="whitespace-pre-wrap font-normal">{body.trim()}</span> }]}
      onConfirm={async () => {
        await actions.addNote.mutateAsync(body.trim());
        toast.success(t("addNote.toast"));
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="note-body">{t("addNote.note")}</Label>
        <Textarea id="note-body" rows={5} maxLength={MAX_NOTE_LENGTH} value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
        <p className="text-[11px] text-ink-subtle">{t("addNote.hint")}</p>
      </div>
    </AdminActionDialog>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────────────────────

function ExportDialog({
  workspace,
  onClose,
  actions,
  overview,
  meetings,
}: DialogProps & { overview?: AdminWorkspaceBillingOverviewDto; meetings?: MeetingsInsightsDto }) {
  const t = useTranslations("adminWorkspaces.actions");
  const fileName = exportFileName(workspace.slug);

  return (
    <AdminActionDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t("exportSummary.title")}
      description={t("exportSummary.description")}
      workspaceName={workspace.name}
      confirmLabel={t("exportSummary.confirm")}
      summary={() => [{ label: t("exportSummary.file"), value: <span className="font-mono text-[12px]">{fileName}</span> }]}
      onConfirm={async (reason) => {
        // Recorded server-side before the record comes back; only then is the file assembled.
        const record = await actions.exportSummary.mutateAsync(reason);
        const file = buildWorkspaceExport({ workspace: record, billing: overview ?? null, meetings: meetings ?? null });
        const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        toast.success(t("exportSummary.toast"));
      }}
    />
  );
}
