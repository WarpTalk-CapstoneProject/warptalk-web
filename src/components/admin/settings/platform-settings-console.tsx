"use client";

/**
 * /admin/settings — the platform settings console.
 *
 * Every runtime setting the platform reads, from the typed registry on the server
 * (WarpTalk.Shared.PlatformSettings.PlatformSettingsCatalog), grouped by category, with what is
 * stored, who changed it and why. The registry is code: a key exists because a service reads it,
 * so nothing here is a switch wired to nothing. Secrets never are settings; the Integrations
 * category only says whether they are configured.
 *
 * What the old page held is all still here, in the category it belongs to: the billing policy
 * (VAT) and pricing economics with the Stripe FX rate under Billing, the language catalog and the
 * voice-consent ledger under Meetings & AI pipeline (as reference data).
 *
 * The view lives in the URL — `?category=`, `?q=`, `?changed=1`, and `?key=` to focus one setting —
 * so ⌘K and links from the audit log can land on exactly one row.
 *
 * Gating: reading needs settings.read (the route map). Every write control is offered only with
 * settings.manage, and Security & auth writes also need settings.security; the server's `canEdit`
 * on each setting is authoritative and a refusal is explained on the row, not hidden.
 */

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowsClockwise,
  CheckCircle,
  DownloadSimple,
  GearSix,
  Globe,
  LockSimple,
  Microphone,
  UploadSimple,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { AdminListSearch } from "@/components/admin/list/admin-list-search";
import { useAdminActionIntent } from "@/components/admin/list/use-admin-list-state";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { useAdminPlatformSettings, useAdminPlatformSettingsActions } from "@/hooks/use-admin-platform-settings";
import { useCan, useStaffAccess } from "@/hooks/use-staff-access";
import {
  categoryOfKey,
  consoleUrlQuery,
  exportFileName,
  filterSettings,
  isChangedFromDefault,
  orderedCategories,
  parseConsoleUrl,
  type ConsoleUrlState,
} from "@/lib/admin/platform-settings";
import { ADMIN_PERMISSIONS } from "@/lib/admin/staff-permissions";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { PlatformSettingDto, PlatformSettingsConsoleDto } from "@/types/admin-platform-settings";

import { BillingPolicyPanel, PricingEconomicsPanel } from "./billing-panels";
import { IntegrationsPanel } from "./integrations-panel";
import { LanguageCatalogPanel, VoiceConsentSection } from "./reference-panels";
import { RetentionPanel } from "./retention-panel";
import { SettingHistorySheet } from "./setting-history-sheet";
import { SettingRow, settingDomId, type EditRefusal } from "./setting-row";
import { SettingsImportDialog } from "./settings-import-dialog";
import { useSettingsCopy } from "./settings-i18n";

const DEFAULT_CATEGORY = "general";

export function PlatformSettingsConsole() {
  const t = useTranslations("adminPlatformSettings");
  const copy = useSettingsCopy();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = useMemo(() => parseConsoleUrl(new URLSearchParams(searchParams.toString())), [searchParams]);

  // What the portal offers. The server decides again on every write (and per setting via canEdit).
  const canManage = useCan(ADMIN_PERMISSIONS.settingsManage);
  const canManageSecurity = useCan(ADMIN_PERMISSIONS.settingsSecurity);
  const { isLoading: accessLoading } = useStaffAccess();

  const consoleQuery = useAdminPlatformSettings();
  const actions = useAdminPlatformSettingsActions();
  const data = consoleQuery.data ?? null;
  const settings = useMemo(() => data?.settings ?? [], [data]);
  const serverCanManage = data ? data.canManage : true;
  const manage = canManage && serverCanManage;

  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const category = url.category ?? categoryOfKey(settings, url.focusKey) ?? DEFAULT_CATEGORY;
  const navigate = (patch: Partial<ConsoleUrlState>) => {
    const next: ConsoleUrlState = { ...url, ...patch };
    router.replace(`${pathname}${consoleUrlQuery(next)}`, { scroll: false });
  };

  const refusalFor = (setting: PlatformSettingDto): EditRefusal => {
    if (!canManage) return "manage";
    if (setting.requiresSecurityPermission && !canManageSecurity) return "security";
    if (!setting.canEdit) return setting.requiresSecurityPermission && data && !data.canManageSecurity ? "security" : "server";
    return null;
  };

  // A focused key (?key=) scrolls into view once its row exists.
  useEffect(() => {
    if (!url.focusKey || settings.length === 0) return;
    const element = document.getElementById(settingDomId(url.focusKey));
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [url.focusKey, settings.length, category]);

  const exportSettings = async () => {
    if (!manage) return;
    try {
      const file = await actions.exportSettings.mutateAsync();
      const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = exportFileName(new Date(file.exportedAt || Date.now()));
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
      toast.success(t("export.done", { count: file.settings.length, file: link.download }));
      if (file.excluded.length) toast.message(t("export.excluded", { count: file.excluded.length, keys: file.excluded.join(", ") }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("export.failed")));
    }
  };

  const query = url.query.trim();
  const visible = useMemo(
    () => filterSettings(settings, { category, query, changedOnly: url.changedOnly }, copy.categoryLabel),
    [settings, category, query, url.changedOnly, copy.categoryLabel],
  );
  const historySetting = historyKey ? (settings.find((setting) => setting.key === historyKey) ?? null) : null;
  const historyRefusal = historySetting ? refusalFor(historySetting) : "manage";

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<GearSix size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            {data ? <PublishChip publish={data.publish} /> : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void consoleQuery.refetch()}
              disabled={consoleQuery.isFetching}
            >
              <ArrowsClockwise size={14} className={cn(consoleQuery.isFetching && "animate-spin")} />
              {t("refresh")}
            </Button>
            {manage ? (
              <>
                <Button variant="outline" size="sm" onClick={() => void exportSettings()} disabled={actions.exportSettings.isPending || !data}>
                  <DownloadSimple size={14} />
                  {actions.exportSettings.isPending ? t("toolbar.exporting") : t("toolbar.export")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!data}>
                  <UploadSimple size={14} />
                  {t("toolbar.import")}
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {!canManage ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-[12px] text-ink-muted">
          <LockSimple size={14} />
          {t("toolbar.readOnly")}
        </p>
      ) : null}

      {data && !data.publish.healthy ? (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-ink">
          <Warning size={14} className="mt-0.5 shrink-0 text-warning" />
          {t("publish.unhealthyDetail", { error: data.publish.error ?? t("publish.unknownError") })}
        </p>
      ) : null}

      <div className="mt-5 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <CategoryNav
          data={data}
          selected={query ? null : category}
          onSelect={(next) => navigate({ category: next, query: "", focusKey: null })}
        />

        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <AdminListSearch
              value={url.query}
              onChange={(value) => navigate({ query: value, focusKey: null })}
              placeholder={t("search.placeholder")}
              className="sm:max-w-[420px] sm:flex-1"
            />
            <label className="inline-flex items-center gap-2 text-[12px] text-ink-muted">
              <Switch
                size="sm"
                checked={url.changedOnly}
                onCheckedChange={(checked) => navigate({ changedOnly: Boolean(checked), focusKey: null })}
                aria-label={t("search.changedOnly")}
              />
              {t("search.changedOnly")}
            </label>
          </div>

          {consoleQuery.isError && !data ? (
            <AdminPanel className="mt-4">
              <div className="flex items-start gap-3 px-4 py-8 text-sm">
                <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">{t("loadError.title")}</p>
                  <p className="mt-1 text-ink-muted">{getErrorMessage(consoleQuery.error, t("loadError.hint"))}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => void consoleQuery.refetch()}>
                    {t("loadError.retry")}
                  </Button>
                </div>
              </div>
            </AdminPanel>
          ) : consoleQuery.isPending ? (
            <AdminPanel className="mt-4">
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded bg-surface-2" />
                ))}
              </div>
            </AdminPanel>
          ) : query ? (
            <SearchResults
              settings={visible}
              query={query}
              focusKey={url.focusKey}
              refusalFor={refusalFor}
              onHistory={setHistoryKey}
              onReload={() => void consoleQuery.refetch()}
            />
          ) : (
            <CategoryView
              category={category}
              settings={visible}
              changedOnly={url.changedOnly}
              focusKey={url.focusKey}
              manage={manage}
              refusalFor={refusalFor}
              onHistory={setHistoryKey}
              onReload={() => void consoleQuery.refetch()}
            />
          )}
        </div>
      </div>

      {/* ⌘K "Export / Import platform settings" land here with ?action=. Mounted only once staff
          access and the console have loaded, so the intent is not consumed while `manage` is
          still false and silently dropped. */}
      {data && !accessLoading ? (
        <ActionIntent
          handlers={{
            export: () => void exportSettings(),
            import: () => {
              if (manage) setImportOpen(true);
            },
          }}
        />
      ) : null}

      <SettingHistorySheet setting={historySetting} canRevert={historyRefusal === null} onClose={() => setHistoryKey(null)} />
      {manage ? <SettingsImportDialog open={importOpen} onOpenChange={setImportOpen} settings={settings} /> : null}
    </AdminPage>
  );
}

function ActionIntent({ handlers }: { handlers: Record<string, () => void> }) {
  useAdminActionIntent(handlers);
  return null;
}

function PublishChip({ publish }: { publish: PlatformSettingsConsoleDto["publish"] }) {
  const t = useTranslations("adminPlatformSettings.publish");
  const copy = useSettingsCopy();
  if (!publish.healthy) {
    return (
      <Tooltip content={publish.error ?? null}>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 text-[11px] font-medium text-warning">
          <Warning size={12} weight="fill" />
          {t("unhealthy")}
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={publish.publishedAt ? t("healthyTitle", { when: copy.dateTime(publish.publishedAt) }) : t("never")}>
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
        <CheckCircle size={12} weight="fill" />
        {t("healthy", { version: publish.version })}
      </span>
    </Tooltip>
  );
}

function CategoryNav({
  data,
  selected,
  onSelect,
}: {
  data: PlatformSettingsConsoleDto | null;
  selected: string | null;
  onSelect: (category: string) => void;
}) {
  const t = useTranslations("adminPlatformSettings");
  const copy = useSettingsCopy();
  const categories = orderedCategories(data?.categories ?? []);
  const counts = new Map((data?.categories ?? []).map((category) => [category.key, category]));

  return (
    <nav aria-label={t("nav.aria")} className="lg:sticky lg:top-4 lg:self-start">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {categories.map((category) => {
          const count = counts.get(category);
          const active = selected === category;
          return (
            <li key={category} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(category)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active ? "bg-surface-2 font-medium text-ink" : "text-ink-muted hover:bg-surface-2/60 hover:text-ink",
                )}
              >
                <span className="truncate">{copy.categoryLabel(category)}</span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums">
                  {count && count.changedCount > 0 ? (
                    <Tooltip content={t("nav.changedCount", { count: count.changedCount })}>
                      <span className="rounded-full bg-sky-500/15 px-1.5 text-sky-700 dark:text-sky-300">{count.changedCount}</span>
                    </Tooltip>
                  ) : null}
                  {count ? <span className="text-ink-subtle">{count.count}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RowsPanel({
  settings,
  focusKey,
  refusalFor,
  onHistory,
  onReload,
  className,
}: {
  settings: readonly PlatformSettingDto[];
  focusKey: string | null;
  refusalFor: (setting: PlatformSettingDto) => EditRefusal;
  onHistory: (key: string) => void;
  onReload: () => void;
  className?: string;
}) {
  return (
    <AdminPanel className={className}>
      {settings.map((setting) => (
        <SettingRow
          key={setting.key}
          setting={setting}
          refusal={refusalFor(setting)}
          focused={focusKey === setting.key}
          onHistory={() => onHistory(setting.key)}
          onReload={onReload}
        />
      ))}
    </AdminPanel>
  );
}

function SearchResults({
  settings,
  query,
  focusKey,
  refusalFor,
  onHistory,
  onReload,
}: {
  settings: readonly PlatformSettingDto[];
  query: string;
  focusKey: string | null;
  refusalFor: (setting: PlatformSettingDto) => EditRefusal;
  onHistory: (key: string) => void;
  onReload: () => void;
}) {
  const t = useTranslations("adminPlatformSettings.search");
  const copy = useSettingsCopy();
  const groups = useMemo(() => {
    const map = new Map<string, PlatformSettingDto[]>();
    for (const setting of settings) map.set(setting.category, [...(map.get(setting.category) ?? []), setting]);
    return orderedCategories([...map.keys()].map((key) => ({ key }))).filter((category) => map.has(category)).map((category) => ({
      category,
      rows: map.get(category)!,
    }));
  }, [settings]);

  if (settings.length === 0) {
    return <p className="mt-10 text-center text-[13px] text-ink-muted">{t("noResults", { query })}</p>;
  }
  return (
    <div className="mt-4">
      <p className="text-[12px] text-ink-muted" role="status">
        {t("results", { count: settings.length, query })}
      </p>
      {groups.map((group) => (
        <section key={group.category} className="mt-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">{copy.categoryLabel(group.category)}</h2>
          <RowsPanel settings={group.rows} focusKey={focusKey} refusalFor={refusalFor} onHistory={onHistory} onReload={onReload} className="mt-2" />
        </section>
      ))}
    </div>
  );
}

function CategoryView({
  category,
  settings,
  changedOnly,
  focusKey,
  manage,
  refusalFor,
  onHistory,
  onReload,
}: {
  category: string;
  settings: readonly PlatformSettingDto[];
  changedOnly: boolean;
  focusKey: string | null;
  manage: boolean;
  refusalFor: (setting: PlatformSettingDto) => EditRefusal;
  onHistory: (key: string) => void;
  onReload: () => void;
}) {
  const t = useTranslations("adminPlatformSettings");
  const tLegacy = useTranslations("adminPlansSettings.settings");
  const copy = useSettingsCopy();
  const hasDescription = t.has(`categories.${category}.description`);
  const anyChanged = settings.some(isChangedFromDefault);

  return (
    <div className="mt-4">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">{copy.categoryLabel(category)}</h2>
      {hasDescription ? <p className="mt-0.5 max-w-3xl text-[12px] text-ink-muted">{t(`categories.${category}.description`)}</p> : null}

      {category === "retention" ? (
        <div className="mt-4">
          <RetentionPanel />
        </div>
      ) : null}

      {category === "integrations" ? (
        <div className="mt-4">
          <IntegrationsPanel canManage={manage} />
        </div>
      ) : null}

      {settings.length > 0 ? (
        <RowsPanel settings={settings} focusKey={focusKey} refusalFor={refusalFor} onHistory={onHistory} onReload={onReload} className="mt-4" />
      ) : category !== "retention" && category !== "integrations" ? (
        <p className="mt-4 rounded-lg border border-dashed border-hairline px-4 py-6 text-center text-[12px] text-ink-muted">
          {changedOnly && !anyChanged ? t("search.changedOnlyEmpty") : t("empty.category")}
        </p>
      ) : null}

      {category === "billing" && !changedOnly ? (
        <>
          <h3 className="mt-8 text-sm font-semibold text-ink">{tLegacy("billingPolicyHeading")}</h3>
          <BillingPolicyPanel />

          <h3 className="mt-6 text-sm font-semibold text-ink">{tLegacy("pricingEconomicsHeading")}</h3>
          <p className="mt-1 text-xs text-ink-muted">{tLegacy("pricingEconomicsSubnote")}</p>
          <PricingEconomicsPanel />
        </>
      ) : null}

      {category === "meetings" && !changedOnly ? (
        <>
          <div className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-[14px] font-semibold tracking-tight text-ink">{tLegacy("bandReference.title")}</h3>
            <span className="text-[12px] text-ink-muted">{tLegacy("bandReference.note")}</span>
          </div>
          <AdminPanel className="mt-3 border-border bg-surface-2/40">
            <p className="px-4 py-3 text-[12.5px] leading-relaxed text-ink-muted">
              {tLegacy.rich("explainer", { strong: (chunks) => <span className="font-medium text-ink">{chunks}</span> })}
            </p>
          </AdminPanel>

          <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-ink">
            <Globe size={14} weight="duotone" />
            {tLegacy("languageCatalogHeading")}
          </h3>
          <LanguageCatalogPanel />

          <VoiceConsentSection heading={tLegacy("voiceConsentHeading")} icon={<Microphone size={14} weight="duotone" />} />
          <p className="mt-4 text-[12px] text-ink-muted">{tLegacy("footerNote")}</p>
        </>
      ) : null}
    </div>
  );
}
