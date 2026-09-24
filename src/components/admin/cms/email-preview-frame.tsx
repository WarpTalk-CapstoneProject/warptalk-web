"use client";

/**
 * An email rendered by the server — the same renderer and layout the senders use — shown the way
 * an inbox would: the subject and preheader line, then the body in a frame at desktop or phone
 * width, in the light or dark rendering, as HTML or as the plain-text part.
 *
 * `sandbox=""` gives the frame no scripts, no forms and no same-origin access, so an
 * admin-authored body can never act on the portal it is previewed in.
 */

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { DeviceMobile, Desktop, Moon, Sun } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";
import type { EmailPreviewDto } from "@/types/admin-cms";

export type PreviewDevice = "desktop" | "mobile";
export type PreviewFormat = "html" | "text";

export interface PreviewOptions {
  device: PreviewDevice;
  dark: boolean;
  format: PreviewFormat;
}

export const DEFAULT_PREVIEW_OPTIONS: PreviewOptions = { device: "desktop", dark: false, format: "html" };

function Segmented<T extends string | boolean>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center rounded-lg border border-border p-0.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-muted transition-colors hover:text-ink",
            value === option.value && "bg-surface-2 text-ink",
          )}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function PreviewControls({
  options,
  onChange,
  extra,
}: {
  options: PreviewOptions;
  onChange: (options: PreviewOptions) => void;
  extra?: ReactNode;
}) {
  const t = useTranslations("adminCms.common.preview");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label={t("device")}
        value={options.device}
        onChange={(device) => onChange({ ...options, device })}
        options={[
          { value: "desktop", label: t("desktop"), icon: <Desktop size={14} /> },
          { value: "mobile", label: t("mobile"), icon: <DeviceMobile size={14} /> },
        ]}
      />
      <Segmented
        label={t("theme")}
        value={options.dark}
        onChange={(dark) => onChange({ ...options, dark })}
        options={[
          { value: false, label: t("light"), icon: <Sun size={14} /> },
          { value: true, label: t("dark"), icon: <Moon size={14} /> },
        ]}
      />
      <Segmented
        label={t("format")}
        value={options.format}
        onChange={(format) => onChange({ ...options, format })}
        options={[
          { value: "html", label: t("html") },
          { value: "text", label: t("text") },
        ]}
      />
      {extra}
    </div>
  );
}

export function EmailPreviewFrame({
  preview,
  options,
  title,
  loading,
  className,
}: {
  preview: EmailPreviewDto | undefined;
  options: PreviewOptions;
  title: string;
  loading?: boolean;
  className?: string;
}) {
  const t = useTranslations("adminCms.common.preview");
  const mobile = options.device === "mobile";
  return (
    <div className={cn("flex min-h-0 flex-col items-center rounded-lg border border-border bg-surface-2 p-3 sm:p-5", className)}>
      <div
        className={cn(
          "flex w-full flex-col overflow-hidden border border-border bg-surface-1 shadow-sm transition-[max-width] duration-200",
          mobile ? "max-w-[390px] rounded-[28px]" : "max-w-[760px] rounded-lg",
          loading && "opacity-70",
        )}
      >
        <div className={cn("border-b border-border px-4 py-3", options.dark && "bg-[#1b1c1f] text-white")}>
          <p className={cn("truncate text-[13.5px] font-semibold", !options.dark && "text-ink")}>{preview?.subject || "…"}</p>
          <p className={cn("mt-0.5 truncate text-[12px]", options.dark ? "text-white/60" : "text-ink-muted")}>
            {preview?.preheader ? preview.preheader : <span className="italic">{t("noPreheader")}</span>}
          </p>
          {preview?.layoutName ? (
            <p className={cn("mt-1 text-[10.5px] uppercase tracking-wide", options.dark ? "text-white/40" : "text-ink-subtle")}>
              {t("layout", { name: preview.layoutName })}
            </p>
          ) : null}
        </div>
        {options.format === "html" ? (
          <iframe
            title={title}
            sandbox=""
            srcDoc={preview?.html ?? ""}
            className={cn("w-full flex-1", mobile ? "h-[640px]" : "h-[600px]", options.dark ? "bg-[#111214]" : "bg-[#FBF9F5]")}
          />
        ) : (
          <pre
            className={cn(
              "flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-relaxed",
              mobile ? "h-[640px]" : "h-[600px]",
              options.dark ? "bg-[#111214] text-white/80" : "text-ink-muted",
            )}
          >
            {preview?.text ?? ""}
          </pre>
        )}
      </div>
    </div>
  );
}
