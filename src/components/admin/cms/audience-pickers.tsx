"use client";

/**
 * Who something is sent to: the plan and workspace pickers the announcement editor and the email
 * audience send share, so both target people the same way.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MagnifyingGlass, X } from "@phosphor-icons/react/dist/ssr";

import { Input } from "@/components/ui/input";
import { useAdminPlans } from "@/hooks/use-admin-pricing";
import { useAdminWorkspaceByRef, useAdminWorkspaceDirectory } from "@/hooks/use-admin-workspaces";
import { cn } from "@/lib/utils";

/** Plans come from the billing catalogue; a slug already on the announcement stays even if retired. */
export function PlanPicker({ selected, onChange }: { selected: string[]; onChange: (slugs: string[]) => void }) {
  const t = useTranslations("adminCms.announcements.editor.plans");
  const plans = useAdminPlans();
  const catalog = plans.data ?? [];
  const known = new Set(catalog.map((plan) => plan.slug.toLowerCase()));
  const orphans = selected.filter((slug) => !known.has(slug.toLowerCase()));

  const toggle = (slug: string) => onChange(selected.includes(slug) ? selected.filter((value) => value !== slug) : [...selected, slug]);

  if (plans.isError) return <p className="text-[12px] text-destructive">{t("error")}</p>;
  if (plans.isPending) return <p className="text-[12px] text-ink-muted">{t("loading")}</p>;

  return (
    <div>
      <p className="text-[12px] text-ink-muted">{t("label")}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {catalog.map((plan) => {
          const slug = plan.slug.toLowerCase();
          const on = selected.includes(slug);
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => toggle(slug)}
              aria-pressed={on}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] transition-colors",
                on ? "border-ink bg-ink text-surface-1" : "border-border hover:bg-surface-2",
                !plan.isActive && "opacity-60",
              )}
            >
              {plan.name} <span className={on ? "text-surface-1/70" : "text-ink-subtle"}>· {slug}</span>
            </button>
          );
        })}
        {orphans.map((slug) => (
          <button key={slug} type="button" onClick={() => toggle(slug)} className="rounded-full border border-ink bg-ink px-3 py-1 text-[12px] text-surface-1" title={t("retired")}>
            {slug}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspaceChip({ id, onRemove }: { id: string; onRemove: () => void }) {
  const workspace = useAdminWorkspaceByRef(id);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pl-2.5 pr-1 text-[12px]">
      <span className="max-w-[220px] truncate">{workspace.data?.name ?? id.slice(0, 8)}</span>
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 text-ink-subtle hover:bg-surface-3 hover:text-ink">
        <X size={11} />
      </button>
    </span>
  );
}

export function WorkspacePicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslations("adminCms.announcements.editor.workspaces");
  const [search, setSearch] = useState("");
  const query = useMemo(() => ({ page: 1, pageSize: 8, search: search.trim() }), [search]);
  const directory = useAdminWorkspaceDirectory(query, { enabled: Boolean(search.trim()) });
  const results = search.trim() ? (directory.data?.items ?? []) : [];

  return (
    <div className="space-y-2">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <WorkspaceChip key={id} id={id} onRemove={() => onChange(selected.filter((value) => value !== id))} />
          ))}
        </div>
      ) : null}
      <div className="relative">
        <MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <Input className="pl-8" placeholder={t("searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {search.trim() ? (
        <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
          {directory.isPending ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">{t("searching")}</p>
          ) : directory.isError ? (
            <p className="px-3 py-3 text-[12px] text-destructive">{t("error")}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">{t("noMatch")}</p>
          ) : (
            <ul>
              {results.map((workspace) => {
                const added = selected.includes(workspace.id);
                return (
                  <li key={workspace.id}>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => onChange([...selected, workspace.id])}
                      className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-surface-2 disabled:opacity-50"
                    >
                      <span className="truncate text-[13px] text-ink">{workspace.name}</span>
                      <span className="shrink-0 text-[11px] text-ink-subtle">{added ? t("added") : t("memberCount", { count: workspace.memberCount })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
