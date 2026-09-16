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
 * What is read-only here is read-only for a reason that has not changed: neither service behind
 * the catalog or the consent ledger can record WHO threw a switch, so those move by migration,
 * where the change is reviewed and has an author.
 */

import { useMemo, useState } from "react";
import {
  ArrowsClockwise,
  GearSix,
  Globe,
  Microphone,
  PencilSimple,
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
import { compareLanguageCatalog } from "@/lib/language/catalog-drift";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminVoiceConsentSummaryDto } from "@/types/admin-configuration";

const numberFormatter = new Intl.NumberFormat("en-US");

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
  return (
    <div className="flex items-start gap-3 px-4 py-8 text-sm">
      <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
      <div>
        <p className="font-medium">{what} could not be loaded.</p>
        <p className="mt-1 text-ink-muted">
          Check the service and that your session still holds the platform admin role.
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

function BillingPolicyPanel() {
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
      toast.success("Billing policy saved.");
    } catch (error) {
      toast.error(getErrorMessage(error, "The billing policy could not be saved."));
    }
  };

  return (
    <AdminPanel className="mt-3">
      {policyQuery.isError ? (
        <PanelError what="The billing policy" onRetry={() => void policyQuery.refetch()} />
      ) : (
        <SettingRow
          label="VAT rate"
          hint="Applied to every invoice the platform raises. A fraction: 0.1 is 10%."
        >
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(event) => setDraft(event.target.value)}
              inputMode="decimal"
              disabled={policyQuery.isPending || updatePolicy.isPending}
              aria-label="VAT rate"
              className="h-9 w-28 text-right tabular-nums"
            />
            <Button
              size="sm"
              disabled={!isDirty || !isValid || updatePolicy.isPending}
              onClick={() => void save()}
            >
              {updatePolicy.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </SettingRow>
      )}
    </AdminPanel>
  );
}

function PricingEconomicsPanel() {
  const configQuery = useAdminPricingConfig();
  const updateConfig = useUpdateAdminPricingConfig();
  const [isEditing, setIsEditing] = useState(false);
  const config = configQuery.data ?? null;

  return (
    <>
      <AdminPanel className="mt-3">
        {configQuery.isError ? (
          <PanelError
            what="The pricing configuration"
            onRetry={() => void configQuery.refetch()}
          />
        ) : configQuery.isPending || !config ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-9 animate-pulse rounded bg-surface-2" />
            ))}
          </div>
        ) : (
          <>
            <SettingRow label="FX rate (USD → VND)" hint="Reads a USD provider cost in VND terms.">
              <span className="text-[13px] tabular-nums text-ink">
                {numberFormatter.format(config.fxRateUsdVnd)}
              </span>
            </SettingRow>
            <SettingRow label="Credit value" hint="What one credit costs a customer, in VND.">
              <span className="text-[13px] tabular-nums text-ink">
                {numberFormatter.format(config.creditValueVnd)} ₫
              </span>
            </SettingRow>
            <SettingRow
              label="Minimum price per credit"
              hint="The plan validator's price floor — a VND plan cannot sell credits below this."
            >
              <span className="text-[13px] tabular-nums text-ink">
                {numberFormatter.format(config.minimumPricePerCreditVnd)} ₫
              </span>
            </SettingRow>
            <SettingRow label="Minimum contract price" hint="Per cycle, before a plan is valid.">
              <span className="text-[13px] tabular-nums text-ink">
                {numberFormatter.format(config.minimumContractPriceVnd)} ₫ ·{" "}
                {numberFormatter.format(config.minimumContractPriceUsd)} $
              </span>
            </SettingRow>
            <SettingRow
              label="Default invoice terms"
              hint="Days to pay, and the grace window after that, for plans that do not override them."
            >
              <span className="text-[13px] tabular-nums text-ink">
                {config.defaultInvoiceTermsDays} days · {config.defaultInvoiceGraceHours} h grace
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
            Edit pricing economics
          </Button>
        </div>
      ) : null}
    </>
  );
}

function LanguageCatalogPanel() {
  const languagesQuery = useAdminLanguageCatalog();
  const comparison = useMemo(
    () => (languagesQuery.data ? compareLanguageCatalog(languagesQuery.data) : null),
    [languagesQuery.data],
  );

  return (
    <>
      {/* The drift banner. languages.ts has warned in a comment since it was written that its
          rows and the server catalog can diverge; nothing has ever checked. This is that check,
          run against live data. */}
      {comparison && comparison.offeredButNotSupported.length > 0 ? (
        <AdminPanel className="mb-3 mt-3 border-destructive/30 bg-destructive/5">
          <div className="flex items-start gap-3 px-4 py-3 text-[13px]">
            <Warning size={16} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">
                The meeting picker offers {comparison.offeredButNotSupported.length} language
                {comparison.offeredButNotSupported.length === 1 ? "" : "s"} this catalog will
                reject.
              </p>
              <p className="mt-1 text-ink-muted">
                {comparison.offeredButNotSupported.map((entry) => entry.name).join(", ")} — anyone
                choosing one gets &ldquo;Source language is not supported.&rdquo; Either seed the
                row or drop it from the picker.
              </p>
            </div>
          </div>
        </AdminPanel>
      ) : null}

      <AdminPanel className={comparison && comparison.offeredButNotSupported.length > 0 ? "" : "mt-3"}>
        {languagesQuery.isError ? (
          <PanelError what="The language catalog" onRetry={() => void languagesQuery.refetch()} />
        ) : languagesQuery.isPending ? (
          <ul>
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={index} className="border-b border-hairline/60 px-4 py-3 last:border-b-0">
                <div className="h-3 w-48 animate-pulse rounded bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : !comparison || comparison.rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] text-ink-muted">
            The catalog is empty — no room in any language can be created.
          </p>
        ) : (
          <>
            <div className="hidden border-b border-hairline/60 px-4 py-2 text-[11px] font-medium text-ink-muted md:flex">
              <span className="w-[70px]">Code</span>
              <span className="flex-1">Name</span>
              <span className="w-[150px]">Native</span>
              <span className="w-[90px]">Rooms</span>
              <span className="w-[130px]">In this app</span>
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
                      {row.isActive ? "allowed" : "off"}
                    </span>
                  </span>
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
                        ? "offered"
                        : "known"
                      : "renders as a code"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminPanel>

      <p className="mt-2 text-[12px] text-ink-muted">
        This is <span className="font-mono">translation_room.supported_languages</span>, the table
        room validation queries — not <span className="font-mono">platform.supported_languages</span>,
        which the seed script still writes and nothing validates against since migration 036.
      </p>
    </>
  );
}

function VoiceConsentPanel({ summary }: { summary: AdminVoiceConsentSummaryDto }) {
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
          <p className="text-[12px] text-ink-muted sm:col-span-3">
            Nobody has been asked for voice consent yet.
          </p>
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
                people, current decision
              </p>
            </div>
          ))
        )}
      </div>

      {granted > 0 ? (
        <div className="mt-5 border-t border-hairline/60 pt-4">
          <p className="text-[11px] font-medium text-ink-muted">
            Live grants by the wording agreed to
          </p>
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
                        current
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        superseded
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
              {numberFormatter.format(outdated.reduce((total, row) => total + row.people, 0))} live
              grant
              {outdated.reduce((total, row) => total + row.people, 0) === 1 ? " was" : "s were"}{" "}
              given under wording that has since been replaced. Consent stays valid for what it
              said at the time — this is the count to re-ask if the change was material.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminSettingsPage() {
  const languagesQuery = useAdminLanguageCatalog();
  const consentQuery = useAdminVoiceConsentSummary();

  const isRefreshing = languagesQuery.isFetching || consentQuery.isFetching;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Configuration"
        eyebrowIcon={<GearSix size={14} weight="fill" />}
        title="Platform settings"
        description="Everything the platform runs on, in the order you can act on it: the knobs you can turn, then the reference data you can only read."
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
            Refresh
          </Button>
        }
      />

      <Band
        title="Knobs you can turn"
        note="Saved from this page, applied platform-wide, recorded against your account."
      />

      <h3 className="mt-4 text-sm font-semibold text-ink">Billing policy</h3>
      <BillingPolicyPanel />

      <h3 className="mt-6 text-sm font-semibold text-ink">Pricing economics</h3>
      <p className="mt-1 text-xs text-ink-muted">
        The same configuration the plan validator and the rate-card margin reader consult — also
        reachable from Plans &amp; pricing.
      </p>
      <PricingEconomicsPanel />

      <Band title="Reference data" note="Read-only here — these change by migration." />

      <AdminPanel className="mt-3 border-border bg-surface-2/40">
        <p className="px-4 py-3 text-[12.5px] leading-relaxed text-ink-muted">
          <span className="font-medium text-ink">Why there is nothing to click below.</span>{" "}
          Neither service behind this data can record who changed it. A switch here would let
          someone alter what every meeting validates against with no name against the change, so
          these move by migration, where the change is reviewed and has an author.
        </p>
      </AdminPanel>

      <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-ink">
        <Globe size={14} weight="duotone" />
        Language catalog
      </h3>
      <LanguageCatalogPanel />

      <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-ink">
        <Microphone size={14} weight="duotone" />
        Voice clone consent
        {consentQuery.data ? (
          <span className="ml-1 text-[11px] font-normal text-ink-muted">
            {numberFormatter.format(consentQuery.data.totalDecisions)} decisions recorded
          </span>
        ) : null}
      </h3>

      <AdminPanel className="mt-3">
        {consentQuery.isError ? (
          <PanelError what="Voice consent" onRetry={() => void consentQuery.refetch()} />
        ) : consentQuery.isPending ? (
          <div className="px-4 py-6">
            <div className="h-16 animate-pulse rounded bg-surface-2" />
          </div>
        ) : !consentQuery.data ? null : (
          <VoiceConsentPanel summary={consentQuery.data} />
        )}
      </AdminPanel>

      <p className="mt-4 text-[12px] text-ink-muted">
        Counts only, and that is a boundary rather than a shortcut. A cloned voice is biometric
        data; a list of who agreed to it would be a register of biometric permissions, and nothing
        on this screen acts on a person.
      </p>
    </AdminPage>
  );
}
