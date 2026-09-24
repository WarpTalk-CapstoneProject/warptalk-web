"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  CaretRight,
  MagnifyingGlass,
  Plugs,
  Plus,
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
import { PluginGlyph } from "@/components/assistant/plugin-glyph";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminPluginCatalog, useCreateAdminPlugin } from "@/hooks/use-admin-plugin-catalog";
import {
  catalogRowCannotConnect,
  EMPTY_NEW_PLUGIN_DRAFT,
  RESERVED_PLUGIN_KEYS,
  toCreatePluginRequest,
  validateNewPlugin,
  type NewPluginDraft,
} from "@/lib/admin/plugin-catalog";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminPluginCatalogListItemDto } from "@/types/admin-plugin-catalog";

const numberFormatter = new Intl.NumberFormat("en-US");

const STATUS_VALUES = ["all", "active", "retired"] as const;

type StatusValue = (typeof STATUS_VALUES)[number];

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
  const t = useTranslations("adminPlugins.list");
  const catalogQuery = useAdminPluginCatalog();
  const [status, setStatus] = useState<StatusValue>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const statusTabs = useMemo(
    () =>
      STATUS_VALUES.map((value) => ({
        value,
        label: t(`tabs.${value}`),
      })),
    [t],
  );

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
        eyebrow={t("eyebrow")}
        eyebrowIcon={<PlugsConnected size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void catalogQuery.refetch()}
              disabled={catalogQuery.isFetching}
            >
              <ArrowsClockwise
                size={14}
                className={cn(catalogQuery.isFetching && "animate-spin")}
              />
              {t("refresh")}
            </Button>
            {/* The action the whole "the catalog is data, not code" claim rests on. Without it the
                screen could edit, re-credential and retire a row it had no way to create, and
                adding an MCP app went back to being SQL against a running database. */}
            {/* A menu with one item on purpose (owner, 2026-09-17): plugins are MCP only — there is
                no skill-only kind — and the menu is where a second way to create one would go. */}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" />}>
                <Plus size={14} />
                {t("createPlugin")}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuItem onClick={() => setCreateOpen(true)} className="cursor-pointer gap-2">
                  <Plugs size={14} />
                  {t("withMcp")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <NewPluginDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existing={rows}
        catalogLoaded={Boolean(catalogQuery.data)}
      />

      {/* The condition that took Google consent down in production, raised to the top of the
          screen rather than left to be found by opening each row in turn. */}
      {broken.length > 0 ? (
        <AdminPanel className="mt-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3 px-4 py-3 text-[13px]">
            <Warning size={16} weight="duotone" className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">
                {t("brokenHeading", { count: broken.length })}
              </p>
              <p className="mt-1 text-ink-muted">
                {t("brokenDetail", { labels: broken.map((row) => row.label).join(", ") })}
              </p>
            </div>
          </div>
        </AdminPanel>
      ) : null}

      <AdminFilterTabs
        tabs={statusTabs}
        value={status}
        onChange={setStatus}
        label={t("filterAria")}
        trailing={
          catalogQuery.data
            ? t("trailingCount", {
                visible: numberFormatter.format(visible.length),
                total: numberFormatter.format(rows.length),
              })
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
            placeholder={t("searchPlaceholder")}
            className="pl-8"
            aria-label={t("searchAria")}
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
              <p className="font-medium">{t("error.title")}</p>
              <p className="mt-1 text-ink-muted">{t("error.body")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void catalogQuery.refetch()}
              >
                {t("error.tryAgain")}
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
          <p className="px-4 py-10 text-center text-[12px] text-ink-muted">{t("emptyCatalog")}</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-ink-muted">{t("noMatch")}</p>
        ) : (
          <>
            <div className="hidden border-b border-hairline/60 px-4 py-2 text-[11px] font-medium text-ink-muted md:flex">
              <span className="flex-1">{t("columns.plugin")}</span>
              <span className="w-[70px]">{t("columns.kind")}</span>
              <span className="w-[110px]">{t("columns.provider")}</span>
              <span className="w-[90px]">{t("columns.state")}</span>
              <span className="w-[140px]">{t("columns.oauthClient")}</span>
              <span className="w-[120px] text-right">{t("columns.workspaces")}</span>
              <span className="w-[90px] text-right">{t("columns.installs")}</span>
              <span className="w-[70px] text-right">{t("columns.tools")}</span>
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

      <p className="mt-2 text-[12px] text-ink-muted">{t("footerNote")}</p>
    </AdminPage>
  );
}

// ── Adding a row ─────────────────────────────────────────────────────────────

/**
 * One labelled input in the create form, with the reason it is refused sitting under it.
 *
 * Under it rather than in a toast, because the create endpoint answers a reserved key, a duplicate
 * key and a provider collision with the same 400 and the same error code — so a server refusal
 * arrives as one sentence attached to no field at all. Everything this form can attribute to a
 * box, it attributes to that box.
 */
function DraftField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[12px]">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-[11px] leading-5 text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] leading-5 text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function NewPluginDialog({
  open,
  onOpenChange,
  existing,
  catalogLoaded,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** The loaded listing, so a key already taken is caught at the box rather than by a 400. */
  existing: readonly AdminPluginCatalogListItemDto[];
  catalogLoaded: boolean;
}) {
  const t = useTranslations("adminPlugins.list.dialog");
  const router = useRouter();
  const mutation = useCreateAdminPlugin();

  const [draft, setDraft] = useState<NewPluginDraft>(EMPTY_NEW_PLUGIN_DRAFT);
  const [touched, setTouched] = useState<Partial<Record<keyof NewPluginDraft, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [withOAuth, setWithOAuth] = useState(false);

  const errors = useMemo(() => validateNewPlugin(draft, existing), [draft, existing]);
  const problemCount = Object.keys(errors).length;

  const update = (field: keyof NewPluginDraft, value: string) =>
    setDraft((previous) => ({ ...previous, [field]: value }));

  // Shown once the operator has left the box, or once they have tried to submit. Validating live
  // and displaying live would put "a plugin key is required" under a field nobody has reached yet.
  const errorFor = (field: keyof NewPluginDraft) =>
    attempted || touched[field] ? errors[field] : undefined;

  const bind = (field: keyof NewPluginDraft) => ({
    value: draft[field],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      update(field, event.target.value),
    onBlur: () => setTouched((previous) => ({ ...previous, [field]: true })),
    "aria-invalid": Boolean(errorFor(field)),
  });

  const resetDraft = () => {
    setDraft(EMPTY_NEW_PLUGIN_DRAFT);
    setTouched({});
    setAttempted(false);
    setWithOAuth(false);
  };

  /** Refuses to close while the create is in flight: a click on the overlay must not abandon it. */
  const handleOpenChange = (next: boolean) => {
    if (mutation.isPending) return;
    onOpenChange(next);
    if (!next) resetDraft();
  };

  /**
   * Clearing the OAuth boxes when the section is folded away, rather than merely hiding them.
   * A half-typed client id that is not on screen is still a client id this form would send, and
   * sending one is what flips the row to `preregistered` — the state whose missing id took Google
   * consent down.
   */
  const toggleOAuth = (next: boolean) => {
    setWithOAuth(next);
    if (!next) {
      setDraft((previous) => ({
        ...previous,
        clientId: "",
        clientSecret: "",
        authorizationEndpoint: "",
        tokenEndpoint: "",
        revokeEndpoint: "",
      }));
    }
  };

  const submit = async () => {
    setAttempted(true);
    if (problemCount > 0) {
      toast.error(t("toast.problemCount", { count: problemCount }));
      return;
    }

    try {
      const created = await mutation.mutateAsync(toCreatePluginRequest(draft));
      onOpenChange(false);
      resetDraft();
      toast.success(t("toast.success", { key: created.key }));
      // To the new row rather than back to the list: a fresh row has no tools and no client yet,
      // and its own page is where both are dealt with.
      router.push(`/admin/plugins/${encodeURIComponent(created.key)}`);
    } catch (error) {
      toast.error(getErrorMessage(error, t("toast.errorFallback")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("intro")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <DraftField
            label={t("pluginKey.label")}
            htmlFor="new-plugin-key"
            error={errorFor("pluginKey")}
            hint={t("pluginKey.hint", { keys: RESERVED_PLUGIN_KEYS.join(", ") })}
          >
            <Input
              id="new-plugin-key"
              placeholder={t("pluginKey.placeholder")}
              maxLength={100}
              className="font-mono text-[12px]"
              {...bind("pluginKey")}
            />
          </DraftField>

          <DraftField label={t("label.label")} htmlFor="new-plugin-label" error={errorFor("label")}>
            <Input
              id="new-plugin-label"
              placeholder={t("label.placeholder")}
              maxLength={150}
              {...bind("label")}
            />
          </DraftField>

          <div className="md:col-span-2">
            <DraftField
              label={t("description.label")}
              htmlFor="new-plugin-description"
              error={errorFor("description")}
              hint={t("description.hint")}
            >
              <Textarea
                id="new-plugin-description"
                rows={2}
                maxLength={500}
                {...bind("description")}
              />
            </DraftField>
          </div>

          <div className="md:col-span-2">
            <DraftField
              label={t("mcpServerUrl.label")}
              htmlFor="new-plugin-server-url"
              error={errorFor("mcpServerUrl")}
              hint={t("mcpServerUrl.hint")}
            >
              <Input
                id="new-plugin-server-url"
                placeholder={t("mcpServerUrl.placeholder")}
                className="font-mono text-[12px]"
                {...bind("mcpServerUrl")}
              />
            </DraftField>
          </div>

          <DraftField
            label={t("avatarUrl.label")}
            htmlFor="new-plugin-avatar"
            error={errorFor("avatarUrl")}
            hint={t("avatarUrl.hint")}
          >
            <Input id="new-plugin-avatar" {...bind("avatarUrl")} />
          </DraftField>

          <DraftField
            label={t("requiredScopes.label")}
            htmlFor="new-plugin-scopes"
            hint={t("requiredScopes.hint")}
          >
            <Textarea
              id="new-plugin-scopes"
              rows={2}
              className="font-mono text-[12px]"
              {...bind("requiredScopes")}
            />
          </DraftField>
        </div>

        <fieldset className="rounded-lg border border-hairline bg-surface-2/50 px-3 py-3">
          <legend className="px-1 text-[12px] font-medium text-ink">{t("authMode.legend")}</legend>
          <div className="grid gap-2 md:grid-cols-2">
            {(
              [
                ["oauth", t("authMode.oauthTitle"), t("authMode.oauthNote")],
                ["api_key", t("authMode.apiKeyTitle"), t("authMode.apiKeyNote")],
              ] as const
            ).map(([mode, title, note]) => (
              <label key={mode} className="flex items-start gap-2 text-[12px]">
                <input
                  type="radio"
                  name="new-plugin-auth-mode"
                  className="mt-0.5"
                  checked={draft.authMode === mode}
                  onChange={() => {
                    update("authMode", mode);
                    if (mode === "api_key") toggleOAuth(false);
                  }}
                />
                <span>
                  <span className="font-medium text-ink">{title}</span>
                  <span className="mt-1 block leading-5 text-ink-muted">{note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {draft.authMode === "api_key" ? null : (
        <div className="rounded-lg border border-hairline bg-surface-2/50 px-3 py-3">          <label className="flex items-start gap-2 text-[12px]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={withOAuth}
              onChange={(event) => toggleOAuth(event.target.checked)}
            />
            <span>
              <span className="font-medium text-ink">{t("oauth.checkboxTitle")}</span>
              <span className="mt-1 block leading-5 text-ink-muted">{t("oauth.checkboxBody")}</span>
            </span>
          </label>

          {withOAuth ? (
            <div className="mt-3 grid gap-4 border-t border-hairline/60 pt-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <DraftField
                  label={t("oauth.clientId.label")}
                  htmlFor="new-plugin-client-id"
                  error={errorFor("clientId")}
                >
                  <Input
                    id="new-plugin-client-id"
                    autoComplete="off"
                    className="font-mono text-[12px]"
                    {...bind("clientId")}
                  />
                </DraftField>
              </div>
              <div className="md:col-span-2">
                <DraftField
                  label={t("oauth.clientSecret.label")}
                  htmlFor="new-plugin-client-secret"
                  hint={t("oauth.clientSecret.hint")}
                >
                  <Input
                    id="new-plugin-client-secret"
                    type="password"
                    autoComplete="new-password"
                    className="font-mono text-[12px]"
                    {...bind("clientSecret")}
                  />
                </DraftField>
              </div>
              <DraftField
                label={t("oauth.authorizationEndpoint.label")}
                htmlFor="new-plugin-authorization-endpoint"
                error={errorFor("authorizationEndpoint")}
                hint={t("oauth.authorizationEndpoint.hint")}
              >
                <Input
                  id="new-plugin-authorization-endpoint"
                  className="font-mono text-[12px]"
                  {...bind("authorizationEndpoint")}
                />
              </DraftField>
              <DraftField
                label={t("oauth.tokenEndpoint.label")}
                htmlFor="new-plugin-token-endpoint"
                error={errorFor("tokenEndpoint")}
                hint={t("oauth.tokenEndpoint.hint")}
              >
                <Input
                  id="new-plugin-token-endpoint"
                  className="font-mono text-[12px]"
                  {...bind("tokenEndpoint")}
                />
              </DraftField>
              <div className="md:col-span-2">
                <DraftField
                  label={t("oauth.revokeEndpoint.label")}
                  htmlFor="new-plugin-revoke-endpoint"
                  error={errorFor("revokeEndpoint")}
                  hint={t("oauth.revokeEndpoint.hint")}
                >
                  <Input
                    id="new-plugin-revoke-endpoint"
                    className="font-mono text-[12px]"
                    {...bind("revokeEndpoint")}
                  />
                </DraftField>
              </div>
            </div>
          ) : null}
        </div>
        )}

        {!catalogLoaded ? (
          <p className="text-[11px] leading-5 text-ink-muted">{t("catalogNotLoadedNote")}</p>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={mutation.isPending}>
            {mutation.isPending ? t("adding") : t("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatalogRow({ row }: { row: AdminPluginCatalogListItemDto }) {
  const t = useTranslations("adminPlugins.list");
  const cannotConnect = catalogRowCannotConnect(row);
  const workspaceCount =
    typeof row.workspaceCount === "number" && Number.isFinite(row.workspaceCount)
      ? t("workspaceCount", { count: row.workspaceCount })
      : "—";

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
        <span className="flex min-w-0 flex-1 items-center gap-3">
          {/* The same glyph, from the same source, as every member and Owner surface. */}
          <PluginGlyph plugin={row} size="sm" />
          <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-ink">{row.label}</span>
            {cannotConnect ? (
              <Pill tone="warning" title={t("missingClientIdExplanation")}>
                <Warning size={11} weight="fill" />
                {t("noClientIdBadge")}
              </Pill>
            ) : null}
            {row.isFeatured ? <Pill tone="muted">{t("featuredBadge")}</Pill> : null}
          </span>
          <span className="truncate font-mono text-[11px] text-ink-subtle">{row.pluginKey}</span>
          </span>
        </span>
        <span className="w-[70px] shrink-0 text-[12px] text-ink-muted">
          {t(row.kind === "native" ? "kindLabels.native" : "kindLabels.mcp")}
        </span>
        <span className="w-[110px] shrink-0 truncate text-[12px] text-ink-muted">
          {row.provider}
        </span>
        <span className="w-[90px] shrink-0">
          {row.isActive ? (
            <Pill tone="positive">{t("state.active")}</Pill>
          ) : (
            <Pill tone="muted">{t("state.retired")}</Pill>
          )}
        </span>
        <span className="w-[140px] shrink-0 text-[12px]">
          {row.kind === "native" ? (
            <span className="text-ink-subtle">{t("serverConfig")}</span>
          ) : (
            <span className={cn(cannotConnect ? "font-medium text-amber-600" : "text-ink-muted")}>
              {t(`oauthSourceLabels.${row.oAuthClientSource}`)}
            </span>
          )}
        </span>
        {/* Workspaces that have the plugin, by the server's own rule: a list that holds it, or a
            workspace that never edited its list and whose members already use it. */}
        <span
          className="w-[120px] shrink-0 text-[12px] tabular-nums text-ink-muted md:text-right"
          title={t("columns.workspaces")}
        >
          {workspaceCount}
        </span>
        <span className="w-[90px] shrink-0 text-[12px] tabular-nums text-ink-muted md:text-right">
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
