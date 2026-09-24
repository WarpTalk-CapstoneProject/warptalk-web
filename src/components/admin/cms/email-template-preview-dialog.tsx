"use client";

/**
 * An email rendered by the server with sample values — the same renderer the senders use — in a
 * sandboxed frame. `sandbox=""` gives the frame no scripts, no forms and no same-origin access,
 * so an admin-authored body can never act on the portal it is previewed in.
 */

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { EmailTemplatePreviewDto } from "@/types/admin-cms";

export function EmailPreviewFrame({
  preview,
  view,
  className,
  title,
}: {
  preview: EmailTemplatePreviewDto | undefined;
  view: "html" | "text";
  className?: string;
  title: string;
}) {
  const t = useTranslations("adminCms.emailTemplates.preview");
  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1", className)}>
      <div className="border-b border-border px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-ink-subtle">{t("subject")}</p>
        <p className="mt-0.5 truncate text-[13px] font-medium text-ink">{preview?.subject ?? "…"}</p>
      </div>
      {view === "html" ? (
        <iframe
          title={title}
          sandbox=""
          srcDoc={preview?.html ?? ""}
          className="min-h-[520px] w-full flex-1 bg-[#FBF9F5]"
        />
      ) : (
        <pre className="min-h-[520px] flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-relaxed text-ink-muted">
          {preview?.text ?? ""}
        </pre>
      )}
    </div>
  );
}
