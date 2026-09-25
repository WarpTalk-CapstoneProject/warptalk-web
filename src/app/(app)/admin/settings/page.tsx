"use client";

/**
 * Platform settings — everything the platform runs on, in the order an admin can act on it.
 *
 * This page used to be only the writable half. `/admin/configuration` held the other half — the
 * language catalog and the voice-consent ledger — and the split was argued on the grounds that
 * mixing an editable VAT rate into read-only reference data blurs the line between what you can
 * change and what you cannot.
 *
 * MERGED 2026-09-16 (owner's call). The line is worth drawing; a whole second route was not the
 * way to draw it. Two pages meant two nav rows for one subject, and an admin looking for "what is
 * this platform configured to do" had to know which of the two words — "settings" or "config" —
 * the thing they wanted lived under. The boundary is now a band divider inside one page: knobs
 * first, reference data second, with the reason it is read-only stated where it applies.
 *
 * The language catalog became editable with WT-691: translation-room now records every catalog
 * change in the platform audit log over gRPC before saving it (and refuses the change when it
 * cannot), which was the one reason it was read-only. The consent ledger is still read-only —
 * its service cannot record who threw a switch.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowsClockwise,
  GearSix,
  Globe,
  Microphone,
  PencilSimple,
  Plus,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import { PricingConfigDialog } from "@/components/admin/pricing-editors";
import {
  useAdminBillingPolicy,
  useAdminPricingConfig,
  useUpdateAdminBillingPolicy,
  useUpdateAdminPricingConfig,
} from "@/hooks/use-admin-pricing";
import {
  useAdminLanguageCatalog,
  useAdminVoiceConsentSummary,
} from "@/hooks/use-admin-configuration";
import {
  LanguageFormDialog,
  LanguageToggleDialog,
} from "@/components/admin/language-catalog-editor";
import { compareLanguageCatalog } from "@/lib/language/catalog-drift";
import { fxLineView } from "@/lib/admin/insights-pnl";
import { useAdminFxActions, useAdminFxRate } from "@/hooks/use-admin-insights";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type {
  AdminSupportedLanguageDto,
  AdminVoiceConsentSummaryDto,
} from "@/types/admin-configuration";

const numberFormatter = new Intl.NumberFormat("en-US");
// USD per Cartesia credit is ~0.00004: the default six-digit cut would show 0.000039.
const usdPerCreditFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });

/**
 * The divider that replaced the route split: what you can change, then what you can only read.
 * Carries the reason on its own line, because the answer to "why is there nothing to click here"
 * has to sit where the reader asks it.
 */
function Band({ title, note }: { title: string; note: string }) {
  return (
    <div className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1 first:mt-6">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
      <span className="text-[12px] text-ink-muted">{note}</span>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PanelError({ what, onRetry }: { what: string; onRetry: () => void }) {
  const t = useTranslations("adminPlansSettings.settings.panelError");
  return (
    <div className="flex items-start gap-3 px-4 py-8 text-sm">
      <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
      <div>
        <p className="font-medium">{t("message", { what })}</p>
        <p className="mt-1 text-ink-muted">{t("hint")}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          {t("tryAgain")}
        </Button>
      </div>
    </div>
  );
}

function BillingPolicyPanel() {
  const t = useTranslations("adminPlansSettings.settings.billingPolicy");
  const policyQuery = useAdminBillingPolicy();
  const updatePolicy = useUpdateAdminBillingPolicy();

  const [draft, setDraft] = useState<string | null>(null);
  const stored = policyQuery.data?.vatRate;
  const value = draft ?? (stored == null ? "" : String(stored));
  const parsed = Number(value);
  const isDirty = draft !== null && stored != null && parsed !== stored;
  const isValid = value !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= 1;

  const save = async () => {
    try {
      await updatePolicy.mutateAsync({ vatRate: parsed });
      setDraft(null);
      toast.success(t("saveSuccessToast"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("saveErrorToast")));
    }
  };

  return (
    <AdminPanel className="mt-3">
      {policyQuery.isError ? (
        <PanelError what={t("errorWhat")} onRetry={() => void policyQuery.refetch()} />
      ) : (
        <SettingRow label={t("vatLabel")} hint={t("vatHint")}>
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(event) => setDraft(event.target.value)}
              inputMode="decimal"
              disabled={policyQuery.isPending || updatePolicy.isPending}
              aria-label={t("vatAriaLabel")}
              className="h-9 w-28 text-right tabular-nums"
            />
            <Button
              size="sm"
              disabled={!isDirty || !isValid || updatePolicy.isPending}
              onClick={() => void save()}
            >
              {updatePolicy.isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </SettingRow>
      )}
    </AdminPanel>
  );
}


const fxInstant = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * The USD→VND rate: Stripe's by default (recorded daily by billing), with its source and as-of time,
 * an amber warning whenever Stripe has not answered for a day (the reports then run on the last known
 * rate), and an explicit, reversible override. Replaces the hand-typed 26,300.
 */
function FxRateRow({ fallbackRate }: { fallbackRate: number }) {
  const t = useTranslations("adminPlansSettings.settings.pricingEconomics");
  const fxQuery = useAdminFxRate();
  const actions = useAdminFxActions();
  const fx = fxQuery.data ?? null;
  const view = fxLineView(fx, fxInstant);
  const busy = actions.refresh.isPending || actions.clearOverride.isPending;

  const refresh = async () => {
    try {
      const result = await actions.refresh.mutateAsync();
      if (result.error) toast.warning(t("fxRefreshPartial", { error: result.error }));
      else toast.success(t("fxRefreshed"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("fxRefreshError")));
    }
  };

  const backToStripe = async () => {
    try {
      await actions.clearOverride.mutateAsync();
    } catch (error) {
      toast.error(getErrorMessage(error, t("fxOverrideError")));
    }
  };

  return (
    <div className="border-b border-hairline/60 px-4 py-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">{t("fxRateLabel")}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{t("fxRateHint")}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className={cn("text-[13px] font-medium tabular-nums", view?.tone === "warning" ? "text-warning" : "text-ink")}>
            {view ? view.rate : `${numberFormatter.format(fallbackRate)} VND/USD`}
          </span>
          {view ? (
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {view.asOf ? t("fxSourceAsOf", { source: view.source, asOf: view.asOf }) : view.source}
            </p>
          ) : fxQuery.isError ? (
            <p className="mt-0.5 text-[11px] text-warning">{t("fxStatusUnavailable")}</p>
          ) : null}
        </div>
      </div>

      {view?.warning ? (
        <p role="status" className="mt-2 flex items-start gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-[12px] text-warning">
          <Warning size={14} className="mt-0.5 shrink-0" />
          {view.warning}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={busy || !fx} onClick={() => void refresh()}>
          <ArrowsClockwise size={14} />
          {actions.refresh.isPending ? t("fxRefreshing") : t("fxRefresh")}
        </Button>
        {/* The rate is Stripe's. A manual rate set before that rule can still be cleared here. */}
        {fx?.mode === "manual" ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void backToStripe()}>
            {t("fxUseStripe")}
          </Button>
        ) : null}
        {fx?.mode === "manual" && fx.latestStripe ? (
          <span className="text-[11px] text-ink-muted">
            {t("fxStripeWouldBe", { rate: numberFormatter.format(fx.latestStripe.rate), date: fx.latestStripe.rateDate })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PricingEconomicsPanel() {
  const t = useTranslations("adminPlansSettings.settings.pricingEconomics");
  const configQuery = useAdminPricingConfig();
  const updateConfig = useUpdateAdminPricingConfig();
  const [isEditing, setIsEditing] = useState(false);
  const config = configQuery.data ?? null;

  return (
    <>
      <AdminPanel className="mt-3">
        {configQuery.isError ? (
          <PanelError what={t("errorWhat")} onRetry={() => void configQuery.refetch()} />
        ) : configQuery.isPending || !config ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-9 animate-pulse rounded bg-surface-2" />
            ))}
          </div>
        ) : (
          <>
            <FxRateRow fallbackRate={config.fxRateUsdVnd} />
            {/* Framed like the FX rate beside it: a conversion Insights applies to a measured
                quantity, not a price anyone is charged. */}
            <SettingRow label={t("cartesiaUsdPerCreditLabel")} hint={t("cartesiaUsdPerCreditHint")}>
              <span className="text-[13px] tabular-nums text-ink">
                {config.cartesiaUsdPerCredit == null
                  ? "—"
                  : t("cartesiaUsdPerCreditValue", {
                      price: usdPerCreditFormatter.format(config.cartesiaUsdPerCredit),
                    })}
              </span>
            </SettingRow>
            {/* WT-690: no credit value or per-credit price floor here. Stripe owns customer
                prices; both values are still read by billing (top-up pricing, plan/contract floor),
                so they stay stored and change by migration, not from this page. */}
            <SettingRow label={t("minimumContractPriceLabel")} hint={t("minimumContractPriceHint")}>
              <span className="text-[13px] tabular-nums text-ink">
                {t("minimumContractPriceValue", {
                  vnd: numberFormatter.format(config.minimumContractPriceVnd),
                  usd: numberFormatter.format(config.minimumContractPriceUsd),
                })}
              </span>
            </SettingRow>
            <SettingRow
              label={t("defaultInvoiceTermsLabel")}
              hint={t("defaultInvoiceTermsHint")}
            >
              <span className="text-[13px] tabular-nums text-ink">
                {t("defaultInvoiceTermsValue", {
                  days: config.defaultInvoiceTermsDays,
                  hours: config.defaultInvoiceGraceHours,
                })}
              </span>
            </SettingRow>
          </>
        )}
      </AdminPanel>

      <PricingConfigDialog
        config={isEditing ? config : null}
        open={isEditing}
        onOpenChange={setIsEditing}
        onSubmit={(request) => updateConfig.mutateAsync(request)}
        isSaving={updateConfig.isPending}
      />

      {config ? (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <PencilSimple size={14} />
            {t("editButton")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function usageText(
  row: AdminSupportedLanguageDto,
  t: ReturnType<typeof useTranslations>,
): { text: string; live: boolean } {
  const live = row.liveMeetings ?? 0;
  const upcoming = row.upcomingMeetings ?? 0;
  if (live > 0) return { text: t("manage.usageLive", { count: live }), live: true };
  if (upcoming > 0) return { text: t("manage.usageUpcoming", { count: upcoming }), live: false };
  return { text: t("manage.usageNone"), live: false };
}

function LanguageCatalogPanel() {
  const t = useTranslations("adminPlansSettings.settings.languageCatalog");
  const languagesQuery = useAdminLanguageCatalog();
  const comparison = useMemo(
    () => (languagesQuery.data ? compareLanguageCatalog(languagesQuery.data) : null),
    [languagesQuery.data],
  );
  // WT-691: add / edit / enable / disable. `formLanguage` undefined = closed, null = add.
  const [formLanguage, setFormLanguage] = useState<AdminSupportedLanguageDto | null | undefined>(undefined);
  const [toggleLanguage, setToggleLanguage] = useState<AdminSupportedLanguageDto | null>(null);
  const catalog = languagesQuery.data ?? [];
  const activeCount = catalog.filter((language) => language.isActive).length;

  return (
    <>
      <div className="mt-2 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFormLanguage(null)}
          disabled={!languagesQuery.data}
        >
          <Plus size={14} />
          {t("manage.add")}
        </Button>
      </div>

      {/* The drift banner. languages.ts has warned in a comment since it was written that its
          rows and the server catalog can diverge; nothing has ever checked. This is that check,
          run against live data. */}
      {comparison && comparison.offeredButNotSupported.length > 0 ? (
        <AdminPanel className="mb-3 mt-3 border-destructive/30 bg-destructive/5">
          <div className="flex items-start gap-3 px-4 py-3 text-[13px]">
            <Warning size={16} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">
                {t("driftTitle", { count: comparison.offeredButNotSupported.length })}
              </p>
              <p className="mt-1 text-ink-muted">
                {t("driftBody", {
                  names: comparison.offeredButNotSupported.map((entry) => entry.name).join(", "),
                })}
              </p>
            </div>
          </div>
        </AdminPanel>
      ) : null}

      <AdminPanel className={comparison && comparison.offeredButNotSupported.length > 0 ? "" : "mt-3"}>
        {languagesQuery.isError ? (
          <PanelError what={t("errorWhat")} onRetry={() => void languagesQuery.refetch()} />
        ) : languagesQuery.isPending ? (
          <ul>
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={index} className="border-b border-hairline/60 px-4 py-3 last:border-b-0">
                <div className="h-3 w-48 animate-pulse rounded bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : !comparison || comparison.rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-ink-muted">{t("empty")}</p>
        ) : (
          <>
            <div className="hidden border-b border-hairline/60 px-4 py-2 text-[11px] font-medium text-ink-muted md:flex">
              <span className="w-[70px]">{t("columns.code")}</span>
              <span className="flex-1">{t("columns.name")}</span>
              <span className="w-[150px]">{t("columns.native")}</span>
              <span className="w-[90px]">{t("columns.rooms")}</span>
              <span className="w-[110px]">{t("manage.columns.usage")}</span>
              <span className="w-[130px]">{t("columns.inThisApp")}</span>
              <span className="w-[150px]" aria-hidden />
            </div>
            <ul>
              {comparison.rows.map((row) => (
                <li
                  key={row.code}
                  className="flex flex-col gap-1 border-b border-hairline/60 px-4 py-2.5 text-[13px] last:border-b-0 md:flex-row md:items-center md:gap-0"
                >
                  <span className="w-[70px] shrink-0 font-mono text-[12px]">{row.code}</span>
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="w-[150px] shrink-0 truncate text-ink-muted">
                    {row.nativeName ?? "—"}
                  </span>
                  <span className="w-[90px] shrink-0">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        row.isActive
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-border bg-surface-2 text-ink-muted",
                      )}
                    >
                      {row.isActive ? t("badgeAllowed") : t("badgeOff")}
                    </span>
                  </span>
                  {(() => {
                    const usage = usageText(row, t);
                    return (
                      <span
                        className={cn(
                          "w-[110px] shrink-0 text-[12px] tabular-nums",
                          usage.live ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-ink-muted",
                        )}
                      >
                        {usage.text}
                      </span>
                    );
                  })()}
                  {/* Not shipped means every name this app renders for that language falls back
                      to the raw code — the user sees "de", not "German". */}
                  <span
                    className={cn(
                      "w-[130px] shrink-0 text-[12px]",
                      row.shippedInApp ? "text-ink-muted" : "font-medium text-amber-600",
                    )}
                  >
                    {row.shippedInApp
                      ? row.offeredForMeetings
                        ? t("shippedOffered")
                        : t("shippedKnown")
                      : t("shippedAsCode")}
                  </span>
                  <div className="flex w-[150px] shrink-0 items-center gap-1.5 md:justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setFormLanguage(row)}>
                      {t("manage.edit")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setToggleLanguage(row)}>
                      {row.isActive ? t("manage.disable") : t("manage.enable")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminPanel>

      <LanguageFormDialog
        open={formLanguage !== undefined}
        language={formLanguage ?? null}
        catalog={catalog}
        onOpenChange={(open) => {
          if (!open) setFormLanguage(undefined);
        }}
      />
      <LanguageToggleDialog
        language={toggleLanguage}
        activeCount={activeCount}
        onOpenChange={(open) => {
          if (!open) setToggleLanguage(null);
        }}
      />

      <p className="mt-2 text-[12px] text-ink-muted">
        {t.rich("footnote", {
          code1: (chunks) => <span className="font-mono">{chunks}</span>,
          code2: (chunks) => <span className="font-mono">{chunks}</span>,
        })}
      </p>
    </>
  );
}

function VoiceConsentPanel({ summary }: { summary: AdminVoiceConsentSummaryDto }) {
  const t = useTranslations("adminPlansSettings.settings.voiceConsent");
  const granted = summary.byStatus
    .filter((row) => row.status === "GRANTED")
    .reduce((total, row) => total + row.people, 0);
  const outdated = summary.currentGrantsByTextVersion.filter(
    (row) => row.textVersion !== summary.currentTextVersion,
  );

  return (
    <div className="px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {summary.byStatus.length === 0 ? (
          <p className="text-[12px] text-ink-muted sm:col-span-3">{t("nobodyAsked")}</p>
        ) : (
          summary.byStatus.map((row) => (
            <div key={`${row.consentType}-${row.status}`}>
              <p className="text-[11px] font-medium text-ink-muted">{row.status.toLowerCase()}</p>
              <p className="mt-0.5 text-[22px] font-semibold leading-none tabular-nums">
                {numberFormatter.format(row.people)}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-subtle">
                {/* People, not rows. The table is append-only, so counting rows would count
                    everyone who has ever agreed — including those who withdrew. */}
                {t("peopleCurrentDecision")}
              </p>
            </div>
          ))
        )}
      </div>

      {granted > 0 ? (
        <div className="mt-5 border-t border-hairline/60 pt-4">
          <p className="text-[11px] font-medium text-ink-muted">{t("liveGrantsHeading")}</p>
          <ul className="mt-2 space-y-1.5">
            {summary.currentGrantsByTextVersion.map((row) => {
              const current = row.textVersion === summary.currentTextVersion;
              return (
                <li
                  key={row.textVersion}
                  className="flex items-center justify-between gap-3 text-[13px]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-mono text-[12px]">{row.textVersion}</span>
                    {current ? (
                      <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                        {t("current")}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        {t("superseded")}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-ink-muted">
                    {numberFormatter.format(row.people)}
                  </span>
                </li>
              );
            })}
          </ul>
          {outdated.length > 0 ? (
            <p className="mt-3 text-[12px] text-ink-muted">
              {/* The question the version column was added to answer. */}
              {t("outdatedNotice", {
                count: outdated.reduce((total, row) => total + row.people, 0),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminSettingsPage() {
  const t = useTranslations("adminPlansSettings.settings");
  const languagesQuery = useAdminLanguageCatalog();
  const consentQuery = useAdminVoiceConsentSummary();

  const isRefreshing = languagesQuery.isFetching || consentQuery.isFetching;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<GearSix size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void languagesQuery.refetch();
              void consentQuery.refetch();
            }}
            disabled={isRefreshing}
          >
            <ArrowsClockwise size={14} className={cn(isRefreshing && "animate-spin")} />
            {t("refresh")}
          </Button>
        }
      />

      <Band title={t("bandKnobs.title")} note={t("bandKnobs.note")} />

      <h3 className="mt-4 text-sm font-semibold text-ink">{t("billingPolicyHeading")}</h3>
      <BillingPolicyPanel />

      <h3 className="mt-6 text-sm font-semibold text-ink">{t("pricingEconomicsHeading")}</h3>
      <p className="mt-1 text-xs text-ink-muted">{t("pricingEconomicsSubnote")}</p>
      <PricingEconomicsPanel />

      <Band title={t("bandReference.title")} note={t("bandReference.note")} />

      <AdminPanel className="mt-3 border-border bg-surface-2/40">
        <p className="px-4 py-3 text-[12.5px] leading-relaxed text-ink-muted">
          {t.rich("explainer", { strong: (chunks) => <span className="font-medium text-ink">{chunks}</span> })}
        </p>
      </AdminPanel>

      <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-ink">
        <Globe size={14} weight="duotone" />
        {t("languageCatalogHeading")}
      </h3>
      <LanguageCatalogPanel />

      <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-ink">
        <Microphone size={14} weight="duotone" />
        {t("voiceConsentHeading")}
        {consentQuery.data ? (
          <span className="ml-1 text-[11px] font-normal text-ink-muted">
            {t("voiceConsentCount", { count: consentQuery.data.totalDecisions })}
          </span>
        ) : null}
      </h3>

      <AdminPanel className="mt-3">
        {consentQuery.isError ? (
          <PanelError what={t("voiceConsent.errorWhat")} onRetry={() => void consentQuery.refetch()} />
        ) : consentQuery.isPending ? (
          <div className="px-4 py-6">
            <div className="h-16 animate-pulse rounded bg-surface-2" />
          </div>
        ) : !consentQuery.data ? null : (
          <VoiceConsentPanel summary={consentQuery.data} />
        )}
      </AdminPanel>

      <p className="mt-4 text-[12px] text-ink-muted">{t("footerNote")}</p>
    </AdminPage>
  );
}
