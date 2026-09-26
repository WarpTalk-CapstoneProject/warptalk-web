"use client";

/**
 * Integrations — whether each external service is configured, as the services themselves report
 * it, never with the value: secrets and endpoints stay in deploy configuration and never reach this
 * page. A manager can run a live connection test where the server offers one. Below, the
 * deploy-time configuration worth seeing (CORS origins and the like), read-only.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowSquareOut, CheckCircle, Lightning, Question, WarningCircle, XCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useAdminPlatformIntegrations, useAdminPlatformSettingsActions } from "@/hooks/use-admin-platform-settings";
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { PlatformIntegrationDto } from "@/types/admin-platform-settings";

import { useSettingsCopy } from "./settings-i18n";

export function IntegrationsPanel({ canManage }: { canManage: boolean }) {
  const t = useTranslations("adminPlatformSettings.integrations");
  const copy = useSettingsCopy();
  const query = useAdminPlatformIntegrations();
  const actions = useAdminPlatformSettingsActions();

  const test = async (integration: PlatformIntegrationDto) => {
    try {
      const result = await actions.testIntegration.mutateAsync(integration.key);
      if (result.ok) {
        toast.success(t("testOk", { name: integration.name, latency: result.latencyMs ?? "—" }));
      } else {
        toast.error(t("testFailed", { name: integration.name, detail: result.detail ?? t("noDetail") }));
      }
    } catch (error) {
      toast.error(getErrorMessage(error, t("testError", { name: integration.name })));
    }
  };

  if (query.isPending) {
    return (
      <AdminPanel>
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-9 animate-pulse rounded bg-surface-2" />
          ))}
        </div>
      </AdminPanel>
    );
  }

  if (query.isError || !query.data) {
    const missing = apiErrorCode(query.error) === 404 || apiErrorCode(query.error) === "NOT_FOUND";
    return (
      <AdminPanel>
        <div className="flex items-start gap-3 px-4 py-6 text-[13px]">
          <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-ink-muted" />
          <div>
            <p className="font-medium text-ink">{missing ? t("unavailable") : t("error")}</p>
            {!missing ? (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
                {t("retry")}
              </Button>
            ) : null}
          </div>
        </div>
      </AdminPanel>
    );
  }

  const { integrations, deployConfig } = query.data;

  return (
    <>
      <AdminPanel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <caption className="sr-only">{t("title")}</caption>
            <thead>
              <tr className="border-b border-hairline text-[11px] font-medium text-ink-muted">
                <th scope="col" className="px-4 py-2 font-medium">{t("columns.name")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("columns.configured")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("columns.services")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("columns.lastCheck")}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  <span className="sr-only">{t("columns.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {integrations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[12px] text-ink-muted">
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                integrations.map((integration) => (
                  <tr key={integration.key} className="border-b border-hairline/60 align-top last:border-b-0">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink">{integration.name}</p>
                      <p className="font-mono text-[11px] text-ink-subtle">{integration.key}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <ConfiguredPill configured={integration.configured} />
                    </td>
                    <td className="px-3 py-2.5">
                      {integration.services.length ? (
                        <ul className="space-y-0.5 text-[12px]">
                          {integration.services.map((service) => (
                            <li key={service.service} className="flex items-center gap-1.5">
                              {service.configured ? (
                                <CheckCircle size={12} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <XCircle size={12} weight="fill" className="text-warning" />
                              )}
                              <span className="text-ink">{service.service}</span>
                              {service.detail ? <span className="truncate text-ink-subtle">· {service.detail}</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-[12px] text-ink-subtle">{t("noReports")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">
                      {integration.lastCheck ? (
                        <Tooltip content={integration.lastCheck.detail ?? null}>
                          <span className={cn("inline-flex flex-col", integration.lastCheck.ok ? "text-ink" : "text-destructive")}>
                            <span>
                              {integration.lastCheck.ok
                                ? t("checkOk", { latency: integration.lastCheck.latencyMs ?? "—" })
                                : t("checkFailed")}
                            </span>
                            <span className="text-[11px] text-ink-subtle">{copy.dateTime(integration.lastCheck.at)}</span>
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="text-ink-subtle">{t("never")}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {integration.testable && canManage ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actions.testIntegration.isPending}
                            onClick={() => void test(integration)}
                          >
                            <Lightning size={13} />
                            {actions.testIntegration.isPending && actions.testIntegration.variables === integration.key
                              ? t("testing")
                              : t("test")}
                          </Button>
                        ) : null}
                        {integration.href ? (
                          <Link
                            href={integration.href}
                            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-ink-muted hover:bg-surface-2 hover:text-ink"
                          >
                            {t("open")}
                            <ArrowSquareOut size={12} />
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AdminPanel>
      <p className="mt-2 text-[12px] text-ink-muted">{t("secretsNote")}</p>

      <h3 className="mt-6 text-[13px] font-semibold text-ink">{t("deployConfig.title")}</h3>
      <p className="mt-0.5 text-[12px] text-ink-muted">{t("deployConfig.description")}</p>
      <AdminPanel className="mt-2">
        {deployConfig.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-ink-muted">{t("deployConfig.empty")}</p>
        ) : (
          <dl>
            {deployConfig.map((entry) => (
              <div
                key={`${entry.service}:${entry.key}`}
                className="flex flex-col gap-1 border-b border-hairline/60 px-4 py-2.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <dt className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{entry.label}</p>
                  <p className="font-mono text-[11px] text-ink-subtle">
                    {entry.service} · {entry.key}
                  </p>
                </dt>
                <dd className="min-w-0 text-[12px] sm:max-w-[55%] sm:text-right">
                  {!entry.configured || entry.value === null ? (
                    <span className="text-ink-subtle">{t("deployConfig.notSet")}</span>
                  ) : Array.isArray(entry.value) ? (
                    <span className="flex flex-wrap gap-1 sm:justify-end">
                      {entry.value.map((item) => (
                        <span key={item} className="rounded border border-hairline bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink">
                          {item}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="break-all font-mono text-[11px] text-ink">{entry.value}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </AdminPanel>
    </>
  );
}

function ConfiguredPill({ configured }: { configured: boolean | null }) {
  const t = useTranslations("adminPlatformSettings.integrations");
  if (configured === null) {
    return (
      <Tooltip content={t("unknownHint")}>
        <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
          <Question size={11} />
          {t("unknown")}
        </span>
      </Tooltip>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        configured
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      {configured ? t("configured") : t("notConfigured")}
    </span>
  );
}
