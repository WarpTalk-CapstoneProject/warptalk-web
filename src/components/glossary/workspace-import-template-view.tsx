"use client";

/**
 * WT-880 — the workspace Glossary page's third tab, "Import template": view the file shape the
 * platform admin configured for any published language pair, and download it.
 *
 * Every workspace member sees it (PO decision 2026-10-02) — it is a file shape, nothing the
 * workspace owns, and a member preparing a spreadsheet for an owner to import needs it as much as
 * the owner does. The pair offered is every language the admin has published, not the
 * workspace's language policy (also PO): the template is the same file either way, and a policy
 * change should not make a file someone already has look wrong.
 */

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import {
  ImportTemplatePairPicker,
  ImportTemplatePreview,
} from "@/components/glossary/import-template-preview";
import {
  useGlossaryImportTemplate,
  usePublishedTemplateLanguages,
} from "@/hooks/use-glossary-import-template";
import {
  REQUIRED_COLUMNS,
  baseLanguage,
  orderedColumns,
} from "@/lib/glossary/import-template";

function pickDefaultPair(
  codes: string[],
  preferred?: { sourceLanguage?: string | null; targetLanguage?: string | null },
) {
  const has = (code: string | null | undefined) => Boolean(code) && codes.includes(baseLanguage(code));
  const source = has(preferred?.sourceLanguage)
    ? baseLanguage(preferred?.sourceLanguage)
    : codes.includes("en") ? "en" : codes[0] ?? "en";
  const target = has(preferred?.targetLanguage)
    ? baseLanguage(preferred?.targetLanguage)
    : codes.find((code) => code !== source) ?? source;
  return { sourceLanguage: source, targetLanguage: target };
}

export function WorkspaceImportTemplateView({
  initialPair,
}: {
  /** The open glossary's pair, so the tab starts on the file that glossary needs. */
  initialPair?: { sourceLanguage?: string | null; targetLanguage?: string | null };
}) {
  const t = useTranslations("glossary.importTemplate");
  const template = useGlossaryImportTemplate();
  const { languages, isLoading: languagesLoading } = usePublishedTemplateLanguages();

  // The reader's choice once made; until then derived from the open glossary and the list.
  const [chosenPair, setPair] = useState<{ sourceLanguage: string; targetLanguage: string } | null>(null);
  const pair =
    chosenPair ??
    (languagesLoading ? null : pickDefaultPair(languages.map((language) => language.code), initialPair));

  const languageName = useCallback(
    (code: string) => languages.find((language) => language.code === code)?.name ?? code,
    [languages],
  );

  const columns = orderedColumns(template.config.columns).filter((column) => !column.hidden);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div>
        <h2 className="text-[14px] font-semibold text-ink">{t("title")}</h2>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">{t("description")}</p>
      </div>

      {template.isFallback ? (
        <p className="flex items-start gap-1.5 text-[12px] text-amber-600 dark:text-amber-500">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          {t("fallbackNotice")}
        </p>
      ) : null}

      <ImportTemplatePairPicker
        languages={languages}
        sourceLanguage={pair?.sourceLanguage ?? ""}
        targetLanguage={pair?.targetLanguage ?? ""}
        onChange={setPair}
        disabled={languagesLoading || !pair}
      />

      {pair ? (
        <ImportTemplatePreview
          config={template.config}
          sourceLanguage={pair.sourceLanguage}
          targetLanguage={pair.targetLanguage}
          languageName={languageName}
        />
      ) : (
        <div className="h-24 animate-pulse rounded-[10px] bg-surface-2" />
      )}

      <section>
        <h3 className="text-[12.5px] font-semibold text-ink">{t("columnsTitle")}</h3>
        <div className="mt-2 overflow-x-auto rounded-[10px] border border-hairline">
          <table className="w-full min-w-[520px] text-left text-[12px]">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-2.5 py-1.5 font-medium">{t("columnHeader")}</th>
                <th className="px-2.5 py-1.5 font-medium">{t("groupHeader")}</th>
                <th className="px-2.5 py-1.5 font-medium">{t("acceptsHeader")}</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((column) => (
                <tr key={column.key} className="border-t border-hairline">
                  <td className="px-2.5 py-1.5 align-top font-medium text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      {column.name}
                      {column.key in REQUIRED_COLUMNS ? (
                        <Badge variant="outline" className="text-[10px]">{t("required")}</Badge>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 align-top text-ink-muted">{t(`groups.${column.group}`)}</td>
                  <td className="px-2.5 py-1.5 align-top text-ink-muted [overflow-wrap:anywhere]">
                    {column.aliases.length > 0 ? column.aliases.join(", ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] text-ink-subtle">{t("columnsNote")}</p>
      </section>
    </div>
  );
}
