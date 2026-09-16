"use client";

/**
 * Features — what this workspace is entitled to, and which layer decided each answer.
 *
 * READ-ONLY. The values come from the entitlement snapshot billing publishes (WT-263:
 * platform default → plan → contract → workspace limit). Nothing on this page changes one: a
 * higher limit is a purchase, which is Billing's job, and an owner's own tighter limit is set where
 * the setting lives. The page only explains, which is the thing a limit on its own never did.
 *
 * COLD START IS SAID OUT LOUD. A workspace whose snapshot has not arrived yet gets a sentence, not
 * a table of platform defaults — defaults would tell a paying workspace it has the free tier.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Info, Spinner, Warning } from "@phosphor-icons/react";

import { useWorkspaceEntitlements } from "@/hooks/use-workspace";
import {
  buildEntitlementSections,
  type EntitlementRow,
  type EntitlementSourceKind,
  type EntitlementSourceLabel,
  type FormattedEntitlementValue,
} from "@/lib/workspace/entitlements";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";

type ApiErrorLike = { response?: { status?: number } };

const SOURCE_CHIP_TONE: Record<EntitlementSourceKind, string> = {
  plan: "border-primary/25 bg-primary/10 text-primary",
  contract: "border-hairline bg-surface-2 text-ink",
  platform: "border-hairline bg-surface-2 text-ink-muted",
  workspace: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  unknown: "border-hairline bg-surface-2 text-ink-muted",
};

function SourceChip({ source }: { source: EntitlementSourceLabel }) {
  return (
    <span
      title={source.detail}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        SOURCE_CHIP_TONE[source.kind],
      )}
    >
      {source.label}
    </span>
  );
}

function ValueText({ value, muted }: { value: FormattedEntitlementValue; muted?: boolean }) {
  return (
    <span
      className={cn(
        "text-xs font-semibold tabular-nums",
        value.state === "excluded" || muted ? "text-ink-muted" : "text-ink",
      )}
    >
      {value.text}
    </span>
  );
}

function FeatureRow({ row }: { row: EntitlementRow }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-semibold text-ink">{row.label}</span>
        {row.description ? <span className="text-[11px] text-ink-muted">{row.description}</span> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <ValueText value={row.value} />
          <SourceChip source={row.source} />
        </div>
        {row.ceiling ? (
          <span className="text-[11px] text-ink-muted">
            {row.ceiling.source.label === "Plan" ? "Plan allows" : `${row.ceiling.source.label} allows`}{" "}
            <ValueText value={row.ceiling.value} muted />
          </span>
        ) : null}
        {row.ceilingUnknown ? (
          <span className="text-[11px] text-ink-muted">Lowered by the workspace owner</span>
        ) : null}
      </div>
    </div>
  );
}

function CenteredNotice({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-hairline bg-surface-1 px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-muted">{icon}</div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-xs text-ink-muted">{body}</p>
    </div>
  );
}

export default function WorkspaceFeaturesPage() {
  const params = useParams();
  const slugParam = params?.workspaceSlug;
  const routeSlug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug) || routeSlug || "";
  const billingHref = `/${workspaceSlug}/settings/billing`;

  const entitlementsQuery = useWorkspaceEntitlements(activeWorkspaceId || "");

  if (!activeWorkspaceId) return null;

  const snapshot = entitlementsQuery.data;
  const sections = snapshot?.isKnown ? buildEntitlementSections(snapshot.entitlements) : [];
  const status = (entitlementsQuery.error as ApiErrorLike | null)?.response?.status;

  let body: React.ReactNode;
  if (entitlementsQuery.isPending) {
    body = (
      <div className="flex h-[40vh] items-center justify-center">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  } else if (entitlementsQuery.isError) {
    body = (
      <CenteredNotice
        icon={<Warning className="h-5 w-5" />}
        title={status === 403 ? "You are not a member of this workspace" : "Features could not be loaded"}
        body={
          status === 403
            ? "Only members of this workspace can see what it includes."
            : "Something went wrong while loading this workspace's features. Try again in a moment."
        }
      />
    );
  } else if (!snapshot?.isKnown) {
    body = (
      <CenteredNotice
        icon={<Info className="h-5 w-5" />}
        title="Features are not available yet"
        body="This workspace's plan has not been applied yet. This usually takes a few seconds after a plan starts; check back shortly."
      />
    );
  } else {
    body = (
      <>
        {!snapshot.hasActiveSubscription ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <Warning className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <p className="text-xs text-ink">
              This workspace has no active plan, so platform defaults apply and new meetings cannot start.{" "}
              <Link href={billingHref} className="font-semibold underline underline-offset-2">
                Choose a plan
              </Link>
            </p>
          </div>
        ) : null}

        {sections.map((section) => (
          <div key={section.group} className="flex flex-col gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{section.group}</div>
            <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface-1 shadow-linear">
              {section.rows.map((row) => (
                <FeatureRow key={row.key} row={row} />
              ))}
            </div>
          </div>
        ))}

        {snapshot.resolvedAt ? (
          <p className="text-[11px] text-ink-subtle">
            Last updated{" "}
            {new Date(snapshot.resolvedAt).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 text-ink">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight text-ink">Features</h1>
          <p className="text-xs text-ink-muted">
            What this workspace includes, and whether each limit comes from its plan, a contract, the platform
            default or a limit set by the workspace.
          </p>
        </div>
        <Link
          href={billingHref}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-3 text-xs font-semibold text-ink transition hover:bg-surface-2"
        >
          Upgrade in Billing
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {body}
    </div>
  );
}
