"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  CaretRight,
  MagnifyingGlass,
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
import { useAdminPluginCatalog, useCreateAdminPlugin } from "@/hooks/use-admin-plugin-catalog";
import {
  catalogRowCannotConnect,
  EMPTY_NEW_PLUGIN_DRAFT,
  MISSING_CLIENT_ID_EXPLANATION,
  OAUTH_CLIENT_SOURCE_LABELS,
  PLUGIN_KIND_LABELS,
  RESERVED_PLUGIN_KEYS,
  toCreatePluginRequest,
  validateNewPlugin,
  type NewPluginDraft,
} from "@/lib/admin/plugin-catalog";
import { getErrorMessage } from "@/lib/api/errors";
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
  const [createOpen, setCreateOpen] = useState(false);

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
        description="Every row WarpBot offers, retired ones included. This is the whole life of a catalog row — add one, edit it, re-credential it, replace its tools, retire it — which until now meant SQL against a running database."
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
              Refresh
            </Button>
            {/* The action the whole "the catalog is data, not code" claim rests on. Without it the
                screen could edit, re-credential and retire a row it had no way to create, and
                adding an MCP app went back to being SQL against a running database. */}
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              Add MCP app
            </Button>
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
      toast.error(
        `${problemCount} field${problemCount === 1 ? "" : "s"} still ${problemCount === 1 ? "needs" : "need"} fixing. Nothing was sent.`,
      );
      return;
    }

    try {
      const created = await mutation.mutateAsync(toCreatePluginRequest(draft));
      onOpenChange(false);
      resetDraft();
      toast.success(
        `${created.key} added to the catalog. It is live for every user immediately — no deploy.`,
      );
      // To the new row rather than back to the list: a fresh row has no tools and no client yet,
      // and its own page is where both are dealt with.
      router.push(`/admin/plugins/${encodeURIComponent(created.key)}`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not add the plugin to the catalog."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add an MCP app</DialogTitle>
          <DialogDescription>
            The row appears in every user&rsquo;s plugin list as soon as it is saved — no deploy and
            no restart. It is created as an MCP row that takes its key as its OAuth provider, with
            no tools: those arrive from the server&rsquo;s own{" "}
            <span className="font-mono">tools/list</span> on the first connect, and can be written
            by hand from the row&rsquo;s page.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <DraftField
            label="Plugin key"
            htmlFor="new-plugin-key"
            error={errorFor("pluginKey")}
            hint={
              <>
                Lower-case, and permanent: it is this row&rsquo;s URL and its OAuth provider name.
                Reserved: <span className="font-mono">{RESERVED_PLUGIN_KEYS.join(", ")}</span>.
              </>
            }
          >
            <Input
              id="new-plugin-key"
              placeholder="linear"
              maxLength={100}
              className="font-mono text-[12px]"
              {...bind("pluginKey")}
            />
          </DraftField>

          <DraftField label="Label" htmlFor="new-plugin-label" error={errorFor("label")}>
            <Input id="new-plugin-label" placeholder="Linear" maxLength={150} {...bind("label")} />
          </DraftField>

          <div className="md:col-span-2">
            <DraftField
              label="Description"
              htmlFor="new-plugin-description"
              error={errorFor("description")}
              hint="What a user reads in the catalog before installing it."
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
              label="MCP server URL"
              htmlFor="new-plugin-server-url"
              error={errorFor("mcpServerUrl")}
              hint="Absolute https://. The tokens this row carries travel over it, so http is refused — on localhost too."
            >
              <Input
                id="new-plugin-server-url"
                placeholder="https://mcp.example.com/sse"
                className="font-mono text-[12px]"
                {...bind("mcpServerUrl")}
              />
            </DraftField>
          </div>

          <DraftField
            label="Avatar URL"
            htmlFor="new-plugin-avatar"
            error={errorFor("avatarUrl")}
            hint="Optional. An http(s) URL or a site-relative path."
          >
            <Input id="new-plugin-avatar" {...bind("avatarUrl")} />
          </DraftField>

          <DraftField
            label="Required scopes"
            htmlFor="new-plugin-scopes"
            hint="Optional, one per line. Most MCP servers advertise their own on connect."
          >
            <Textarea
              id="new-plugin-scopes"
              rows={2}
              className="font-mono text-[12px]"
              {...bind("requiredScopes")}
            />
          </DraftField>
        </div>

        <div className="rounded-lg border border-hairline bg-surface-2/50 px-3 py-3">
          <label className="flex items-start gap-2 text-[12px]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={withOAuth}
              onChange={(event) => toggleOAuth(event.target.checked)}
            />
            <span>
              <span className="font-medium text-ink">
                This server needs a hand-registered OAuth client
              </span>
              <span className="mt-1 block leading-5 text-ink-muted">
                Leave this off unless you know it does. The registration ladder runs on the first
                connect and picks Client ID Metadata Documents or dynamic registration on its own;
                supplying a client id here instead marks the row{" "}
                <span className="font-mono">preregistered</span>, which is the state that must
                always hold an id.
              </span>
            </span>
          </label>

          {withOAuth ? (
            <div className="mt-3 grid gap-4 border-t border-hairline/60 pt-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <DraftField
                  label="Client id"
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
                  label="Client secret"
                  htmlFor="new-plugin-client-secret"
                  hint="Optional — leave blank for a public client. It goes in and does not come back: no endpoint ever returns it, and it can only be replaced or cleared from the row's page afterwards."
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
                label="Authorization endpoint"
                htmlFor="new-plugin-authorization-endpoint"
                error={errorFor("authorizationEndpoint")}
                hint="Optional. Blank lets discovery find it."
              >
                <Input
                  id="new-plugin-authorization-endpoint"
                  className="font-mono text-[12px]"
                  {...bind("authorizationEndpoint")}
                />
              </DraftField>
              <DraftField
                label="Token endpoint"
                htmlFor="new-plugin-token-endpoint"
                error={errorFor("tokenEndpoint")}
                hint="Optional."
              >
                <Input
                  id="new-plugin-token-endpoint"
                  className="font-mono text-[12px]"
                  {...bind("tokenEndpoint")}
                />
              </DraftField>
              <div className="md:col-span-2">
                <DraftField
                  label="Revoke endpoint"
                  htmlFor="new-plugin-revoke-endpoint"
                  error={errorFor("revokeEndpoint")}
                  hint="Optional."
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

        {!catalogLoaded ? (
          <p className="text-[11px] leading-5 text-ink-muted">
            The catalog has not loaded, so a key already taken by another row cannot be caught here
            — the server will still refuse it.
          </p>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add to catalog"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
