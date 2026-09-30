"use client";

/**
 * Small pieces the audit table and the detail drawer share, so an entry reads the same way in
 * both: the action pill, the result badge, the timestamp and a copyable id.
 */

import { useState } from "react";
import { Check, CopySimple } from "@phosphor-icons/react/dist/ssr";
import { useLocale, useTranslations } from "next-intl";

import { Tooltip } from "@/components/ui/tooltip";
import { auditActionLabel, auditActionTone } from "@/lib/admin/audit-log";
import { cn } from "@/lib/utils";

/** next-intl's `t` as the lib's optional translator: a missing key falls back to English. */
export function useAuditTranslator() {
  const t = useTranslations("adminMisc.audit");
  return (key: string) => (t.has(key) ? t(key) : undefined);
}

export function AuditActionPill({ action, className }: { action: string; className?: string }) {
  const translate = useAuditTranslator();
  const tone = auditActionTone(action);
  // The stored verb is on hover: it is what the filter and the CSV say, and what a support
  // ticket will quote.
  return (
    <Tooltip content={<code className="font-mono">{action}</code>}>
      {/* Not a tab stop: fifty rows of pills would be fifty stops, and the drawer says it all. */}
      <span
        tabIndex={-1}
        className={cn(
          "inline-flex max-w-full items-center truncate rounded-md border px-1.5 py-0.5 text-[12px] font-medium",
          tone === "danger" && "border-destructive/25 bg-destructive/10 text-destructive",
          tone === "warning" && "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          tone === "neutral" && "border-border bg-surface-2 text-ink",
          className,
        )}
      >
        {auditActionLabel(action, translate)}
      </span>
    </Tooltip>
  );
}

/**
 * Succeeded or failed, said in words and colour both. A failed attempt is still a recorded action
 * and usually the more interesting one; the badge is what stops it reading as a change.
 */
export function AuditResultBadge({ result }: { result: string }) {
  const t = useTranslations("adminMisc.audit.result");
  const failed = result !== "succeeded";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        failed
          ? "border-destructive/25 bg-destructive/10 text-destructive"
          : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", failed ? "bg-destructive" : "bg-emerald-500")}
      />
      {failed ? t("failed") : t("succeeded")}
    </span>
  );
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export function formatAuditRelative(value: string, locale: string, now: number = Date.now()) {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(0, "second");
}

export function formatAuditAbsolute(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

/** "3 minutes ago", with the exact local time (and zone) on hover and focus. */
export function AuditWhen({ value, className }: { value: string; className?: string }) {
  const locale = useLocale();
  return (
    <Tooltip content={formatAuditAbsolute(value, locale)}>
      <time dateTime={value} tabIndex={-1} className={cn("whitespace-nowrap", className)}>
        {formatAuditRelative(value, locale)}
      </time>
    </Tooltip>
  );
}

export function CopyValue({ value, label, className }: { value: string; label?: string; className?: string }) {
  const t = useTranslations("adminMisc.audit.detail");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission refused: the value is on screen and selectable, which is enough.
    }
  };

  return (
    <span className={cn("flex min-w-0 max-w-full items-center gap-1.5", className)}>
      <code className="min-w-0 truncate font-mono text-[12px] text-ink">
        {label ?? value}
      </code>
      <Tooltip content={copied ? t("copied") : t("copy")}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void copy();
          }}
          aria-label={`${t("copy")} ${value}`}
          className="grid size-6 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {copied ? <Check size={13} weight="bold" /> : <CopySimple size={13} />}
        </button>
      </Tooltip>
    </span>
  );
}
