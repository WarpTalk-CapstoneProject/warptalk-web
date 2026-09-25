"use client";

/**
 * Data & retention — an honest account, not a settings form.
 *
 * The registry has no retention keys because no backend job deletes anything by age yet, and a
 * retention setting nobody enforces would be a switch wired to nothing: an operator would set
 * "90 days", believe it, and the data would stay forever. So this lists what is and is not enforced
 * today. A retention setting is added to the registry together with the job that enforces it.
 */

import { useTranslations } from "next-intl";
import { CheckCircle, Info, XCircle } from "@phosphor-icons/react/dist/ssr";

import { AdminPanel } from "@/components/admin/admin-page-chrome";

const ENFORCED = ["streamTtl"] as const;
const NOT_ENFORCED = ["transcripts", "recordings", "auditLog", "workspaceRetention"] as const;

export function RetentionPanel() {
  const t = useTranslations("adminPlatformSettings.retention");
  return (
    <>
      <AdminPanel className="border-border bg-surface-2/40">
        <p className="flex items-start gap-2 px-4 py-3 text-[12.5px] leading-relaxed text-ink-muted">
          <Info size={15} weight="duotone" className="mt-0.5 shrink-0" />
          {t("intro")}
        </p>
      </AdminPanel>

      <h3 className="mt-5 text-[13px] font-semibold text-ink">{t("notEnforcedHeading")}</h3>
      <AdminPanel className="mt-2">
        <ul>
          {NOT_ENFORCED.map((item) => (
            <li key={item} className="flex items-start gap-3 border-b border-hairline/60 px-4 py-3 last:border-b-0">
              <XCircle size={16} weight="duotone" className="mt-0.5 shrink-0 text-warning" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{t(`items.${item}.title`)}</p>
                <p className="mt-0.5 text-[12px] leading-5 text-ink-muted">{t(`items.${item}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </AdminPanel>

      <h3 className="mt-5 text-[13px] font-semibold text-ink">{t("enforcedHeading")}</h3>
      <AdminPanel className="mt-2">
        <ul>
          {ENFORCED.map((item) => (
            <li key={item} className="flex items-start gap-3 px-4 py-3">
              <CheckCircle size={16} weight="duotone" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{t(`items.${item}.title`)}</p>
                <p className="mt-0.5 text-[12px] leading-5 text-ink-muted">{t(`items.${item}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </AdminPanel>
      <p className="mt-3 text-[12px] text-ink-muted">{t("footnote")}</p>
    </>
  );
}
