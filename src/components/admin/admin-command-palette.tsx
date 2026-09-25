"use client";

import {
  ArrowRight,
  BookOpen,
  Buildings,
  ChatCircleText,
  ClockCounterClockwise,
  CreditCard,
  FileText,
  GearSix,
  Handshake,
  Lightning,
  MagnifyingGlass,
  PlugsConnected,
  Receipt,
  SquaresFour,
  User,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useStaffAccess } from "@/hooks/use-staff-access";
import { ADMIN_PLATFORM_SETTINGS_KEYS } from "@/hooks/use-admin-platform-settings";
import { rankSettings, settingHref } from "@/lib/admin/platform-settings";
import { canUsePaletteEntry, canViewAdminPath } from "@/lib/admin/staff-permissions";
import { useEffect, useState, type ReactNode } from "react";

import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ADMIN_PLUGIN_CATALOG_KEYS } from "@/hooks/use-admin-plugin-catalog";
import { ADMIN_PRICING_KEYS } from "@/hooks/use-admin-pricing";
import {
  ADMIN_PALETTE_ACTIONS,
  ADMIN_PALETTE_PAGES,
  ADMIN_RECENT_STORAGE_KEY,
  ADMIN_SEARCHABLE_LISTS,
  listSearchHref,
  parseRecent,
  pushRecent,
  rankPaletteEntries,
  type AdminPaletteEntry,
  type AdminRecentItem,
  type AdminRecentKind,
} from "@/lib/admin/command-palette";
import { looksLikeGuid, matchesSearch } from "@/lib/admin/search-text";
import { adminFeedbackService } from "@/services/admin-feedback.service";
import { adminPlatformSettingsService } from "@/services/admin-platform-settings.service";
import { adminPluginCatalogService } from "@/services/admin-plugin-catalog.service";
import { adminPricingService } from "@/services/admin-pricing.service";
import { adminSalesLeadService } from "@/services/admin-sales-lead.service";
import { adminUserService } from "@/services/admin-user.service";
import { adminWorkspaceService } from "@/services/admin-workspace.service";
import { billingService } from "@/services/billing.service";
import { GlobalGlossaryService } from "@/services/global-glossary.service";
import { useUIStore } from "@/stores/ui-store";

const MIN_QUERY = 2;
const PER_SOURCE = 5;

const KIND_ICON: Record<AdminRecentKind, ReactNode> = {
  page: <SquaresFour size={15} />,
  action: <Lightning size={15} />,
  workspace: <Buildings size={15} />,
  account: <User size={15} />,
  plan: <FileText size={15} />,
  plugin: <PlugsConnected size={15} />,
  invoice: <Receipt size={15} />,
  ledger: <CreditCard size={15} />,
  salesLead: <Handshake size={15} />,
  feedback: <ChatCircleText size={15} />,
  glossaryTerm: <BookOpen size={15} />,
  setting: <GearSix size={15} />,
};

function readRecent(): AdminRecentItem[] {
  try {
    return parseRecent(window.localStorage.getItem(ADMIN_RECENT_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeRecent(items: AdminRecentItem[]) {
  try {
    window.localStorage.setItem(ADMIN_RECENT_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private window or blocked storage: recents are a convenience, never a failure.
  }
}

/** One result row, whatever it came from. */
interface PaletteResult extends AdminRecentItem {
  id: string;
}

/**
 * Each entity source, run only while the palette is open and the query is long enough to mean
 * something. Every source post-filters what it gets back: a backend that predates a `search`
 * parameter ignores it and returns the newest rows instead, and listing five unrelated invoices
 * under "INV-2026-0042" would be worse than listing none.
 */
function useEntityResults(query: string, open: boolean, canReadSettings: boolean) {
  const enabled = open && query.length >= MIN_QUERY;
  const guid = looksLikeGuid(query);

  const workspaces = useQuery({
    queryKey: ["admin-palette", "workspaces", query],
    queryFn: () => adminWorkspaceService.getDirectory({ search: query, page: 1, pageSize: PER_SOURCE }),
    enabled,
    staleTime: 30_000,
  });
  const accounts = useQuery({
    queryKey: ["admin-palette", "accounts", query],
    queryFn: () => adminUserService.getDirectory({ search: query, page: 1, pageSize: PER_SOURCE }),
    enabled,
    staleTime: 30_000,
  });
  // The catalogue lists are small and already cached by their own pages under these keys.
  const plans = useQuery({
    queryKey: ADMIN_PRICING_KEYS.plans,
    queryFn: () => adminPricingService.getAllPlans(),
    enabled,
    staleTime: 5 * 60_000,
  });
  const plugins = useQuery({
    queryKey: ADMIN_PLUGIN_CATALOG_KEYS.list,
    queryFn: () => adminPluginCatalogService.list(),
    enabled,
    staleTime: 60_000,
  });
  const invoices = useQuery({
    queryKey: ["admin-palette", "invoices", query],
    queryFn: () => billingService.getGlobalInvoices(1, PER_SOURCE, { search: query }),
    enabled,
    staleTime: 30_000,
  });
  const ledger = useQuery({
    queryKey: ["admin-palette", "ledger", query],
    queryFn: () => billingService.getGlobalCreditHistory(1, PER_SOURCE, { search: query }),
    // A ledger row has no name; the only thing worth typing to find one is its id.
    enabled: enabled && guid,
    staleTime: 30_000,
  });
  const salesLeads = useQuery({
    queryKey: ["admin-palette", "sales-leads", query],
    queryFn: () => adminSalesLeadService.list({ page: 1, pageSize: PER_SOURCE, search: query }),
    enabled,
    staleTime: 30_000,
  });
  const feedback = useQuery({
    queryKey: ["admin-palette", "feedback", query],
    queryFn: () => adminFeedbackService.getComments({ page: 1, pageSize: PER_SOURCE, search: query }),
    enabled,
    staleTime: 30_000,
  });
  const glossary = useQuery({
    queryKey: ["admin-palette", "glossary", query],
    queryFn: () => GlobalGlossaryService.getTerms({ page: 1, pageSize: PER_SOURCE, search: query }),
    enabled,
    staleTime: 30_000,
  });
  // Every platform setting, searched in the browser: the registry is a few dozen rows and the
  // settings page caches it under the same key. Only for staff who may read settings — the
  // endpoint would refuse anyone else, and a group that can only fail is noise.
  const settings = useQuery({
    queryKey: ADMIN_PLATFORM_SETTINGS_KEYS.console,
    queryFn: () => adminPlatformSettingsService.get(),
    enabled: enabled && canReadSettings,
    staleTime: 60_000,
  });

  const groups: { id: string; kind: AdminRecentKind; results: PaletteResult[]; loading: boolean; failed: boolean }[] =
    enabled
      ? [
          ...(canReadSettings
            ? [
                {
                  id: "settings",
                  kind: "setting" as const,
                  loading: settings.isFetching && !settings.data,
                  failed: settings.isError,
                  results: rankSettings(query, settings.data?.settings ?? [], PER_SOURCE).map((setting) => ({
                    id: `setting:${setting.key}`,
                    kind: "setting" as const,
                    href: settingHref(setting.key),
                    label: setting.label,
                    detail: setting.key,
                  })),
                },
              ]
            : []),
          {
            id: "workspaces",
            kind: "workspace",
            loading: workspaces.isFetching && !workspaces.data,
            failed: workspaces.isError,
            results: (workspaces.data?.items ?? []).map((w) => ({
              id: `workspace:${w.id}`,
              kind: "workspace",
              href: `/admin/workspaces/${w.slug}`,
              label: w.name,
              detail: w.slug,
            })),
          },
          {
            id: "accounts",
            kind: "account",
            loading: accounts.isFetching && !accounts.data,
            failed: accounts.isError,
            results: (accounts.data?.items ?? []).map((u) => ({
              id: `account:${u.id}`,
              kind: "account",
              href: `/admin/users/${u.id}`,
              label: u.fullName || u.email,
              detail: u.email,
            })),
          },
          {
            id: "plans",
            kind: "plan",
            loading: plans.isFetching && !plans.data,
            failed: plans.isError,
            results: (plans.data ?? [])
              .filter((p) => matchesSearch(query, [p.name, p.slug, p.tier]))
              .slice(0, PER_SOURCE)
              .map((p) => ({
                id: `plan:${p.id}`,
                kind: "plan",
                href: listSearchHref("/admin/plans", p.slug),
                label: p.name,
                detail: `${p.slug} · ${p.billingCycle}`,
              })),
          },
          {
            id: "plugins",
            kind: "plugin",
            loading: plugins.isFetching && !plugins.data,
            failed: plugins.isError,
            results: (plugins.data ?? [])
              .filter((p) => matchesSearch(query, [p.label, p.pluginKey, p.provider, p.category]))
              .slice(0, PER_SOURCE)
              .map((p) => ({
                id: `plugin:${p.pluginKey}`,
                kind: "plugin",
                href: `/admin/plugins/${encodeURIComponent(p.pluginKey)}`,
                label: p.label,
                detail: p.pluginKey,
              })),
          },
          {
            id: "invoices",
            kind: "invoice",
            loading: invoices.isFetching && !invoices.data,
            failed: invoices.isError,
            results: (invoices.data?.items ?? [])
              .filter((i) => (guid ? i.id.toLowerCase() === query.toLowerCase() : matchesSearch(query, [i.invoiceNumber])))
              .map((i) => ({
                id: `invoice:${i.id}`,
                kind: "invoice",
                href: `/admin/billing?tab=invoices&q=${encodeURIComponent(i.invoiceNumber)}`,
                label: i.invoiceNumber,
                detail: [i.workspaceName, `${i.total.toLocaleString()} ${i.currency}`, i.status].filter(Boolean).join(" · "),
              })),
          },
          {
            id: "ledger",
            kind: "ledger",
            loading: ledger.isFetching && !ledger.data,
            failed: ledger.isError,
            results: (ledger.data?.items ?? [])
              .filter((tx) => [tx.id, tx.referenceId].some((id) => id?.toLowerCase() === query.toLowerCase()))
              .map((tx) => ({
                id: `ledger:${tx.id}`,
                kind: "ledger",
                href: `/admin/billing?tab=ledger&q=${encodeURIComponent(query)}`,
                label: tx.description || tx.type,
                detail: [tx.workspaceName, `${tx.amount > 0 ? "+" : ""}${tx.amount.toLocaleString()}`].filter(Boolean).join(" · "),
              })),
          },
          {
            id: "salesLeads",
            kind: "salesLead",
            loading: salesLeads.isFetching && !salesLeads.data,
            failed: salesLeads.isError,
            results: (salesLeads.data?.items ?? []).map((lead) => ({
              id: `lead:${lead.id}`,
              kind: "salesLead",
              href: listSearchHref("/admin/sales-leads", lead.workEmail),
              label: lead.company || `${lead.firstName} ${lead.lastName}`,
              detail: lead.workEmail,
            })),
          },
          {
            id: "feedback",
            kind: "feedback",
            loading: feedback.isFetching && !feedback.data,
            failed: feedback.isError,
            results: (feedback.data?.items ?? [])
              .filter((c) => matchesSearch(query, [c.comment, c.roomTitle]))
              .map((c, index) => ({
                id: `feedback:${c.translationRoomId}:${index}`,
                kind: "feedback",
                href: listSearchHref("/admin/feedback", query),
                label: c.comment.length > 80 ? `${c.comment.slice(0, 80)}…` : c.comment,
                detail: `${c.roomTitle} · ${"★".repeat(Math.max(0, Math.min(5, c.overallRating)))}`,
              })),
          },
          {
            id: "glossary",
            kind: "glossaryTerm",
            loading: glossary.isFetching && !glossary.data,
            failed: glossary.isError,
            results: (glossary.data?.items ?? []).map((term) => ({
              id: `term:${term.id}`,
              kind: "glossaryTerm",
              href: listSearchHref("/admin/global-glossary", term.term),
              label: term.term,
              detail: term.preferredTranslation,
            })),
          },
        ]
      : [];

  return groups;
}

/**
 * The admin portal's ⌘K. Replaces the workspace app's room-code palette on /admin routes only —
 * `(app)/layout.tsx` mounts one or the other, never both, so a single ⌘K handler is live at a time.
 *
 * It reuses the shell's palette flag in the UI store: the flag means "the palette is open", and
 * which palette that is depends on where the admin is standing.
 */
export function AdminCommandPalette() {
  const t = useTranslations("adminLists.palette");
  const tNav = useTranslations("common.sidebar.adminNav.items");
  const { access: staffAccess } = useStaffAccess();
  const router = useRouter();
  const open = useUIStore((state) => state.searchMeetingModalOpen);
  const setOpen = useUIStore((state) => state.setSearchMeetingModalOpen);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recent, setRecent] = useState<AdminRecentItem[]>([]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setOpen]);

  // Reset on close and reload recents on open, adjusted during render (not in an effect) so a
  // reopened palette never paints the previous query for a frame.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setRecent(readRecent());
    else {
      setQuery("");
      setDebounced("");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const labelOf = (entry: AdminPaletteEntry) =>
    entry.kind === "page" ? tNav(entry.labelKey) : t(`actions.${entry.labelKey}`);

  const trimmed = query.trim();
  // Fifteen pages and ten actions: ranking them on every keystroke costs nothing worth memoising.
  // G10: only what this person's staff role may open. The server refuses the rest anyway; the
  // palette should not offer a command that can only end in "you don't have access".
  const allowedPages = ADMIN_PALETTE_PAGES.filter((entry) => canUsePaletteEntry(staffAccess, entry));
  const allowedActions = ADMIN_PALETTE_ACTIONS.filter((entry) => canUsePaletteEntry(staffAccess, entry));
  const pages = trimmed
    ? rankPaletteEntries(trimmed, allowedPages, labelOf).map((r) => r.entry)
    : allowedPages;
  const actions = trimmed
    ? rankPaletteEntries(trimmed, allowedActions, labelOf).map((r) => r.entry)
    : allowedActions.slice(0, 4);
  const entityGroups = useEntityResults(debounced, open, canViewAdminPath(staffAccess, "/admin/settings"));

  const go = (item: AdminRecentItem) => {
    const next = pushRecent(readRecent(), item);
    writeRecent(next);
    setRecent(next);
    setOpen(false);
    router.push(item.href);
  };

  const entryItem = (entry: AdminPaletteEntry) => {
    const label = labelOf(entry);
    return (
      <CommandItem
        key={entry.id}
        value={`${entry.kind}:${entry.id}`}
        onSelect={() => go({ kind: entry.kind, href: entry.href, label })}
        className="gap-3 rounded-lg px-3 py-2"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-hairline bg-surface-1 text-ink-muted">
          {KIND_ICON[entry.kind]}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{label}</span>
        <span className="text-[11px] text-ink-subtle">{t(`kinds.${entry.kind}`)}</span>
      </CommandItem>
    );
  };

  const resultItem = (result: PaletteResult) => (
    <CommandItem
      key={result.id}
      value={result.id}
      onSelect={() => go({ kind: result.kind, href: result.href, label: result.label, detail: result.detail })}
      className="gap-3 rounded-lg px-3 py-2"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md border border-hairline bg-surface-1 text-ink-muted">
        {KIND_ICON[result.kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink">{result.label}</span>
        {result.detail ? <span className="block truncate text-[11px] text-ink-subtle">{result.detail}</span> : null}
      </span>
    </CommandItem>
  );

  const anyEntity = entityGroups.some((group) => group.results.length > 0);
  const anyLoading = entityGroups.some((group) => group.loading);
  const failedSources = entityGroups.filter((group) => group.failed);
  const nothing = trimmed && pages.length === 0 && actions.length === 0 && !anyEntity && !anyLoading && debounced === trimmed;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("title")}
      description={t("description")}
      className="!max-w-[640px] sm:max-w-[640px]"
      showCloseButton={false}
    >
      <Command shouldFilter={false} className="rounded-xl bg-popover p-0" label={t("title")}>
        <div className="border-b border-hairline p-2">
          <CommandInput
            placeholder={t("placeholder")}
            value={query}
            onValueChange={setQuery}
            autoFocus
            wrapperClassName="p-0"
            inputGroupClassName="h-11! border-0 bg-transparent shadow-none!"
            className="text-[14px]"
          />
        </div>
        <CommandList className="max-h-[min(60vh,480px)] p-1.5">
          {!trimmed && recent.length ? (
            <CommandGroup heading={t("groups.recent")}>
              {recent.map((item) => (
                <CommandItem
                  key={`recent:${item.href}`}
                  value={`recent:${item.href}`}
                  onSelect={() => go(item)}
                  className="gap-3 rounded-lg px-3 py-2"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md border border-hairline bg-surface-1 text-ink-muted">
                    <ClockCounterClockwise size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{item.label}</span>
                    {item.detail ? <span className="block truncate text-[11px] text-ink-subtle">{item.detail}</span> : null}
                  </span>
                  <span className="text-[11px] text-ink-subtle">{t(`kinds.${item.kind}`)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {pages.length ? <CommandGroup heading={t("groups.pages")}>{pages.slice(0, trimmed ? 6 : pages.length).map(entryItem)}</CommandGroup> : null}
          {actions.length ? <CommandGroup heading={t("groups.actions")}>{actions.map(entryItem)}</CommandGroup> : null}

          {entityGroups
            .filter((group) => group.results.length > 0)
            .map((group) => (
              <CommandGroup key={group.id} heading={t(`groups.${group.id}`)}>
                {group.results.map(resultItem)}
              </CommandGroup>
            ))}

          {trimmed.length >= MIN_QUERY ? (
            <CommandGroup heading={t("groups.searchIn")}>
              {ADMIN_SEARCHABLE_LISTS.filter((target) => canViewAdminPath(staffAccess, target.href)).map((target) => (
                <CommandItem
                  key={`search:${target.id}`}
                  value={`search:${target.id}`}
                  onSelect={() =>
                    go({ kind: "page", href: listSearchHref(target.href, trimmed), label: `${tNav(target.labelKey)}: ${trimmed}` })
                  }
                  className="gap-3 rounded-lg px-3 py-2"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md border border-hairline bg-surface-1 text-ink-muted">
                    <MagnifyingGlass size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {t("searchIn", { page: tNav(target.labelKey), query: trimmed })}
                  </span>
                  <ArrowRight size={13} className="text-ink-subtle" />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {anyLoading ? (
            <p className="px-3 py-2 text-[12px] text-ink-subtle" aria-live="polite">
              {t("searching")}
            </p>
          ) : null}
          {failedSources.length ? (
            <p className="px-3 py-2 text-[12px] text-ink-subtle">
              {t("sourcesFailed", { sources: failedSources.map((group) => t(`groups.${group.id}`)).join(", ") })}
            </p>
          ) : null}
          {nothing ? (
            <p className="px-3 py-6 text-center text-[13px] text-ink-muted" role="status">
              {t("empty", { query: trimmed })}
            </p>
          ) : null}
        </CommandList>
        <div className="flex items-center gap-3 border-t border-hairline px-3 py-2 text-[11px] text-ink-subtle">
          <span>
            <kbd className="rounded bg-surface-2 px-1 font-mono">↑↓</kbd> {t("hints.navigate")}
          </span>
          <span>
            <kbd className="rounded bg-surface-2 px-1 font-mono">↵</kbd> {t("hints.open")}
          </span>
          <span>
            <kbd className="rounded bg-surface-2 px-1 font-mono">esc</kbd> {t("hints.close")}
          </span>
          {!trimmed && recent.length ? (
            <button
              type="button"
              onClick={() => {
                writeRecent([]);
                setRecent([]);
              }}
              className="ml-auto rounded px-1 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {t("clearRecent")}
            </button>
          ) : null}
        </div>
      </Command>
    </CommandDialog>
  );
}

/**
 * The header's search box in the admin portal: a trigger for `AdminCommandPalette`, worded for the
 * portal instead of "Search, or paste a room code".
 */
export function AdminHeaderSearch() {
  const t = useTranslations("adminLists.palette");
  const setOpen = useUIStore((state) => state.setSearchMeetingModalOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t("triggerAria")}
      aria-keyshortcuts="Meta+K Control+K"
      data-admin-search
      className="hidden h-7 w-full max-w-[420px] items-center gap-2 rounded-md border border-border bg-surface-1 px-2.5 text-[12px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:flex"
    >
      <MagnifyingGlass weight="light" className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate text-left">{t("triggerLabel")}</span>
      <kbd className="rounded-sm bg-surface-2 px-1.5 font-mono text-[10px] text-ink-muted">⌘K</kbd>
    </button>
  );
}
