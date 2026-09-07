"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowsClockwise,
  Cardholder,
  ClockCounterClockwise,
  Key,
  Prohibit,
  Trash,
  Warning,
  WarningCircle,
  Wrench,
} from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPanel } from "@/components/admin/admin-page-chrome";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useAdminPluginAudits,
  useAdminPluginCatalogDetail,
  useDeleteAdminPlugin,
  useRediscoverAdminPlugin,
  useReplaceAdminPluginTools,
  useSetAdminPluginOAuthClient,
  useUpdateAdminPlugin,
} from "@/hooks/use-admin-plugin-catalog";
import {
  catalogOwnsOAuthClient,
  catalogRowCannotConnect,
  formatToolManifest,
  MISSING_CLIENT_ID_EXPLANATION,
  OAUTH_CLIENT_SOURCE_LABELS,
  OAUTH_CLIENT_SOURCE_NOTES,
  parseToolManifest,
  PLUGIN_KIND_LABELS,
  supportsRediscovery,
} from "@/lib/admin/plugin-catalog";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type {
  AdminPluginCatalogDetailDto,
  AdminPluginToolAuditEntryDto,
  UpdateAdminPluginRequest,
} from "@/types/admin-plugin-catalog";

const numberFormatter = new Intl.NumberFormat("en-US");
const AUDIT_PAGE_SIZE = 25;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

/**
 * This controller answers a refusal with `{ error, errorCode }` — `errorCode`, not the `code` that
 * `apiErrorCode` in lib/api/errors reads, because the two halves of the API disagree about the
 * field name. Read here rather than there so a shared helper is not quietly re-pointed under every
 * other caller in the app.
 */
function catalogErrorCode(error: unknown): string | undefined {
  const body = (error as { response?: { data?: { errorCode?: unknown } } })?.response?.data;
  return typeof body?.errorCode === "string" ? body.errorCode : undefined;
}

/**
 * What to tell the operator, with the server's own sentence kept whenever it has one.
 *
 * The service writes genuinely actionable messages — every invalid field at once, or the exact
 * installation and connection counts blocking a delete — so the job here is to pass those through,
 * not to replace them with a tidier sentence that says less. The fallback only covers a failure
 * that arrived with no body at all.
 */
function failureMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback);
}

/** A toast on every failure. Silence here is the exact defect this page was asked not to repeat. */
function reportFailure(error: unknown, fallback: string) {
  toast.error(failureMessage(error, fallback));
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[12px]">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[11px] leading-5 text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  note?: React.ReactNode;
}) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        {icon}
        {title}
      </h2>
      {note ? <span className="text-[11px] text-ink-muted">{note}</span> : null}
    </div>
  );
}

export default function AdminPluginDetailPage() {
  const params = useParams();
  const router = useRouter();

  const rawKey = typeof params?.pluginKey === "string" ? params.pluginKey : "";
  const pluginKey = useMemo(() => {
    try {
      return decodeURIComponent(rawKey);
    } catch {
      // A key that will not decode is still a key the server can refuse by name. Passing the raw
      // segment on gets a readable 404 instead of a blank page from a thrown URIError.
      return rawKey;
    }
  }, [rawKey]);

  const detailQuery = useAdminPluginCatalogDetail(pluginKey || undefined);
  const rediscoverMutation = useRediscoverAdminPlugin(pluginKey);
  const activationMutation = useUpdateAdminPlugin(pluginKey);

  const [auditPage, setAuditPage] = useState(1);
  const [auditOutcome, setAuditOutcome] = useState("");
  const auditQueryArgs = useMemo(
    () => ({
      page: auditPage,
      pageSize: AUDIT_PAGE_SIZE,
      outcome: auditOutcome.trim().length > 0 ? auditOutcome.trim() : undefined,
    }),
    [auditPage, auditOutcome],
  );
  const auditsQuery = useAdminPluginAudits(pluginKey || undefined, auditQueryArgs);

  const detail = detailQuery.data;

  if (detailQuery.isPending) {
    return (
      <AdminPage>
        <div className="space-y-4 py-4" aria-busy="true">
          <div className="h-8 w-64 animate-pulse rounded bg-surface-2" />
          <div className="h-40 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-40 animate-pulse rounded-lg bg-surface-2" />
        </div>
      </AdminPage>
    );
  }

  if (detailQuery.isError || !detail) {
    const notFound =
      (detailQuery.error as { response?: { status?: number } })?.response?.status === 404
      || catalogErrorCode(detailQuery.error) === "unknown_plugin";
    return (
      <AdminPage>
        <div className="mx-auto max-w-lg rounded-2xl border border-hairline bg-surface-1 p-8 text-center shadow-linear">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <WarningCircle size={22} weight="duotone" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-ink">
            {notFound ? "No such plugin" : "This plugin could not be loaded"}
          </h1>
          <p className="mt-2 text-[13px] text-ink-muted">
            {notFound ? (
              <>
                Nothing in the catalog is keyed{" "}
                <span className="font-mono">{pluginKey}</span>. It may have been hard-deleted.
              </>
            ) : (
              failureMessage(detailQuery.error, "The assistant service did not answer.")
            )}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void detailQuery.refetch()}>
              Try again
            </Button>
            <Link
              href="/admin/plugins"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Back to the catalog
            </Link>
          </div>
        </div>
      </AdminPage>
    );
  }

  const cannotConnect = catalogRowCannotConnect(detail);
  const audits = auditsQuery.data;
  const auditTotalPages = audits ? Math.max(1, Math.ceil(audits.totalCount / audits.pageSize)) : 1;

  const setActive = async (next: boolean) => {
    try {
      await activationMutation.mutateAsync({ isActive: next });
      toast.success(next ? "Plugin activated." : "Plugin retired.");
    } catch (error) {
      reportFailure(
        error,
        next ? "Could not activate the plugin." : "Could not retire the plugin.",
      );
    }
  };

  const rediscover = async () => {
    try {
      await rediscoverMutation.mutateAsync();
      toast.success("Discovery cleared. The registration ladder runs again on the next connect.");
    } catch (error) {
      reportFailure(error, "Could not clear discovery for this plugin.");
    }
  };

  return (
    <AdminPage>
      <Link
        href="/admin/plugins"
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={13} />
        Plugin catalog
      </Link>

      <header className="mt-3 flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[30px] font-semibold leading-none tracking-tight">
              {detail.label}
            </h1>
            {detail.isActive ? (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                active
              </span>
            ) : (
              <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                retired
              </span>
            )}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
            <span className="font-mono">{detail.pluginKey}</span>
            <span>{PLUGIN_KIND_LABELS[detail.kind] ?? detail.kind}</span>
            <span>provider {detail.provider}</span>
            <span>
              {numberFormatter.format(detail.installationCount)} install
              {detail.installationCount === 1 ? "" : "s"}
            </span>
            <span>
              {numberFormatter.format(detail.connectionCount)} connection
              {detail.connectionCount === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void detailQuery.refetch()}
            disabled={detailQuery.isFetching}
          >
            <ArrowsClockwise size={14} className={cn(detailQuery.isFetching && "animate-spin")} />
            Refresh
          </Button>
          {supportsRediscovery(detail.kind) ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void rediscover()}
              disabled={rediscoverMutation.isPending}
            >
              <ClockCounterClockwise size={14} />
              {rediscoverMutation.isPending ? "Clearing…" : "Re-run discovery"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void setActive(!detail.isActive)}
            disabled={activationMutation.isPending}
          >
            {detail.isActive ? <Prohibit size={14} /> : null}
            {detail.isActive ? "Retire" : "Activate"}
          </Button>
        </div>
      </header>

      {cannotConnect ? (
        <AdminPanel className="mt-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3 px-4 py-3 text-[13px]">
            <Warning size={16} weight="duotone" className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">This row cannot complete an OAuth connect.</p>
              <p className="mt-1 text-ink-muted">{MISSING_CLIENT_ID_EXPLANATION}</p>
            </div>
          </div>
        </AdminPanel>
      ) : null}

      <MetadataSection key={`meta-${detail.pluginKey}`} detail={detail} />
      <OAuthSection key={`oauth-${detail.pluginKey}`} detail={detail} />
      <ToolsSection key={`tools-${detail.pluginKey}`} detail={detail} />

      <SectionHeading
        icon={<ClockCounterClockwise size={14} weight="duotone" />}
        title="Tool calls"
        note={
          audits ? `${numberFormatter.format(audits.totalCount)} recorded` : undefined
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={auditOutcome}
          onChange={(event) => {
            setAuditOutcome(event.target.value);
            setAuditPage(1);
          }}
          placeholder="Filter by outcome, e.g. ok or missing_scope"
          aria-label="Filter recorded tool calls by outcome"
          className="max-w-xs"
        />
        {auditsQuery.isFetching ? (
          <span className="text-[11px] text-ink-muted">Loading…</span>
        ) : null}
      </div>
      <AdminPanel>
        {auditsQuery.isError ? (
          <div className="flex items-start gap-3 px-4 py-8 text-sm">
            <WarningCircle
              size={18}
              weight="duotone"
              className="mt-0.5 shrink-0 text-destructive"
            />
            <div>
              <p className="font-medium">The tool-call record could not be loaded.</p>
              <p className="mt-1 text-ink-muted">
                {failureMessage(auditsQuery.error, "The assistant service did not answer.")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void auditsQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          </div>
        ) : auditsQuery.isPending ? (
          <ul aria-busy="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <li key={index} className="border-b border-hairline/60 px-4 py-3 last:border-b-0">
                <div className="h-3 w-64 animate-pulse rounded bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : !audits || audits.items.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-ink-muted">
            {auditOutcome.trim().length > 0
              ? "No recorded call matches that outcome."
              : "Nothing has called a tool on this plugin yet."}
          </p>
        ) : (
          <ul>
            {audits.items.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </AdminPanel>
      {audits && audits.totalCount > audits.pageSize ? (
        <div className="mt-3 flex items-center justify-between text-[12px] text-ink-muted">
          <span>
            Page {audits.page} of {auditTotalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={audits.page <= 1}
              onClick={() => setAuditPage((page) => Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={audits.page >= auditTotalPages}
              onClick={() => setAuditPage((page) => page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <DangerSection
        key={`danger-${detail.pluginKey}`}
        detail={detail}
        onHardDeleted={() => router.push("/admin/plugins")}
      />

      <p className="mt-6 text-[12px] text-ink-muted">
        Edits are stamped with the account that made them.{" "}
        {detail.updatedBy ? (
          <>
            Last written by <span className="font-mono">{detail.updatedBy}</span> on{" "}
            {formatDateTime(detail.updatedAt)}.
          </>
        ) : (
          <>
            This row has no recorded editor — it was last written by a migration, or by a token
            carrying no usable subject. Created {formatDateTime(detail.createdAt)}.
          </>
        )}
      </p>
    </AdminPage>
  );
}

// ── Metadata ─────────────────────────────────────────────────────────────────

function MetadataSection({ detail }: { detail: AdminPluginCatalogDetailDto }) {
  const mutation = useUpdateAdminPlugin(detail.pluginKey);

  const [label, setLabel] = useState(detail.label);
  const [description, setDescription] = useState(detail.description);
  const [avatarUrl, setAvatarUrl] = useState(detail.avatarUrl ?? "");
  const [mcpServerUrl, setMcpServerUrl] = useState(detail.mcpServerUrl ?? "");
  const [category, setCategory] = useState(detail.category ?? "");
  const [sortOrder, setSortOrder] = useState(String(detail.sortOrder));
  const [scopes, setScopes] = useState(detail.requiredScopes.join("\n"));
  const [isFeatured, setIsFeatured] = useState(detail.isFeatured);

  const scopeList = useMemo(
    () =>
      scopes
        .split(/[\n,]/)
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0),
    [scopes],
  );

  /**
   * PATCH means "only what is here changes", so only what actually changed is sent. Sending the
   * whole form would put `mcpServerUrl` on a native row — which the server rejects outright — and
   * would rewrite fields another operator had changed in the meantime for no reason.
   */
  const changes = useMemo(() => {
    const next: UpdateAdminPluginRequest = {};
    if (label.trim() !== detail.label) next.label = label.trim();
    if (description.trim() !== detail.description) next.description = description.trim();
    if (avatarUrl.trim() !== (detail.avatarUrl ?? "")) next.avatarUrl = avatarUrl.trim();
    if (detail.kind === "mcp" && mcpServerUrl.trim() !== (detail.mcpServerUrl ?? "")) {
      next.mcpServerUrl = mcpServerUrl.trim();
    }
    if (category.trim() !== (detail.category ?? "")) next.category = category.trim();
    const parsedSortOrder = Number.parseInt(sortOrder, 10);
    if (Number.isFinite(parsedSortOrder) && parsedSortOrder !== detail.sortOrder) {
      next.sortOrder = parsedSortOrder;
    }
    if (scopeList.join(",") !== detail.requiredScopes.join(",")) {
      next.requiredScopes = scopeList;
    }
    if (isFeatured !== detail.isFeatured) next.isFeatured = isFeatured;
    return next;
  }, [
    avatarUrl,
    category,
    description,
    detail,
    isFeatured,
    label,
    mcpServerUrl,
    scopeList,
    sortOrder,
  ]);

  const changeCount = Object.keys(changes).length;
  const sortOrderIsNumber = Number.isFinite(Number.parseInt(sortOrder, 10));

  const submit = async () => {
    if (changeCount === 0) return;
    try {
      const saved = await mutation.mutateAsync(changes);
      // Re-seeded from the response rather than left as typed: the server trims, de-duplicates
      // scopes and can normalise a value, and a form still showing what was typed would hide that.
      setLabel(saved.label);
      setDescription(saved.description);
      setAvatarUrl(saved.avatarUrl ?? "");
      setMcpServerUrl(saved.mcpServerUrl ?? "");
      setCategory(saved.category ?? "");
      setSortOrder(String(saved.sortOrder));
      setScopes(saved.requiredScopes.join("\n"));
      setIsFeatured(saved.isFeatured);
      toast.success("Plugin updated.");
    } catch (error) {
      reportFailure(error, "Could not save the plugin.");
    }
  };

  return (
    <>
      <SectionHeading
        icon={<Cardholder size={14} weight="duotone" />}
        title="Catalog entry"
        note={changeCount > 0 ? `${changeCount} unsaved change${changeCount === 1 ? "" : "s"}` : undefined}
      />
      <AdminPanel>
        <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
          <Field label="Label" htmlFor="plugin-label">
            <Input
              id="plugin-label"
              value={label}
              maxLength={150}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
          <Field
            label="Category"
            htmlFor="plugin-category"
            hint="Leave empty to clear it."
          >
            <Input
              id="plugin-category"
              value={category}
              maxLength={50}
              onChange={(event) => setCategory(event.target.value)}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Description" htmlFor="plugin-description">
              <Textarea
                id="plugin-description"
                value={description}
                maxLength={500}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Avatar URL"
            htmlFor="plugin-avatar"
            hint="An http(s) URL or a site-relative path beginning with /. Empty clears it."
          >
            <Input
              id="plugin-avatar"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
            />
          </Field>
          <Field
            label="Sort order"
            htmlFor="plugin-sort-order"
            hint="The curated order the catalog renders. Ties break on label."
          >
            <Input
              id="plugin-sort-order"
              value={sortOrder}
              inputMode="numeric"
              aria-invalid={!sortOrderIsNumber}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </Field>
          {detail.kind === "mcp" ? (
            <div className="md:col-span-2">
              <Field
                label="MCP server URL"
                htmlFor="plugin-mcp-url"
                hint="An absolute https:// URL. It cannot be cleared on an MCP row."
              >
                <Input
                  id="plugin-mcp-url"
                  value={mcpServerUrl}
                  onChange={(event) => setMcpServerUrl(event.target.value)}
                />
              </Field>
            </div>
          ) : (
            <div className="md:col-span-2">
              <p className="rounded-lg border border-hairline bg-surface-2/60 px-3 py-2 text-[12px] text-ink-muted">
                A native row is served by compiled-in code, which never reads an MCP server URL — so
                the field is not offered here. The server would refuse it anyway.
              </p>
            </div>
          )}
          <div className="md:col-span-2">
            <Field
              label="Required scopes"
              htmlFor="plugin-scopes"
              hint="One per line. Repeats are dropped by the server."
            >
              <Textarea
                id="plugin-scopes"
                value={scopes}
                rows={4}
                className="font-mono text-[12px]"
                onChange={(event) => setScopes(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch
              id="plugin-featured"
              checked={isFeatured}
              onCheckedChange={(checked: boolean) => setIsFeatured(checked)}
            />
            <Label htmlFor="plugin-featured" className="text-[12px]">
              Featured in the user-facing catalog
            </Label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-hairline/60 px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={changeCount === 0 || mutation.isPending}
            onClick={() => {
              setLabel(detail.label);
              setDescription(detail.description);
              setAvatarUrl(detail.avatarUrl ?? "");
              setMcpServerUrl(detail.mcpServerUrl ?? "");
              setCategory(detail.category ?? "");
              setSortOrder(String(detail.sortOrder));
              setScopes(detail.requiredScopes.join("\n"));
              setIsFeatured(detail.isFeatured);
            }}
          >
            Discard
          </Button>
          <Button size="sm" disabled={changeCount === 0 || mutation.isPending} onClick={() => void submit()}>
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </AdminPanel>
    </>
  );
}

// ── OAuth ────────────────────────────────────────────────────────────────────

/**
 * How the panel expresses the secret's tri-state without ever holding one.
 *
 * `keep` sends no `clientSecret` property at all, `clear` sends `""`, `replace` sends what was
 * typed. The default is `keep`, which is what stops the common case — rotating an id — from
 * wiping a secret merely because the field beneath it was left blank. It is also the only default
 * that could be honest: no endpoint hands a secret back, so there is nothing to pre-fill with and
 * nothing an operator could re-send even if asked to.
 */
type SecretMode = "keep" | "replace" | "clear";

function OAuthSection({ detail }: { detail: AdminPluginCatalogDetailDto }) {
  const mutation = useSetAdminPluginOAuthClient(detail.pluginKey);

  const [clientId, setClientId] = useState(detail.oAuthClientId ?? "");
  const [secretMode, setSecretMode] = useState<SecretMode>("keep");
  const [secret, setSecret] = useState("");
  const [authorizationEndpoint, setAuthorizationEndpoint] = useState(
    detail.oAuthAuthorizationEndpoint ?? "",
  );
  const [tokenEndpoint, setTokenEndpoint] = useState(detail.oAuthTokenEndpoint ?? "");
  const [revokeEndpoint, setRevokeEndpoint] = useState(detail.oAuthRevokeEndpoint ?? "");

  const catalogOwns = catalogOwnsOAuthClient(detail.kind);

  const submit = async () => {
    const trimmedId = clientId.trim();
    if (trimmedId.length === 0) {
      toast.error("A client id is required. Clearing one is not something this endpoint does.");
      return;
    }
    if (secretMode === "replace" && secret.length === 0) {
      toast.error("Type the new client secret, or choose to keep or clear the stored one.");
      return;
    }

    try {
      const saved = await mutation.mutateAsync({
        clientId: trimmedId,
        // Tri-state. `undefined` is stripped from the body before it is sent, so "keep" is a
        // genuinely absent property rather than a null the server would read the same way but a
        // reader of the request would not.
        clientSecret: secretMode === "replace" ? secret : secretMode === "clear" ? "" : undefined,
        authorizationEndpoint: authorizationEndpoint.trim() || undefined,
        tokenEndpoint: tokenEndpoint.trim() || undefined,
        revokeEndpoint: revokeEndpoint.trim() || undefined,
      });
      setClientId(saved.oAuthClientId ?? "");
      setAuthorizationEndpoint(saved.oAuthAuthorizationEndpoint ?? "");
      setTokenEndpoint(saved.oAuthTokenEndpoint ?? "");
      setRevokeEndpoint(saved.oAuthRevokeEndpoint ?? "");
      // Dropped the moment it has been sent. Nothing on this page keeps a secret alive in memory
      // longer than the request that carried it.
      setSecret("");
      setSecretMode("keep");
      toast.success(
        secretMode === "clear"
          ? "OAuth client saved and the stored secret cleared."
          : secretMode === "replace"
            ? "OAuth client and secret saved."
            : "OAuth client saved. The stored secret was left alone.",
      );
    } catch (error) {
      reportFailure(error, "Could not save the OAuth client.");
    }
  };

  return (
    <>
      <SectionHeading
        icon={<Key size={14} weight="duotone" />}
        title="OAuth client"
        note={OAUTH_CLIENT_SOURCE_LABELS[detail.oAuthClientSource] ?? detail.oAuthClientSource}
      />
      <AdminPanel>
        <div className="grid gap-3 border-b border-hairline/60 px-4 py-4 text-[12px] sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Client id</p>
            <p className="mt-1 break-all font-mono text-[12px] text-ink">
              {detail.oAuthClientId ?? "not set"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Client secret</p>
            {/* Never a value, never a mask of a value — the service does not return one in any
                form. The only two facts it exposes are that a secret exists and, to the precision
                the schema allows, when the row was last written. */}
            <p className="mt-1 text-[12px] text-ink">
              {detail.hasClientSecret ? (
                <>
                  <span className="font-mono">•••••••••</span>{" "}
                  <span className="text-ink-muted">
                    stored, row last written {formatDateTime(detail.credentialsUpdatedAt)}
                  </span>
                </>
              ) : (
                <span className="text-ink-muted">none stored — a public client</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Token endpoint auth</p>
            <p className="mt-1 font-mono text-[12px] text-ink">
              {detail.oAuthTokenEndpointAuthMethod ?? "not negotiated"}
            </p>
          </div>
        </div>

        <p className="border-b border-hairline/60 px-4 py-2.5 text-[11px] text-ink-muted">
          {OAUTH_CLIENT_SOURCE_NOTES[detail.oAuthClientSource] ?? ""}
          {detail.oAuthRegistrationEndpoint ? (
            <>
              {" "}
              Registration endpoint:{" "}
              <span className="font-mono">{detail.oAuthRegistrationEndpoint}</span>.
            </>
          ) : null}
        </p>

        {!catalogOwns ? (
          <div className="px-4 py-5 text-[13px]">
            <p className="font-medium text-ink">
              This plugin&rsquo;s OAuth client is not in the catalog.
            </p>
            <p className="mt-1.5 max-w-2xl text-[12px] leading-6 text-ink-muted">
              A <span className="font-mono">native</span> row is served by compiled-in code that
              reads its client id and secret from service configuration. The server refuses to write
              them here, and offering the form anyway would let someone chasing an empty{" "}
              <span className="font-mono">client_id</span> type one in, watch it save, and believe
              the problem fixed while nothing had changed. Set it in the environment the assistant
              service runs with instead.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field
                  label="Client id"
                  htmlFor="oauth-client-id"
                  hint="Saving marks this row pre-registered. A client id is public by construction — it travels in every authorization URL the browser follows."
                >
                  <Input
                    id="oauth-client-id"
                    value={clientId}
                    className="font-mono text-[12px]"
                    autoComplete="off"
                    onChange={(event) => setClientId(event.target.value)}
                  />
                </Field>
              </div>

              <div className="md:col-span-2 space-y-2">
                <p className="text-[12px] font-medium">Client secret</p>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 text-[12px] text-ink-muted">
                    <input
                      type="radio"
                      name="secret-mode"
                      value="keep"
                      checked={secretMode === "keep"}
                      onChange={() => setSecretMode("keep")}
                    />
                    {detail.hasClientSecret
                      ? "Keep the stored secret"
                      : "Leave it unset — this row has no secret"}
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-ink-muted">
                    <input
                      type="radio"
                      name="secret-mode"
                      value="replace"
                      checked={secretMode === "replace"}
                      onChange={() => setSecretMode("replace")}
                    />
                    {detail.hasClientSecret ? "Replace it" : "Set one"}
                  </label>
                  <label
                    className={cn(
                      "flex items-center gap-2 text-[12px] text-ink-muted",
                      !detail.hasClientSecret && "opacity-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="secret-mode"
                      value="clear"
                      disabled={!detail.hasClientSecret}
                      checked={secretMode === "clear"}
                      onChange={() => setSecretMode("clear")}
                    />
                    Clear the stored secret
                  </label>
                </div>
                {secretMode === "replace" ? (
                  <Input
                    id="oauth-client-secret"
                    type="password"
                    value={secret}
                    autoComplete="new-password"
                    placeholder="The new client secret"
                    aria-label="New client secret"
                    className="font-mono text-[12px]"
                    onChange={(event) => setSecret(event.target.value)}
                  />
                ) : null}
                <p className="text-[11px] leading-5 text-ink-muted">
                  A secret goes in and does not come back. Nothing on this screen can show you the
                  stored one, so &ldquo;keep&rdquo; is the default: rotating an id must not wipe a
                  secret merely because the field beneath it was blank.
                </p>
              </div>

              <Field
                label="Authorization endpoint"
                htmlFor="oauth-authorization-endpoint"
                hint="Optional. Blank leaves whatever discovery cached."
              >
                <Input
                  id="oauth-authorization-endpoint"
                  value={authorizationEndpoint}
                  className="font-mono text-[12px]"
                  onChange={(event) => setAuthorizationEndpoint(event.target.value)}
                />
              </Field>
              <Field label="Token endpoint" htmlFor="oauth-token-endpoint" hint="Optional.">
                <Input
                  id="oauth-token-endpoint"
                  value={tokenEndpoint}
                  className="font-mono text-[12px]"
                  onChange={(event) => setTokenEndpoint(event.target.value)}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Revoke endpoint" htmlFor="oauth-revoke-endpoint" hint="Optional.">
                  <Input
                    id="oauth-revoke-endpoint"
                    value={revokeEndpoint}
                    className="font-mono text-[12px]"
                    onChange={(event) => setRevokeEndpoint(event.target.value)}
                  />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-end border-t border-hairline/60 px-4 py-3">
              <Button size="sm" disabled={mutation.isPending} onClick={() => void submit()}>
                {mutation.isPending ? "Saving…" : "Save OAuth client"}
              </Button>
            </div>
          </>
        )}
      </AdminPanel>
    </>
  );
}

// ── Tools ────────────────────────────────────────────────────────────────────

function ToolsSection({ detail }: { detail: AdminPluginCatalogDetailDto }) {
  const mutation = useReplaceAdminPluginTools(detail.pluginKey);
  const stored = useMemo(() => formatToolManifest(detail.tools), [detail.tools]);
  const [manifest, setManifest] = useState(stored);
  const [errors, setErrors] = useState<string[]>([]);

  const dirty = manifest !== stored;

  const validate = (): boolean => {
    const result = parseToolManifest(manifest);
    setErrors(result.ok ? [] : result.errors);
    if (result.ok) toast.success("The manifest is valid.");
    return result.ok;
  };

  const submit = async () => {
    const result = parseToolManifest(manifest);
    if (!result.ok) {
      setErrors(result.errors);
      // Checked here as well as on the server because PUT replaces the manifest wholesale: one bad
      // entry would otherwise cost a round trip to learn about, and there is no partial success to
      // fall back on.
      toast.error(
        `The manifest has ${result.errors.length} problem${result.errors.length === 1 ? "" : "s"}. Nothing was sent.`,
      );
      return;
    }

    setErrors([]);
    try {
      const saved = await mutation.mutateAsync({ tools: result.tools });
      setManifest(formatToolManifest(saved.tools));
      toast.success(
        saved.tools.length === 0
          ? "Manifest replaced. This plugin now advertises no tools."
          : `Manifest replaced — ${saved.tools.length} tool${saved.tools.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      const code = catalogErrorCode(error);
      if (code === "invalid_tool_manifest") {
        setErrors([failureMessage(error, "The server rejected the manifest.")]);
      }
      reportFailure(error, "Could not replace the tool manifest.");
    }
  };

  return (
    <>
      <SectionHeading
        icon={<Wrench size={14} weight="duotone" />}
        title="Tool manifest"
        note={
          detail.toolsSyncedAt
            ? `last read from the server ${formatDateTime(detail.toolsSyncedAt)}`
            : "hand-authored — never confirmed by a tools/list"
        }
      />
      <AdminPanel>
        <div className="px-4 py-4">
          <p className="mb-2 text-[11px] leading-5 text-ink-muted">
            The whole manifest, replaced in one write. <span className="font-mono">pluginKey</span>{" "}
            is stamped from the route and must not appear here. Saving clears the{" "}
            <span className="font-mono">tools_synced_at</span> marker, because a hand edit is not a
            successful <span className="font-mono">tools/list</span> and should not look like one.
          </p>
          <Textarea
            value={manifest}
            rows={16}
            spellCheck={false}
            aria-label="Tool manifest JSON"
            aria-invalid={errors.length > 0}
            className="font-mono text-[12px] leading-5"
            onChange={(event) => {
              setManifest(event.target.value);
              if (errors.length > 0) setErrors([]);
            }}
          />
          {errors.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-hairline/60 px-4 py-3">
          <span className="text-[11px] text-ink-muted">
            {detail.tools.length} tool{detail.tools.length === 1 ? "" : "s"} stored
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!dirty || mutation.isPending}
              onClick={() => {
                setManifest(stored);
                setErrors([]);
              }}
            >
              Discard
            </Button>
            <Button variant="outline" size="sm" onClick={() => validate()}>
              Validate
            </Button>
            <Button size="sm" disabled={mutation.isPending} onClick={() => void submit()}>
              {mutation.isPending ? "Replacing…" : "Replace manifest"}
            </Button>
          </div>
        </div>
      </AdminPanel>
    </>
  );
}

// ── Audit row ────────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AdminPluginToolAuditEntryDto }) {
  const ok = entry.resultStatus === "ok";
  return (
    <li className="border-b border-hairline/60 px-4 py-2.5 text-[12px] last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[12px] text-ink">{entry.toolName}</span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            ok
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/25 bg-destructive/10 text-destructive",
          )}
        >
          {entry.resultStatus}
        </span>
        <span className="text-ink-muted">{formatDateTime(entry.createdAt)}</span>
        <span className="font-mono text-[11px] text-ink-subtle">{entry.userId}</span>
      </div>
      {entry.inputSummary ? (
        <p className="mt-1 line-clamp-2 break-words font-mono text-[11px] text-ink-muted">
          {entry.inputSummary}
        </p>
      ) : null}
    </li>
  );
}

// ── Delete ───────────────────────────────────────────────────────────────────

function DangerSection({
  detail,
  onHardDeleted,
}: {
  detail: AdminPluginCatalogDetailDto;
  onHardDeleted: () => void;
}) {
  const mutation = useDeleteAdminPlugin(detail.pluginKey);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const referenced = detail.installationCount > 0 || detail.connectionCount > 0;

  const hardDelete = async () => {
    try {
      const result = await mutation.mutateAsync(true);
      setConfirmOpen(false);
      if (result.hardDeleted) {
        toast.success(`${detail.pluginKey} was deleted.`);
        onHardDeleted();
      } else {
        // The server answers a soft delete the same way; saying so is better than claiming a
        // deletion that did not happen.
        toast.success(`${detail.pluginKey} was retired rather than deleted.`);
      }
    } catch (error) {
      reportFailure(
        error,
        catalogErrorCode(error) === "plugin_in_use"
          ? "This plugin is still referenced and cannot be hard-deleted."
          : "Could not delete the plugin.",
      );
    }
  };

  return (
    <>
      <SectionHeading icon={<Trash size={14} weight="duotone" />} title="Delete" />
      <AdminPanel className="border-destructive/25">
        <div className="flex flex-col gap-3 px-4 py-4 text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="font-medium">Remove this row from the catalog entirely.</p>
            <p className="mt-1 text-[12px] leading-5 text-ink-muted">
              {referenced ? (
                <>
                  Refused while anything references it — {numberFormatter.format(detail.installationCount)}{" "}
                  installation{detail.installationCount === 1 ? "" : "s"} and{" "}
                  {numberFormatter.format(detail.connectionCount)} connection
                  {detail.connectionCount === 1 ? "" : "s"} still do. Retire it instead: a retired
                  row is hidden from every catalog while those references stay intact.
                </>
              ) : (
                <>
                  Nothing references this row, so it can be deleted outright. Retiring it is still
                  the reversible option.
                </>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={referenced || mutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash size={14} />
            Delete permanently
          </Button>
        </div>
      </AdminPanel>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next: boolean) => (mutation.isPending ? undefined : setConfirmOpen(next))}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete {detail.label}?</DialogTitle>
            <DialogDescription>
              <span className="font-mono text-ink">{detail.pluginKey}</span> will be removed from
              the catalog along with its tool manifest and any stored OAuth client. Its recorded
              tool calls are not deleted. This cannot be undone from this screen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={mutation.isPending}
              onClick={() => void hardDelete()}
            >
              {mutation.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
