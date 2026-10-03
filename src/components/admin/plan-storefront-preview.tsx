"use client";

/**
 * Admin → Plans & pricing → Preview: the plan ladder exactly as a buyer sees it, with the editing
 * controls laid over it.
 *
 * NOT A LOOK-ALIKE. This renders the Billing page's own `PlanGrid`, fed through the same
 * `selectablePlans` that page uses, so a change to either the component or the rule shows up here
 * the moment it ships. A preview drawn separately would be accurate on the day it was written.
 *
 * TWO CONTROLS, ONE EACH. The pencil inside a column adjusts that plan; the "+" cell after the last
 * column adds one. Both open the dialogs the Plans tab already uses, so a plan has one editor.
 *
 * HIDDEN PLANS. Off by default, because the point is "what does a buyer see". Turned on, they are
 * slotted into the ladder where their sort order puts them and marked Hidden, so an admin can see
 * where a plan would land before making it active.
 *
 * Nothing here can buy anything: the grid's Choose / Upgrade buttons have no effect.
 *
 * ORDER AND VISIBILITY ARE EDITED ON THE CARDS (owner, 3 Oct 2026). Drag a card onto another to move
 * it there — or use its ‹ › buttons, which do the same for a keyboard or a touch screen — and flip
 * its Active switch to show or hide it. The order is computed over EVERY plan, hidden ones
 * included, so moving visible cards never shuffles where a hidden plan would land. Both save through
 * the same full-record PUT as the editor (applyPlanEdits), one plan per changed number.
 */

import { useMemo, useState } from "react";
import { CaretLeft, CaretRight, DotsSixVertical } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { PencilSimple, Plus } from "@phosphor-icons/react/dist/ssr";

import { PlanGrid } from "@/app/(app)/[workspaceSlug]/settings/billing/components/plan-grid";
import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { moveId, sortOrderUpdates } from "@/lib/billing/plan-order";
import { comparePlans, selectablePlans, type BillingInterval } from "@/lib/billing/plan-pricing";
import { cn } from "@/lib/utils";
import type { PlanDto } from "@/types/billing";

export function PlanStorefrontPreview({
  plans,
  isPending,
  isError,
  onRetry,
  onEdit,
  onCreate,
  onToggleActive,
  onReorder,
}: {
  plans: readonly PlanDto[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onEdit: (plan: PlanDto) => void;
  onCreate: () => void;
  /** Saves the plan with `isActive` flipped. */
  onToggleActive: (plan: PlanDto, isActive: boolean) => Promise<unknown>;
  /** Saves the new `sortOrder` of every plan whose number changed. */
  onReorder: (updates: { plan: PlanDto; sortOrder: number }[]) => Promise<unknown>;
}) {
  const t = useTranslations("adminPlansSettings.plans.preview");
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Over every plan, hidden ones too: see the file comment.
  const fullOrder = useMemo(() => [...plans].sort(comparePlans).map((plan) => plan.id), [plans]);

  const move = async (movedId: string, targetId: string) => {
    const updates = sortOrderUpdates(plans, moveId(fullOrder, movedId, targetId));
    if (updates.length === 0) return;
    const byId = new Map(plans.map((plan) => [plan.id, plan]));
    setSavingId(movedId);
    setError(null);
    try {
      await onReorder(updates.flatMap(({ id, sortOrder }) => {
        const plan = byId.get(id);
        return plan ? [{ plan, sortOrder }] : [];
      }));
    } catch {
      setError(t("reorderError"));
    } finally {
      setSavingId(null);
    }
  };

  const toggle = async (plan: PlanDto, next: boolean) => {
    setSavingId(plan.id);
    setError(null);
    try {
      await onToggleActive(plan, next);
    } catch {
      setError(t("toggleError", { name: plan.name }));
    } finally {
      setSavingId(null);
    }
  };

  const ladder = useMemo(
    () => (includeHidden ? [...plans].sort(comparePlans) : selectablePlans(plans)),
    [plans, includeHidden],
  );
  const hiddenCount = plans.filter((plan) => !plan.isActive).length;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-ink-muted">{t("note")}</p>
        <label className="flex items-center gap-2 text-[12px] text-ink-muted">
          <Switch
            checked={includeHidden}
            onCheckedChange={setIncludeHidden}
            disabled={hiddenCount === 0}
            aria-label={t("includeHidden", { count: hiddenCount })}
          />
          {t("includeHidden", { count: hiddenCount })}
        </label>
      </div>

      <p className="mt-2 text-[12px] text-ink-subtle">{t("dragHint")}</p>
      {error ? (
        <p role="alert" className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}

      <AdminPanel className="mt-3 overflow-hidden">
        {isError ? (
          <div className="px-4 py-8 text-sm">
            <p className="font-medium text-ink">{t("error")}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        ) : isPending ? (
          <div className="grid gap-px sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-56 animate-pulse bg-surface-2" />
            ))}
          </div>
        ) : (
          <PlanGrid
            plans={ladder}
            currentPlanId={null}
            onSelect={() => undefined}
            interval={interval}
            onIntervalChange={setInterval}
            columnProps={(plan) => ({
              draggable: savingId === null,
              onDragStart: (event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", plan.id);
                setDraggedId(plan.id);
              },
              onDragOver: (event) => {
                if (!draggedId || draggedId === plan.id) return;
                event.preventDefault();
                setOverId(plan.id);
              },
              onDragLeave: () => setOverId((current) => (current === plan.id ? null : current)),
              onDrop: (event) => {
                event.preventDefault();
                const moved = draggedId;
                setDraggedId(null);
                setOverId(null);
                if (moved && moved !== plan.id) void move(moved, plan.id);
              },
              onDragEnd: () => {
                setDraggedId(null);
                setOverId(null);
              },
              className: cn(
                savingId === null && "cursor-grab active:cursor-grabbing",
                draggedId === plan.id && "opacity-40",
                overId === plan.id && "outline-2 -outline-offset-2 outline-dashed outline-primary",
                savingId === plan.id && "animate-pulse",
              ),
            })}
            renderPlanAction={(plan) => {
              const position = ladder.findIndex((candidate) => candidate.id === plan.id);
              const before = position > 0 ? ladder[position - 1] : null;
              const after = position >= 0 && position < ladder.length - 1 ? ladder[position + 1] : null;
              return (
              <>
                <DotsSixVertical size={14} className="text-ink-subtle" aria-hidden />
                {/* The visibility switch sits on the card, not inside the editor: it is the one
                    thing an admin flips most, and hidden is how a plan is retired. */}
                <label
                  className={cn(
                    "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium",
                    plan.isActive
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-hairline bg-surface-2 text-ink-muted",
                  )}
                >
                  <Switch
                    checked={plan.isActive}
                    disabled={savingId !== null}
                    onCheckedChange={(next) => void toggle(plan, next)}
                    aria-label={t("activeToggle", { name: plan.name })}
                  />
                  {plan.isActive ? t("active") : t("hidden")}
                </label>
                <button
                  type="button"
                  disabled={!before || savingId !== null}
                  onClick={() => before && void move(plan.id, before.id)}
                  aria-label={t("moveLeft", { name: plan.name })}
                  title={t("moveLeft", { name: plan.name })}
                  className="inline-flex h-7 w-6 cursor-pointer items-center justify-center rounded-md border border-hairline bg-surface-1 text-ink-muted outline-none hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <CaretLeft size={12} />
                </button>
                <button
                  type="button"
                  disabled={!after || savingId !== null}
                  onClick={() => after && void move(plan.id, after.id)}
                  aria-label={t("moveRight", { name: plan.name })}
                  title={t("moveRight", { name: plan.name })}
                  className="inline-flex h-7 w-6 cursor-pointer items-center justify-center rounded-md border border-hairline bg-surface-1 text-ink-muted outline-none hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <CaretRight size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(plan)}
                  aria-label={t("adjust", { name: plan.name })}
                  title={t("adjust", { name: plan.name })}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-hairline bg-surface-1 text-ink-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <PencilSimple size={14} />
                </button>
              </>
              );
            }}
            trailingCell={
              <button
                type="button"
                onClick={onCreate}
                className="m-3 flex min-h-48 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline text-[13px] font-medium text-ink-muted outline-none hover:border-primary/50 hover:bg-primary/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-surface-1">
                  <Plus size={16} />
                </span>
                {t("addPlan")}
              </button>
            }
          />
        )}
      </AdminPanel>
    </>
  );
}
