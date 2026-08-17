"use client";

import { useMemo } from "react";
import {
  ArrowsClockwise,
  Globe,
  Microphone,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import {
  useAdminLanguageCatalog,
  useAdminVoiceConsentSummary,
} from "@/hooks/use-admin-configuration";
import { compareLanguageCatalog } from "@/lib/language/catalog-drift";
import { cn } from "@/lib/utils";
import type { AdminVoiceConsentSummaryDto } from "@/types/admin-configuration";

const numberFormatter = new Intl.NumberFormat("en-US");

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">{children}</h2>
      {note ? <span className="text-[11px] text-ink-muted">{note}</span> : null}
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

export default function AdminConfigurationPage() {
  const languagesQuery = useAdminLanguageCatalog();
  const consentQuery = useAdminVoiceConsentSummary();

  const comparison = useMemo(
    () => (languagesQuery.data ? compareLanguageCatalog(languagesQuery.data) : null),
    [languagesQuery.data],
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Configuration"
        eyebrowIcon={<Globe size={14} weight="fill" />}
        title="Platform configuration"
        description="Reference data the platform runs on. Read-only — these change by migration, and neither service behind them can record who threw a switch."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void languagesQuery.refetch();
              void consentQuery.refetch();
            }}
            disabled={languagesQuery.isFetching || consentQuery.isFetching}
          >
            <ArrowsClockwise
              size={14}
              className={cn((languagesQuery.isFetching || consentQuery.isFetching) && "animate-spin")}
            />
            Refresh
          </Button>
        }
      />

      <SectionTitle
        note={comparison ? `${comparison.rows.length} in the catalog` : undefined}
      >
        <Globe size={14} weight="duotone" />
        Language catalog
      </SectionTitle>

      {/* The drift banner. languages.ts has warned in a comment since it was written that its
          rows and the server catalog can diverge; nothing has ever checked. This is that check,
          run against live data. */}
      {comparison && comparison.offeredButNotSupported.length > 0 ? (
        <AdminPanel className="mb-3 border-destructive/30 bg-destructive/5">
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

      <AdminPanel>
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

      <SectionTitle
        note={
          consentQuery.data
            ? `${numberFormatter.format(consentQuery.data.totalDecisions)} decisions recorded`
            : undefined
        }
      >
        <Microphone size={14} weight="duotone" />
        Voice clone consent
      </SectionTitle>

      <AdminPanel>
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
              <p className="text-[11px] font-medium text-ink-muted">
                {row.status.toLowerCase()}
              </p>
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
