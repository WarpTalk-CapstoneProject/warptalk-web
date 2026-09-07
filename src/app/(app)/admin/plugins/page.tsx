"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowsClockwise,
  CaretRight,
  MagnifyingGlass,
  PlugsConnected,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminPluginCatalog } from "@/hooks/use-admin-plugin-catalog";
import {
  catalogRowCannotConnect,
  MISSING_CLIENT_ID_EXPLANATION,
  OAUTH_CLIENT_SOURCE_LABELS,
  PLUGIN_KIND_LABELS,
} from "@/lib/admin/plugin-catalog";
import { cn } from "@/lib/utils";
import type { AdminPluginCatalogListItemDto } from "@/types/admin-plugin-catalog";

const numberFormatter = new Intl.NumberFormat("en-US");

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "retired", label: "Retired" },
] as const;

type StatusValue = (typeof STATUS_TABS)[number]["value"];

function Pill({
  children,
  tone,
  title,
}: {
  children: React.ReactNode;
  tone: "positive" | "muted" | "warning";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "positive" &&
          "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "muted" && "border-border bg-surface-2 text-ink-muted",
        tone === "warning" &&
          "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      {children}
    </span>
  );
}

export default function AdminPluginsPage() {
  const catalogQuery = useAdminPluginCatalog();
  const [status, setStatus] = useState<StatusValue>("all");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);

  const broken = useMemo(() => rows.filter(catalogRowCannotConnect), [rows]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status === "active" && !row.isActive) return false;
      if (status === "retired" && row.isActive) return false;
      if (needle.length === 0) return true;
      return (
        row.label.toLowerCase().includes(needle)
        || row.pluginKey.toLowerCase().includes(needle)
        || row.provider.toLowerCase().includes(needle)
      );
    });
  }, [rows, search, status]);

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Configuration"
        eyebrowIcon={<PlugsConnected size={14} weight="fill" />}
        title="Plugin catalog"
        description="Every row WarpBot offers, retired ones included. This is the whole life of a catalog row after the INSERT — edit it, re-credential it, replace its tools, retire it — which until now meant SQL against a running database."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void catalogQuery.refetch()}
            disabled={catalogQuery.isFetching}
          >
            <ArrowsClockwise size={14} className={cn(catalogQuery.isFetching && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* The condition that took Google consent down in production, raised to the top of the
          screen rather than left to be found by opening each row in turn. */}
      {broken.length > 0 ? (
        <AdminPanel className="mt-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3 px-4 py-3 text-[13px]">
            <Warning size={16} weight="duotone" className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">
                {broken.length} row{broken.length === 1 ? "" : "s"} cannot complete an OAuth
                connect.
              </p>
              <p className="mt-1 text-ink-muted">
                {broken.map((row) => row.label).join(", ")} — marked pre-registered with no client
                id, so the consent screen is built with an empty <span className="font-mono">client_id</span>{" "}
                and the provider refuses it. Open the row and set the client id.
              </p>
            </div>
          </div>
        </AdminPanel>
      ) : null}

      <AdminFilterTabs
        tabs={STATUS_TABS}
        value={status}
        onChange={setStatus}
        label="Filter the catalog by whether a row is active"
        trailing={
          catalogQuery.data
            ? `${numberFormatter.format(visible.length)} of ${numberFormatter.format(rows.length)}`
            : undefined
        }
      />

      <div className="my-3 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlass
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by label, key or provider"
            className="pl-8"
            aria-label="Search the plugin catalog"
          />
        </div>
      </div>

      <AdminPanel>
        {catalogQuery.isError ? (
          <div className="flex items-start gap-3 px-4 py-8 text-sm">
            <WarningCircle
              size={18}
              weight="duotone"
              className="mt-0.5 shrink-0 text-destructive"
            />
            <div>
              <p className="font-medium">The plugin catalog could not be loaded.</p>
              <p className="mt-1 text-ink-muted">
                Check the assistant service, and that your session still holds the platform admin
                role.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void catalogQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          </div>
        ) : catalogQuery.isPending ? (
          <ul aria-busy="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={index} className="border-b border-hairline/60 px-4 py-3.5 last:border-b-0">
                <div className="h-3 w-56 animate-pulse rounded bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-ink-muted">
            The catalog is empty. Nothing is on offer in WarpBot, for anyone.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-ink-muted">
            No row matches this filter.
          </p>
        ) : (
          <>
            <div className="hidden border-b border-hairline/60 px-4 py-2 text-[11px] font-medium text-ink-muted md:flex">
              <span className="flex-1">Plugin</span>
              <span className="w-[70px]">Kind</span>
              <span className="w-[110px]">Provider</span>
              <span className="w-[90px]">State</span>
              <span className="w-[140px]">OAuth client</span>
              <span className="w-[80px] text-right">Installs</span>
              <span className="w-[70px] text-right">Tools</span>
              <span className="w-[24px]" />
            </div>
            <ul>
              {visible.map((row) => (
                <CatalogRow key={row.pluginKey} row={row} />
              ))}
            </ul>
          </>
        )}
      </AdminPanel>

      <p className="mt-2 text-[12px] text-ink-muted">
        A <span className="font-mono">native</span> row is served by compiled-in code and takes its
        OAuth client from service configuration, not from the catalog — so this screen can neither
        set nor vouch for one.
      </p>
    </AdminPage>
  );
}

function CatalogRow({ row }: { row: AdminPluginCatalogListItemDto }) {
  const cannotConnect = catalogRowCannotConnect(row);

  return (
    <li className="border-b border-hairline/60 last:border-b-0">
      <Link
        href={`/admin/plugins/${encodeURIComponent(row.pluginKey)}`}
        className={cn(
          "flex flex-col gap-2 px-4 py-3 text-[13px] transition-colors hover:bg-surface-2/60 md:flex-row md:items-center md:gap-0",
          // Retired rows are visibly quieter. This list, unlike the user-facing catalog, shows
          // both, so "is this row live" has to be answerable without reading a column.
          !row.isActive && "opacity-60",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-ink">{row.label}</span>
            {cannotConnect ? (
              <Pill tone="warning" title={MISSING_CLIENT_ID_EXPLANATION}>
                <Warning size={11} weight="fill" />
                no client id
              </Pill>
            ) : null}
            {row.isFeatured ? <Pill tone="muted">featured</Pill> : null}
          </span>
          <span className="truncate font-mono text-[11px] text-ink-subtle">{row.pluginKey}</span>
        </span>
        <span className="w-[70px] shrink-0 text-[12px] text-ink-muted">
          {PLUGIN_KIND_LABELS[row.kind] ?? row.kind}
        </span>
        <span className="w-[110px] shrink-0 truncate text-[12px] text-ink-muted">
          {row.provider}
        </span>
        <span className="w-[90px] shrink-0">
          {row.isActive ? (
            <Pill tone="positive">active</Pill>
          ) : (
            <Pill tone="muted">retired</Pill>
          )}
        </span>
        <span className="w-[140px] shrink-0 text-[12px]">
          {row.kind === "native" ? (
            <span className="text-ink-subtle">server config</span>
          ) : (
            <span className={cn(cannotConnect ? "font-medium text-amber-600" : "text-ink-muted")}>
              {OAUTH_CLIENT_SOURCE_LABELS[row.oAuthClientSource] ?? row.oAuthClientSource}
            </span>
          )}
        </span>
        <span className="w-[80px] shrink-0 text-[12px] tabular-nums text-ink-muted md:text-right">
          {numberFormatter.format(row.installationCount)}
        </span>
        <span className="w-[70px] shrink-0 text-[12px] tabular-nums text-ink-muted md:text-right">
          {numberFormatter.format(row.toolCount)}
        </span>
        <span className="hidden w-[24px] shrink-0 justify-end text-ink-subtle md:flex">
          <CaretRight size={14} />
        </span>
      </Link>
    </li>
  );
}
