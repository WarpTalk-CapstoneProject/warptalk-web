"use client";

import type { ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { enUS, ja, vi } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { DeviceMobile, Desktop } from "@phosphor-icons/react";

import { describeSessionDevice } from "@/lib/auth/describe-session-device";

const DATE_FNS_LOCALES = { en: enUS, vi, ja };

function relative(iso: string, locale: keyof typeof DATE_FNS_LOCALES, unknownLabel: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? unknownLabel
    : formatDistanceToNow(date, { addSuffix: true, locale: DATE_FNS_LOCALES[locale] });
}

function absolute(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(locale);
}

/**
 * One signed-in session: device, IP, when it was last active and signed in, when it expires.
 *
 * Presentation only — the action slot is the caller's, so the same row can serve the personal
 * Sessions page (Revoke / Sign out) and an admin view of someone else's sessions (no action, or a
 * different one). Never shows or receives the token itself.
 */
export function SessionRow({
  deviceInfo,
  ipAddress,
  signedInAt,
  lastActiveAt,
  expiresAt,
  isCurrent = false,
  action,
}: {
  deviceInfo: string | null;
  ipAddress: string | null;
  signedInAt: string;
  /** Omitted where the source has no separate activity time (the admin DTO's createdAt). */
  lastActiveAt?: string;
  expiresAt: string;
  isCurrent?: boolean;
  action?: ReactNode;
}) {
  const t = useTranslations("settingsSessions.row");
  const tRoot = useTranslations("settingsSessions");
  const locale = useLocale() as keyof typeof DATE_FNS_LOCALES;
  const device = describeSessionDevice(deviceInfo, (key, values) => tRoot(`deviceLabel.${key}`, values));
  const Icon = device.mobile ? DeviceMobile : Desktop;
  const unknownLabel = t("unknown");

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-2 text-ink-muted">
          <Icon size={16} weight="duotone" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink">
            <span className="truncate" title={deviceInfo ?? undefined}>
              {device.label}
            </span>
            {isCurrent && (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {t("thisDevice")}
              </span>
            )}
          </span>
          <span className="text-[11px] text-ink-muted">
            {ipAddress || t("unknownIp")}
            {lastActiveAt ? (
              <>
                {" · "}
                <span title={absolute(lastActiveAt, locale)}>
                  {t("lastActive", { when: relative(lastActiveAt, locale, unknownLabel) })}
                </span>
              </>
            ) : null}
          </span>
          <span className="text-[11px] text-ink-subtle">
            <span title={absolute(signedInAt, locale)}>
              {t("signedIn", { when: relative(signedInAt, locale, unknownLabel) })}
            </span>
            {" · "}
            <span title={absolute(expiresAt, locale)}>
              {t("expires", { when: relative(expiresAt, locale, unknownLabel) })}
            </span>
          </span>
        </div>
      </div>
      {action ? <div className="shrink-0 self-end sm:self-center">{action}</div> : null}
    </div>
  );
}
