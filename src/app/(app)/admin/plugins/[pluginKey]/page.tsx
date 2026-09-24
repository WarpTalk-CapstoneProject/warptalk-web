"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  describePluginToolOutcome,
  formatToolManifest,
  parseScopeList,
  parseToolManifest,
  supportsRediscovery,
} from "@/lib/admin/plugin-catalog";
import type { PluginToolOutcome, PluginToolOutcomeTone } from "@/lib/admin/plugin-catalog";
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

/**
 * One editable field, seeded from the loaded row and kept following it until somebody types.
 *
 * `useState(detail.oAuthTokenEndpoint ?? "")` reads its argument once. That is why "Re-run
 * discovery" used to leave these boxes holding the endpoints from before discovery ran while the
 * read-only summary directly above them showed the ones discovery had just found — and why
 * pressing "Save OAuth client" then wrote the stale values back over them. The sections are
 * mounted for the life of the row, and `useCatalogWrite` re-seeds the detail cache in place, so
 * nothing ever re-ran the initialiser.
 *
 * THE TRADE-OFF, since there are only two honest options. Remounting the section on every re-seed
 * makes the fields correct and deletes whatever the operator was halfway through typing. Leaving
 * them alone keeps the typing and lets a save write values the row no longer holds. So the choice
 * is made per field instead of per section: a field nobody has touched adopts the new server
 * value, and a field somebody has edited keeps their text and reports itself `dirty`, which is
 * what the section renders its unsaved-changes note and its Discard button from. Nothing is thrown
 * away silently, and nothing goes quietly stale either.
 *
 * The identity case is still handled by a `key` on the section: routing from one plugin to another
 * is a different subject, not a fresher version of this one, and edits must not follow.
 */
function useSeededField<T>(serverValue: T) {
  // The state is the EDIT, not the value — which is what makes the untouched case free: with no
  // edit there is no copy of the row to go stale, so the field simply renders whatever the row
  // currently holds. An edit remembers what the row held when it was made, so "has this operator
  // diverged from the row" is answerable without a second effect or a render-phase setState.
  const [edit, setEdit] = useState<{ base: T; value: T } | null>(null);

  const diverged = edit !== null && edit.value !== edit.base;
  const value = diverged ? edit.value : serverValue;

  return {
    value,
    set: (next: T) => setEdit({ base: serverValue, value: next }),
    dirty: value !== serverValue,
    /**
     * Back to following the row. Used for Discard AND after a successful save: the write re-seeds
     * the detail cache with the row the server actually stored, so dropping the edit is how the
     * form comes to show the server's trimming and de-duplication rather than what was typed.
     */
    reset: () => setEdit(null),
  };
}

export default function AdminPluginDetailPage() {
  const t = useTranslations("adminPlugins.detail");
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

  // `pluginKey &&` matters: with no key the query is disabled, and a disabled query is pending
  // forever — which would render a skeleton that never resolves instead of saying anything.
  if (pluginKey && detailQuery.isPending) {
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
            {notFound ? t("notFound.title") : t("loadError.title")}
          </h1>
          <p className="mt-2 text-[13px] text-ink-muted">
            {notFound ? (
              t("notFound.body", { key: pluginKey })
            ) : (
              failureMessage(detailQuery.error, t("loadError.fallback"))
            )}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void detailQuery.refetch()}>
              {t("tryAgain")}
            </Button>
            <Link
              href="/admin/plugins"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              {t("backToCatalog")}
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
      toast.success(next ? t("toast.activated") : t("toast.retired"));
    } catch (error) {
      reportFailure(error, next ? t("toast.activateFail") : t("toast.retireFail"));
    }
  };

  const rediscover = async () => {
    try {
      await rediscoverMutation.mutateAsync();
      toast.success(t("toast.rediscoverSuccess"));
    } catch (error) {
      reportFailure(error, t("toast.rediscoverFail"));
    }
  };

  return (
    <AdminPage>
      <Link
        href="/admin/plugins"
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={13} />
        {t("backLink")}
      </Link>

      <header className="mt-3 flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[30px] font-semibold leading-none tracking-tight">
              {detail.label}
            </h1>
            {detail.isActive ? (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                {t("state.active")}
              </span>
            ) : (
              <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                {t("state.retired")}
              </span>
            )}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
            <span className="font-mono">{detail.pluginKey}</span>
            <span>{t(detail.kind === "native" ? "kindLabels.native" : "kindLabels.mcp")}</span>
            <span>{t("providerLabel", { provider: detail.provider })}</span>
            <span>{t("installsCount", { count: detail.installationCount })}</span>
            <span>{t("connectionsCount", { count: detail.connectionCount })}</span>
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
            {t("refresh")}
          </Button>
          {supportsRediscovery(detail.kind) ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void rediscover()}
              disabled={rediscoverMutation.isPending}
            >
              <ClockCounterClockwise size={14} />
              {rediscoverMutation.isPending ? t("clearing") : t("rediscover")}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void setActive(!detail.isActive)}
            disabled={activationMutation.isPending}
          >
            {detail.isActive ? <Prohibit size={14} /> : null}
            {detail.isActive ? t("retire") : t("activate")}
          </Button>
        </div>
      </header>

      {cannotConnect ? (
        <AdminPanel className="mt-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3 px-4 py-3 text-[13px]">
            <Warning size={16} weight="duotone" className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">{t("cannotConnectBanner.title")}</p>
              <p className="mt-1 text-ink-muted">{t("cannotConnectBanner.body")}</p>
            </div>
          </div>
        </AdminPanel>
      ) : null}

      {/* Keyed on the plugin key so routing to a DIFFERENT row starts these sections over — an
          edit to google_drive must not follow the operator to google_calendar. Freshness within
          one row is not this key's job and never was: the key never changes while the row is open,
          so a re-seeded detail was invisible to fields initialised with useState. That is what
          useSeededField above handles, per field. */}
      <MetadataSection key={`meta-${detail.pluginKey}`} detail={detail} />
      {detail.kind === "mcp" ? <AuthModeSection key={`auth-${detail.pluginKey}`} detail={detail} /> : null}
      {detail.oAuthClientSource === "api_key" ? null : (
        <OAuthSection key={`oauth-${detail.pluginKey}`} detail={detail} />
      )}
      <ToolsSection key={`tools-${detail.pluginKey}`} detail={detail} />

      <SectionHeading
        icon={<ClockCounterClockwise size={14} weight="duotone" />}
        title={t("audits.heading")}
        note={
          audits ? t("audits.recordedCount", { count: numberFormatter.format(audits.totalCount) }) : undefined
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={auditOutcome}
          onChange={(event) => {
            setAuditOutcome(event.target.value);
            setAuditPage(1);
          }}
          placeholder={t("audits.filterPlaceholder")}
          aria-label={t("audits.filterAria")}
          className="max-w-xs"
        />
        {auditsQuery.isFetching ? (
          <span className="text-[11px] text-ink-muted">{t("audits.loading")}</span>
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
              <p className="font-medium">{t("audits.error.title")}</p>
              <p className="mt-1 text-ink-muted">
                {failureMessage(auditsQuery.error, t("loadError.fallback"))}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void auditsQuery.refetch()}
              >
                {t("audits.error.tryAgain")}
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
            {auditOutcome.trim().length > 0 ? t("audits.emptyFiltered") : t("audits.emptyAll")}
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
          <span>{t("audits.pageLabel", { page: audits.page, total: auditTotalPages })}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={audits.page <= 1}
              onClick={() => setAuditPage((page) => Math.max(1, page - 1))}
            >
              {t("audits.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={audits.page >= auditTotalPages}
              onClick={() => setAuditPage((page) => page + 1)}
            >
              {t("audits.next")}
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
        {t("footer.prefix")}{" "}
        {detail.updatedBy ? (
          t("footer.lastWrittenBy", { editor: detail.updatedBy, date: formatDateTime(detail.updatedAt) })
        ) : (
          t("footer.noRecordedEditor", { date: formatDateTime(detail.createdAt) })
        )}
      </p>
    </AdminPage>
  );
}

// ── Metadata ─────────────────────────────────────────────────────────────────

function MetadataSection({ detail }: { detail: AdminPluginCatalogDetailDto }) {
  const t = useTranslations("adminPlugins.detail.metadata");
  const mutation = useUpdateAdminPlugin(detail.pluginKey);

  const label = useSeededField(detail.label);
  const description = useSeededField(detail.description);
  const avatarUrl = useSeededField(detail.avatarUrl ?? "");
  const mcpServerUrl = useSeededField(detail.mcpServerUrl ?? "");
  const category = useSeededField(detail.category ?? "");
  const sortOrder = useSeededField(String(detail.sortOrder));
  const scopes = useSeededField(detail.requiredScopes.join("\n"));
  const isFeatured = useSeededField(detail.isFeatured);

  const scopeList = useMemo(() => parseScopeList(scopes.value), [scopes.value]);

  /**
   * PATCH means "only what is here changes", so only what actually changed is sent. Sending the
   * whole form would put `mcpServerUrl` on a native row — which the server rejects outright — and
   * would rewrite fields another operator had changed in the meantime for no reason.
   */
  const changes = useMemo(() => {
    const next: UpdateAdminPluginRequest = {};
    if (label.value.trim() !== detail.label) next.label = label.value.trim();
    if (description.value.trim() !== detail.description) {
      next.description = description.value.trim();
    }
    if (avatarUrl.value.trim() !== (detail.avatarUrl ?? "")) {
      next.avatarUrl = avatarUrl.value.trim();
    }
    if (detail.kind === "mcp" && mcpServerUrl.value.trim() !== (detail.mcpServerUrl ?? "")) {
      next.mcpServerUrl = mcpServerUrl.value.trim();
    }
    if (category.value.trim() !== (detail.category ?? "")) next.category = category.value.trim();
    const parsedSortOrder = Number.parseInt(sortOrder.value, 10);
    if (Number.isFinite(parsedSortOrder) && parsedSortOrder !== detail.sortOrder) {
      next.sortOrder = parsedSortOrder;
    }
    if (scopeList.join(",") !== detail.requiredScopes.join(",")) {
      next.requiredScopes = scopeList;
    }
    if (isFeatured.value !== detail.isFeatured) next.isFeatured = isFeatured.value;
    return next;
  }, [
    avatarUrl.value,
    category.value,
    description.value,
    detail,
    isFeatured.value,
    label.value,
    mcpServerUrl.value,
    scopeList,
    sortOrder.value,
  ]);

  const changeCount = Object.keys(changes).length;
  const sortOrderIsNumber = Number.isFinite(Number.parseInt(sortOrder.value, 10));

  /** Drops every edit so the form follows the loaded row again. Discard and save both want this. */
  const followRow = () => {
    label.reset();
    description.reset();
    avatarUrl.reset();
    mcpServerUrl.reset();
    category.reset();
    sortOrder.reset();
    scopes.reset();
    isFeatured.reset();
  };

  const submit = async () => {
    if (changeCount === 0) return;
    try {
      await mutation.mutateAsync(changes);
      // Every field goes back to following the row, which the write has just re-seeded from its
      // response. That is not the same as leaving the boxes as typed: the server trims, de-
      // duplicates scopes and can normalise a value, and a form still showing what was typed would
      // hide all three.
      followRow();
      toast.success(t("toast.updated"));
    } catch (error) {
      reportFailure(error, t("toast.saveFail"));
    }
  };

  return (
    <>
      <SectionHeading
        icon={<Cardholder size={14} weight="duotone" />}
        title={t("heading")}
        note={changeCount > 0 ? t("unsavedChanges", { count: changeCount }) : undefined}
      />
      <AdminPanel>
        <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
          <Field label={t("label")} htmlFor="plugin-label">
            <Input
              id="plugin-label"
              value={label.value}
              maxLength={150}
              onChange={(event) => label.set(event.target.value)}
            />
          </Field>
          <Field
            label={t("category.label")}
            htmlFor="plugin-category"
            hint={t("category.hint")}
          >
            <Input
              id="plugin-category"
              value={category.value}
              maxLength={50}
              onChange={(event) => category.set(event.target.value)}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label={t("description")} htmlFor="plugin-description">
              <Textarea
                id="plugin-description"
                value={description.value}
                maxLength={500}
                rows={3}
                onChange={(event) => description.set(event.target.value)}
              />
            </Field>
          </div>
          <Field
            label={t("avatarUrl.label")}
            htmlFor="plugin-avatar"
            hint={t("avatarUrl.hint")}
          >
            <Input
              id="plugin-avatar"
              value={avatarUrl.value}
              onChange={(event) => avatarUrl.set(event.target.value)}
            />
          </Field>
          <Field
            label={t("sortOrder.label")}
            htmlFor="plugin-sort-order"
            hint={t("sortOrder.hint")}
          >
            <Input
              id="plugin-sort-order"
              value={sortOrder.value}
              inputMode="numeric"
              aria-invalid={!sortOrderIsNumber}
              onChange={(event) => sortOrder.set(event.target.value)}
            />
          </Field>
          {detail.kind === "mcp" ? (
            <div className="md:col-span-2">
              <Field
                label={t("mcpServerUrl.label")}
                htmlFor="plugin-mcp-url"
                hint={t("mcpServerUrl.hint")}
              >
                <Input
                  id="plugin-mcp-url"
                  value={mcpServerUrl.value}
                  onChange={(event) => mcpServerUrl.set(event.target.value)}
                />
              </Field>
            </div>
          ) : (
            <div className="md:col-span-2">
              <p className="rounded-lg border border-hairline bg-surface-2/60 px-3 py-2 text-[12px] text-ink-muted">
                {t("nativeNote")}
              </p>
            </div>
          )}
          <div className="md:col-span-2">
            <Field
              label={t("requiredScopes.label")}
              htmlFor="plugin-scopes"
              hint={t("requiredScopes.hint")}
            >
              <Textarea
                id="plugin-scopes"
                value={scopes.value}
                rows={4}
                className="font-mono text-[12px]"
                onChange={(event) => scopes.set(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch
              id="plugin-featured"
              checked={isFeatured.value}
              onCheckedChange={(checked: boolean) => isFeatured.set(checked)}
            />
            <Label htmlFor="plugin-featured" className="text-[12px]">
              {t("featuredLabel")}
            </Label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-hairline/60 px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={changeCount === 0 || mutation.isPending}
            onClick={followRow}
          >
            {t("discard")}
          </Button>
          <Button size="sm" disabled={changeCount === 0 || mutation.isPending} onClick={() => void submit()}>
            {mutation.isPending ? t("saving") : t("save")}
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

/**
 * OAuth or a per-user API key. Switching ends every user's connection to the row, because the
 * credential each of them holds belongs to the other mode; the server does that, this only warns.
 */
function AuthModeSection({ detail }: { detail: AdminPluginCatalogDetailDto }) {
  const t = useTranslations("adminPlugins.detail.authMode");
  const mutation = useUpdateAdminPlugin(detail.pluginKey);
  const current = detail.oAuthClientSource === "api_key" ? "api_key" : "oauth";
  const next = current === "api_key" ? "oauth" : "api_key";
  const [confirming, setConfirming] = useState(false);

  const submit = async () => {
    try {
      await mutation.mutateAsync({ authMode: next });
      setConfirming(false);
      toast.success(next === "api_key" ? t("toast.switchedToApiKey") : t("toast.switchedToOAuth"));
    } catch (error) {
      reportFailure(error, t("toast.switchFail"));
    }
  };

  return (
    <>
      <SectionHeading
        icon={<Key size={14} weight="duotone" />}
        title={t("heading")}
        note={current === "api_key" ? t("modeApiKey") : t("modeOAuth")}
      />
      <AdminPanel>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-[12px]">
          <p className="max-w-xl leading-5 text-ink-muted">
            {current === "api_key"
              ? t("descriptionApiKey")
              : t("descriptionOAuth")}
          </p>
          {confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-amber-700 dark:text-amber-400">
                {t("confirmWarning", { label: detail.label })}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={mutation.isPending}>
                {t("cancel")}
              </Button>
              <Button size="sm" onClick={() => void submit()} disabled={mutation.isPending}>
                {t("switch")}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
              {next === "api_key" ? t("switchToApiKey") : t("switchToOAuth")}
            </Button>
          )}
        </div>
      </AdminPanel>
    </>
  );
}

function OAuthSection({ detail }: { detail: AdminPluginCatalogDetailDto }) {
  const t = useTranslations("adminPlugins.detail.oauth");
  const mutation = useSetAdminPluginOAuthClient(detail.pluginKey);

  // Every one of these follows a re-seeded row while it is untouched, which is the whole of the
  // "Re-run discovery" fix: discovery writes the endpoints, the cache is re-seeded, and the boxes
  // an operator has not typed into show what was found instead of what was there before.
  const clientId = useSeededField(detail.oAuthClientId ?? "");
  const authorizationEndpoint = useSeededField(detail.oAuthAuthorizationEndpoint ?? "");
  const tokenEndpoint = useSeededField(detail.oAuthTokenEndpoint ?? "");
  const revokeEndpoint = useSeededField(detail.oAuthRevokeEndpoint ?? "");

  // Not a seeded field, and could not be: nothing seeds a secret, because no endpoint returns one.
  const [secretMode, setSecretMode] = useState<SecretMode>("keep");
  const [secret, setSecret] = useState("");

  const catalogOwns = catalogOwnsOAuthClient(detail.kind);
  const dirtyCount = [clientId, authorizationEndpoint, tokenEndpoint, revokeEndpoint].filter(
    (field) => field.dirty,
  ).length;

  /**
   * Drops every edit so the panel follows the loaded row again, and puts the secret back to
   * "keep". Discard and a successful save both want exactly this.
   */
  const followRow = () => {
    clientId.reset();
    authorizationEndpoint.reset();
    tokenEndpoint.reset();
    revokeEndpoint.reset();
    // Dropped the moment it has been sent. Nothing on this page keeps a secret alive in memory
    // longer than the request that carried it.
    setSecret("");
    setSecretMode("keep");
  };

  const submit = async () => {
    const trimmedId = clientId.value.trim();
    if (trimmedId.length === 0) {
      toast.error(t("toast.clientIdRequired"));
      return;
    }
    if (secretMode === "replace" && secret.length === 0) {
      toast.error(t("toast.secretRequired"));
      return;
    }

    try {
      await mutation.mutateAsync({
        clientId: trimmedId,
        // Tri-state. `undefined` is stripped from the body before it is sent, so "keep" is a
        // genuinely absent property rather than a null the server would read the same way but a
        // reader of the request would not.
        clientSecret: secretMode === "replace" ? secret : secretMode === "clear" ? "" : undefined,
        authorizationEndpoint: authorizationEndpoint.value.trim() || undefined,
        tokenEndpoint: tokenEndpoint.value.trim() || undefined,
        revokeEndpoint: revokeEndpoint.value.trim() || undefined,
      });
      // Back to following the row the write just re-seeded, rather than to what was typed: the
      // server normalises endpoints, and this is also the response that reports whether the client
      // source actually moved to `preregistered`.
      followRow();
      toast.success(
        secretMode === "clear"
          ? t("toast.savedCleared")
          : secretMode === "replace"
            ? t("toast.savedReplaced")
            : t("toast.savedKept"),
      );
    } catch (error) {
      reportFailure(error, t("toast.saveFail"));
    }
  };

  return (
    <>
      <SectionHeading
        icon={<Key size={14} weight="duotone" />}
        title={t("heading")}
        note={t(`sourceLabels.${detail.oAuthClientSource}`)}
      />
      <AdminPanel>
        <div className="grid gap-3 border-b border-hairline/60 px-4 py-4 text-[12px] sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">{t("clientIdSummary")}</p>
            <p className="mt-1 break-all font-mono text-[12px] text-ink">
              {detail.oAuthClientId ?? t("clientIdNotSet")}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-ink-muted">{t("clientSecretSummary")}</p>
            {/* Never a value, never a mask of a value — the service does not return one in any
                form. The only two facts it exposes are that a secret exists and, to the precision
                the schema allows, when the row was last written. */}
            <p className="mt-1 text-[12px] text-ink">
              {detail.hasClientSecret ? (
                <>
                  <span className="font-mono">•••••••••</span>{" "}
                  <span className="text-ink-muted">
                    {t("clientSecretStored", { date: formatDateTime(detail.credentialsUpdatedAt) })}
                  </span>
                </>
              ) : (
                <span className="text-ink-muted">{t("clientSecretNone")}</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-ink-muted">{t("tokenEndpointAuthSummary")}</p>
            <p className="mt-1 font-mono text-[12px] text-ink">
              {detail.oAuthTokenEndpointAuthMethod ?? t("tokenEndpointAuthNotNegotiated")}
            </p>
          </div>
        </div>

        <p className="border-b border-hairline/60 px-4 py-2.5 text-[11px] text-ink-muted">
          {t(`sourceNotes.${detail.oAuthClientSource}`)}
          {detail.oAuthRegistrationEndpoint ? (
            <> {t("registrationEndpointLabel", { endpoint: detail.oAuthRegistrationEndpoint })}</>
          ) : null}
        </p>

        {!catalogOwns ? (
          <div className="px-4 py-5 text-[13px]">
            <p className="font-medium text-ink">{t("native.title")}</p>
            <p className="mt-1.5 max-w-2xl text-[12px] leading-6 text-ink-muted">{t("native.body")}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field
                  label={t("clientId.label")}
                  htmlFor="oauth-client-id"
                  hint={t("clientId.hint")}
                >
                  <Input
                    id="oauth-client-id"
                    value={clientId.value}
                    className="font-mono text-[12px]"
                    autoComplete="off"
                    onChange={(event) => clientId.set(event.target.value)}
                  />
                </Field>
              </div>

              <div className="md:col-span-2 space-y-2">
                <p className="text-[12px] font-medium">{t("clientSecretHeading")}</p>
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
                      ? t("secretMode.keepStored")
                      : t("secretMode.leaveUnset")}
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-ink-muted">
                    <input
                      type="radio"
                      name="secret-mode"
                      value="replace"
                      checked={secretMode === "replace"}
                      onChange={() => setSecretMode("replace")}
                    />
                    {detail.hasClientSecret ? t("secretMode.replace") : t("secretMode.setOne")}
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
                    {t("secretMode.clearStored")}
                  </label>
                </div>
                {secretMode === "replace" ? (
                  <Input
                    id="oauth-client-secret"
                    type="password"
                    value={secret}
                    autoComplete="new-password"
                    placeholder={t("secretPlaceholder")}
                    aria-label={t("secretAria")}
                    className="font-mono text-[12px]"
                    onChange={(event) => setSecret(event.target.value)}
                  />
                ) : null}
                <p className="text-[11px] leading-5 text-ink-muted">{t("secretHint")}</p>
              </div>

              <Field
                label={t("authorizationEndpoint.label")}
                htmlFor="oauth-authorization-endpoint"
                hint={t("authorizationEndpoint.hint")}
              >
                <Input
                  id="oauth-authorization-endpoint"
                  value={authorizationEndpoint.value}
                  className="font-mono text-[12px]"
                  onChange={(event) => authorizationEndpoint.set(event.target.value)}
                />
              </Field>
              <Field
                label={t("tokenEndpoint.label")}
                htmlFor="oauth-token-endpoint"
                hint={t("tokenEndpoint.hint")}
              >
                <Input
                  id="oauth-token-endpoint"
                  value={tokenEndpoint.value}
                  className="font-mono text-[12px]"
                  onChange={(event) => tokenEndpoint.set(event.target.value)}
                />
              </Field>
              <div className="md:col-span-2">
                <Field
                  label={t("revokeEndpoint.label")}
                  htmlFor="oauth-revoke-endpoint"
                  hint={t("revokeEndpoint.hint")}
                >
                  <Input
                    id="oauth-revoke-endpoint"
                    value={revokeEndpoint.value}
                    className="font-mono text-[12px]"
                    onChange={(event) => revokeEndpoint.set(event.target.value)}
                  />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-hairline/60 px-4 py-3">
              {/* What the operator's boxes hold that the row does not — which after a discovery
                  run is how they learn a field they had typed into is now contradicted by what the
                  server found, rather than learning it by overwriting it. */}
              <span className="text-[11px] text-ink-muted">
                {dirtyCount > 0 ? t("dirtyCount", { count: dirtyCount }) : ""}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={dirtyCount === 0 || mutation.isPending}
                  onClick={followRow}
                >
                  {t("discard")}
                </Button>
                <Button size="sm" disabled={mutation.isPending} onClick={() => void submit()}>
                  {mutation.isPending ? t("saving") : t("save")}
                </Button>
              </div>
            </div>
          </>
        )}
      </AdminPanel>
    </>
  );
}

// ── Tools ────────────────────────────────────────────────────────────────────

function ToolsSection({ detail }: { detail: AdminPluginCatalogDetailDto }) {
  const t = useTranslations("adminPlugins.detail.tools");
  const mutation = useReplaceAdminPluginTools(detail.pluginKey);
  const stored = useMemo(() => formatToolManifest(detail.tools), [detail.tools]);
  // Follows a re-seeded row while untouched: after "Re-run discovery" reads a new tools/list, an
  // editor nobody has typed into shows the tools that were found rather than the ones that were
  // there before — which the "N tools stored" line beneath it was already reporting.
  const manifest = useSeededField(stored);
  const [errors, setErrors] = useState<string[]>([]);

  const dirty = manifest.dirty;

  const validate = (): boolean => {
    const result = parseToolManifest(manifest.value);
    setErrors(result.ok ? [] : result.errors);
    if (result.ok) toast.success(t("toast.valid"));
    return result.ok;
  };

  const submit = async () => {
    const result = parseToolManifest(manifest.value);
    if (!result.ok) {
      setErrors(result.errors);
      // Checked here as well as on the server because PUT replaces the manifest wholesale: one bad
      // entry would otherwise cost a round trip to learn about, and there is no partial success to
      // fall back on.
      toast.error(t("toast.problems", { count: result.errors.length }));
      return;
    }

    setErrors([]);
    try {
      const saved = await mutation.mutateAsync({ tools: result.tools });
      // Follows the re-seeded row rather than keeping the submitted text: the server stamps
      // pluginKey back on and can reorder or normalise an entry, and the editor should show what
      // is stored rather than what was sent.
      manifest.reset();
      toast.success(
        saved.tools.length === 0
          ? t("toast.replacedEmpty")
          : t("toast.replacedCount", { count: saved.tools.length }),
      );
    } catch (error) {
      const code = catalogErrorCode(error);
      if (code === "invalid_tool_manifest") {
        setErrors([failureMessage(error, t("toast.invalidFallback"))]);
      }
      reportFailure(error, t("toast.replaceFail"));
    }
  };

  return (
    <>
      <SectionHeading
        icon={<Wrench size={14} weight="duotone" />}
        title={t("heading")}
        note={
          detail.toolsSyncedAt
            ? t("lastRead", { date: formatDateTime(detail.toolsSyncedAt) })
            : t("neverConfirmed")
        }
      />
      <AdminPanel>
        <div className="px-4 py-4">
          <p className="mb-2 text-[11px] leading-5 text-ink-muted">{t("intro")}</p>
          <Textarea
            value={manifest.value}
            rows={16}
            spellCheck={false}
            aria-label={t("textareaAria")}
            aria-invalid={errors.length > 0}
            className="font-mono text-[12px] leading-5"
            onChange={(event) => {
              manifest.set(event.target.value);
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
            {t("storedCount", { count: detail.tools.length })}
            {dirty ? t("editorDiffers") : ""}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!dirty || mutation.isPending}
              onClick={() => {
                manifest.reset();
                setErrors([]);
              }}
            >
              {t("discard")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => validate()}>
              {t("validate")}
            </Button>
            <Button size="sm" disabled={mutation.isPending} onClick={() => void submit()}>
              {mutation.isPending ? t("replacing") : t("replace")}
            </Button>
          </div>
        </div>
      </AdminPanel>
    </>
  );
}

// ── Audit row ────────────────────────────────────────────────────────────────

const OUTCOME_TONE_CLASSES: Record<PluginToolOutcomeTone, string> = {
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  attention: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  blocked: "border-border bg-surface-2 text-ink-muted",
  failed: "border-destructive/25 bg-destructive/10 text-destructive",
};

/** Codes from `PluginConstants.ErrorCodes` that map to a "Provider error" label rather than a
 *  plain "Failed" — mirrors the grouping `describePluginToolOutcome` applies, since that function
 *  returns only the tone plus the raw code, not a translation key. */
const PROVIDER_ERROR_TOOL_CODES = new Set([
  "provider_rate_limited",
  "provider_unavailable",
  "provider_configuration",
]);

function outcomeLabelKey(outcome: PluginToolOutcome): string {
  if (outcome.tone === "attention") {
    return outcome.code === "confirmation_required" ? "attentionConfirmation" : "attentionSetup";
  }
  if (outcome.tone === "failed") {
    return outcome.code && PROVIDER_ERROR_TOOL_CODES.has(outcome.code) ? "providerError" : "failed";
  }
  return outcome.tone;
}

function AuditRow({ entry }: { entry: AdminPluginToolAuditEntryDto }) {
  const t = useTranslations("adminPlugins.detail.audits");
  const outcome = describePluginToolOutcome(entry.resultStatus);
  return (
    <li className="border-b border-hairline/60 px-4 py-2.5 text-[12px] last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[12px] text-ink">{entry.toolName}</span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            OUTCOME_TONE_CLASSES[outcome.tone],
          )}
        >
          {t(`outcomeLabels.${outcomeLabelKey(outcome)}` as "outcomeLabels.success")}
        </span>
        {outcome.code ? (
          <span className="font-mono text-[11px] text-ink-muted">{outcome.code}</span>
        ) : null}
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
  const t = useTranslations("adminPlugins.detail.danger");
  const mutation = useDeleteAdminPlugin(detail.pluginKey);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const referenced = detail.installationCount > 0 || detail.connectionCount > 0;

  const hardDelete = async () => {
    try {
      const result = await mutation.mutateAsync(true);
      setConfirmOpen(false);
      if (result.hardDeleted) {
        toast.success(t("toast.deleted", { key: detail.pluginKey }));
        onHardDeleted();
      } else {
        // The server answers a soft delete the same way; saying so is better than claiming a
        // deletion that did not happen.
        toast.success(t("toast.retiredInstead", { key: detail.pluginKey }));
      }
    } catch (error) {
      reportFailure(
        error,
        catalogErrorCode(error) === "plugin_in_use" ? t("toast.inUseFail") : t("toast.deleteFail"),
      );
    }
  };

  return (
    <>
      <SectionHeading icon={<Trash size={14} weight="duotone" />} title={t("heading")} />
      <AdminPanel className="border-destructive/25">
        <div className="flex flex-col gap-3 px-4 py-4 text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="font-medium">{t("title")}</p>
            <p className="mt-1 text-[12px] leading-5 text-ink-muted">
              {referenced
                ? t("referencedBody", {
                    installs: detail.installationCount,
                    connections: detail.connectionCount,
                  })
                : t("notReferencedBody")}
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
            {t("deleteButton")}
          </Button>
        </div>
      </AdminPanel>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next: boolean) => (mutation.isPending ? undefined : setConfirmOpen(next))}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("dialog.title", { label: detail.label })}</DialogTitle>
            <DialogDescription>
              {t("dialog.description", { key: detail.pluginKey })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={mutation.isPending}
            >
              {t("dialog.cancel")}
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={mutation.isPending}
              onClick={() => void hardDelete()}
            >
              {mutation.isPending ? t("dialog.deleting") : t("dialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
