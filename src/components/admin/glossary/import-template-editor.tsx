"use client";

/**
 * WT-880 — the "Import template" tab of /admin/global-glossary: the platform admin configures the
 * glossary import FILE SHAPE every workspace downloads.
 *
 * Three parts, matching what the PO said the admin owns:
 *   1. Columns, grouped Source / Target / General — group, order, hidden, header name, aliases.
 *      Term and Translation are fixed to their groups and cannot be hidden: the importer needs both.
 *   2. Language blocks — per-language sample values for the faint sample row. One block per
 *      language, never one per pair: a pair's file takes Source from the source block and Target
 *      from the target block.
 *   3. A live preview for any published pair, the same component the workspace tab renders.
 *
 * Nothing here holds term content; the six domain term packs were taken out of this surface.
 * Saving replaces the whole configuration (PUT); "Reset to default" deletes it, and the
 * TranscriptService default is served again.
 */

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowDown,
  ArrowUp,
  ArrowCounterClockwise,
  PencilSimple,
  Plus,
  Spinner,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ImportTemplatePairPicker,
  ImportTemplatePreview,
} from "@/components/glossary/import-template-preview";
import {
  useAdminGlossaryImportTemplate,
  usePublishedTemplateLanguages,
  useResetGlossaryImportTemplate,
  useUpdateGlossaryImportTemplate,
} from "@/hooks/use-glossary-import-template";
import { useCan } from "@/hooks/use-staff-access";
import { ADMIN_PERMISSIONS } from "@/lib/admin/staff-permissions";
import { getErrorMessage } from "@/lib/api/errors";
import {
  IMPORT_TEMPLATE_GROUPS,
  REQUIRED_COLUMNS,
  normalizeHeader,
  orderedColumns,
  renumberColumns,
  type ImportTemplateColumn,
  type ImportTemplateColumnKey,
  type ImportTemplateConfig,
  type ImportTemplateGroup,
} from "@/lib/glossary/import-template";

function isRequired(key: ImportTemplateColumnKey): boolean {
  return key in REQUIRED_COLUMNS;
}

/** Trimmed names and aliases, empty aliases dropped — what is sent and what is validated. */
function cleanConfig(config: ImportTemplateConfig): ImportTemplateConfig {
  return {
    columns: renumberColumns(config.columns).map((column) => ({
      ...column,
      name: column.name.trim().replace(/\s+/g, " "),
      aliases: column.aliases.map((alias) => alias.trim()).filter(Boolean),
    })),
    samples: Object.fromEntries(
      Object.entries(config.samples).map(([code, values]) => [
        code,
        Object.fromEntries(
          Object.entries(values ?? {})
            .map(([key, value]) => [key, (value ?? "").trim()])
            .filter(([, value]) => value),
        ),
      ]),
    ),
  };
}

type Problem =
  | { kind: "nameRequired"; column: string }
  | { kind: "duplicateHeader"; label: string; first: string; second: string }
  | { kind: "priorityNumber"; language: string };

/** The server's rules, checked before Save so the admin sees which field is wrong. */
function findProblem(config: ImportTemplateConfig): Problem | null {
  const owner = new Map<string, ImportTemplateColumn>();
  for (const column of config.columns) {
    if (!column.name) return { kind: "nameRequired", column: column.key };
    for (const label of [column.name, ...column.aliases]) {
      const key = normalizeHeader(label);
      const other = owner.get(key);
      if (other && other.key !== column.key) {
        return { kind: "duplicateHeader", label, first: other.name, second: column.name };
      }
      owner.set(key, column);
    }
  }
  for (const [language, values] of Object.entries(config.samples)) {
    const priority = values?.priority;
    if (priority && !/^-?\d+$/.test(priority)) return { kind: "priorityNumber", language };
  }
  return null;
}

export function GlossaryImportTemplateEditor() {
  const t = useTranslations("adminGlobalGlossary.importTemplate");
  const tGroups = useTranslations("glossary.importTemplate.groups");
  const canManage = useCan(ADMIN_PERMISSIONS.glossaryManage);
  const server = useAdminGlossaryImportTemplate();
  const { languages, isLoading: languagesLoading } = usePublishedTemplateLanguages();
  const updateMutation = useUpdateGlossaryImportTemplate();
  const resetMutation = useResetGlossaryImportTemplate();

  // Edits live here until saved; `null` means "showing the server's version".
  const [draft, setDraft] = useState<ImportTemplateConfig | null>(null);
  const config = draft ?? server.config;
  const dirty = draft !== null;

  const [editingLanguage, setEditingLanguage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [previewPair, setPreviewPair] = useState({ sourceLanguage: "en", targetLanguage: "vi" });

  const languageName = useCallback(
    (code: string) => languages.find((language) => language.code === code)?.name ?? code,
    [languages],
  );

  const edit = (change: (current: ImportTemplateConfig) => ImportTemplateConfig) =>
    setDraft((current) => change(current ?? server.config));

  const updateColumn = (key: ImportTemplateColumnKey, patch: Partial<ImportTemplateColumn>) =>
    edit((current) => ({
      ...current,
      columns: current.columns.map((column) => (column.key === key ? { ...column, ...patch } : column)),
    }));

  const moveColumn = (key: ImportTemplateColumnKey, direction: -1 | 1) =>
    edit((current) => {
      const ordered = renumberColumns(current.columns);
      const column = ordered.find((c) => c.key === key);
      if (!column) return current;
      const siblings = ordered.filter((c) => c.group === column.group);
      const swapWith = siblings[column.order + direction];
      if (!swapWith) return current;
      return {
        ...current,
        columns: ordered.map((c) =>
          c.key === key ? { ...c, order: swapWith.order } : c.key === swapWith.key ? { ...c, order: column.order } : c,
        ),
      };
    });

  const changeGroup = (key: ImportTemplateColumnKey, group: ImportTemplateGroup) =>
    edit((current) => ({
      ...current,
      // To the end of its new group; renumbering on save closes the gap it left.
      columns: renumberColumns(
        current.columns.map((column) =>
          column.key === key ? { ...column, group, order: Number.MAX_SAFE_INTEGER } : column,
        ),
      ),
    }));

  const cleaned = useMemo(() => cleanConfig(config), [config]);
  const problem = findProblem(cleaned);

  const problemText = (value: Problem) => {
    switch (value.kind) {
      case "nameRequired":
        return t("problems.nameRequired");
      case "duplicateHeader":
        return t("problems.duplicateHeader", value);
      case "priorityNumber":
        return t("problems.priorityNumber", { language: languageName(value.language) });
    }
  };

  const save = async () => {
    if (problem) return;
    try {
      await updateMutation.mutateAsync(cleaned);
      setDraft(null);
      toast.success(t("saved"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("saveFailed")));
    }
  };

  const reset = async () => {
    try {
      await resetMutation.mutateAsync();
      setDraft(null);
      setConfirmReset(false);
      toast.success(t("resetDone"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("resetFailed")));
    }
  };

  const sampleLanguages = Object.keys(config.samples).sort((a, b) =>
    languageName(a).localeCompare(languageName(b)),
  );
  const addableLanguages = languages.filter((language) => !(language.code in config.samples));
  const columns = orderedColumns(config.columns);

  if (server.isLoading) {
    return <div className="h-40 animate-pulse rounded-lg bg-surface-2" />;
  }

  if (server.query.isError && !dirty) {
    return (
      <AdminPanel className="flex items-start gap-2 p-4 text-[12.5px] text-destructive">
        <WarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
        {t("loadFailed")}
      </AdminPanel>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Status + actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">{t("description")}</p>
          <p className="mt-1 text-[11.5px] text-ink-subtle">
            {server.isDefault
              ? t("statusDefault")
              : t("statusSaved", { date: server.updatedAt ? new Date(server.updatedAt).toLocaleString() : "—" })}
            {dirty ? <span className="ml-2 font-medium text-amber-600 dark:text-amber-500">{t("unsaved")}</span> : null}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmReset(true)}
              disabled={server.isDefault && !dirty}
            >
              <ArrowCounterClockwise className="h-4 w-4" />
              {t("resetToDefault")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDraft(null)} disabled={!dirty}>
              {t("discard")}
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!dirty || Boolean(problem) || updateMutation.isPending}>
              {updateMutation.isPending ? <Spinner className="h-4 w-4 animate-spin" /> : null}
              {t("save")}
            </Button>
          </div>
        ) : (
          <Badge variant="outline">{t("readOnly")}</Badge>
        )}
      </div>

      {problem ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <WarningCircle size={14} className="mt-0.5 shrink-0" />
          {problemText(problem)}
        </p>
      ) : null}

      {/* 1. Columns */}
      <AdminPanel>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold text-ink">{t("columns.title")}</h2>
          <p className="mt-0.5 text-[12px] text-ink-muted">{t("columns.description")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="w-[72px] px-3 py-2 font-medium">{t("columns.order")}</th>
                <th className="px-3 py-2 font-medium">{t("columns.name")}</th>
                <th className="px-3 py-2 font-medium">{t("columns.aliases")}</th>
                <th className="w-[140px] px-3 py-2 font-medium">{t("columns.group")}</th>
                <th className="w-[90px] px-3 py-2 font-medium">{t("columns.shown")}</th>
              </tr>
            </thead>
            {IMPORT_TEMPLATE_GROUPS.map((group) => {
              const inGroup = columns.filter((column) => column.group === group);
              return (
                <tbody key={group}>
                  <tr className="border-t border-border bg-surface-1">
                    <td colSpan={5} className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                      {tGroups(group)} · {t(`columns.groupHint.${group}`)}
                    </td>
                  </tr>
                  {inGroup.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-2 text-ink-subtle">{t("columns.emptyGroup")}</td>
                    </tr>
                  ) : null}
                  {inGroup.map((column, index) => {
                    const required = isRequired(column.key);
                    return (
                      <tr key={column.key} className={column.hidden ? "opacity-60" : undefined}>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              className="rounded p-1 text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                              onClick={() => moveColumn(column.key, -1)}
                              disabled={!canManage || index === 0}
                              aria-label={t("columns.moveUp", { name: column.name })}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="rounded p-1 text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                              onClick={() => moveColumn(column.key, 1)}
                              disabled={!canManage || index === inGroup.length - 1}
                              aria-label={t("columns.moveDown", { name: column.name })}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={column.name}
                              onChange={(event) => updateColumn(column.key, { name: event.target.value })}
                              disabled={!canManage}
                              maxLength={60}
                              className="h-8 text-[12.5px]"
                              aria-label={t("columns.nameFor", { key: column.key })}
                            />
                            {required ? <Badge variant="outline" className="shrink-0 text-[10px]">{t("columns.required")}</Badge> : null}
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            value={column.aliases.join(",")}
                            onChange={(event) => updateColumn(column.key, { aliases: event.target.value.split(",") })}
                            disabled={!canManage}
                            placeholder={t("columns.aliasesPlaceholder")}
                            className="h-8 text-[12.5px]"
                            aria-label={t("columns.aliasesFor", { name: column.name })}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Select
                            value={column.group}
                            onValueChange={(value) => changeGroup(column.key, value as ImportTemplateGroup)}
                            disabled={!canManage || required}
                          >
                            <SelectTrigger className="h-8 text-[12.5px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {IMPORT_TEMPLATE_GROUPS.map((option) => (
                                <SelectItem key={option} value={option}>{tGroups(option)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Switch
                            checked={!column.hidden}
                            onCheckedChange={(shown) => updateColumn(column.key, { hidden: !shown })}
                            disabled={!canManage || required}
                            aria-label={t("columns.shownFor", { name: column.name })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      </AdminPanel>

      {/* 2. Language blocks */}
      <AdminPanel>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-ink">{t("languages.title")}</h2>
            <p className="mt-0.5 max-w-2xl text-[12px] text-ink-muted">{t("languages.description")}</p>
          </div>
          {canManage && addableLanguages.length > 0 ? (
            <Select
              value=""
              onValueChange={(code) => {
                if (!code) return;
                edit((current) => ({ ...current, samples: { ...current.samples, [code]: {} } }));
                setEditingLanguage(code);
              }}
            >
              <SelectTrigger className="h-8 w-48 text-[12.5px]">
                <Plus className="h-3.5 w-3.5" />
                <SelectValue placeholder={t("languages.add")} />
              </SelectTrigger>
              <SelectContent>
                {addableLanguages.map((language) => (
                  <SelectItem key={language.code} value={language.code}>{language.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {sampleLanguages.map((code) => {
            const values = config.samples[code] ?? {};
            const filled = columns.filter((column) => values[column.key]?.trim()).length;
            const published = languages.some((language) => language.code === code);
            return (
              <div key={code} className="flex min-w-0 flex-col gap-2 rounded-[10px] border border-hairline bg-surface-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-ink">
                    {languageName(code)} <span className="font-normal text-ink-subtle">({code})</span>
                  </span>
                  {!published && !languagesLoading ? (
                    <Badge variant="outline" className="text-[10px]">{t("languages.notPublished")}</Badge>
                  ) : null}
                </div>
                <p className="truncate text-[12px] text-ink-muted" title={values.sourceTerm}>
                  {values.sourceTerm ? `${values.sourceTerm} — ${values.context ?? ""}` : t("languages.noTerm")}
                </p>
                <p className="text-[11px] text-ink-subtle">
                  {t("languages.filled", { filled, total: columns.length })}
                </p>
                {canManage ? (
                  <div className="mt-auto flex items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setEditingLanguage(code)}>
                      <PencilSimple className="h-3.5 w-3.5" />
                      {t("languages.edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        edit((current) => {
                          const samples = { ...current.samples };
                          delete samples[code];
                          return { ...current, samples };
                        })
                      }
                      aria-label={t("languages.removeFor", { language: languageName(code) })}
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {sampleLanguages.length === 0 ? (
            <p className="text-[12px] text-ink-subtle">{t("languages.empty")}</p>
          ) : null}
        </div>
        <p className="border-t border-border px-4 py-2 text-[11.5px] text-ink-subtle">{t("languages.missingNote")}</p>
      </AdminPanel>

      {/* 3. Preview */}
      <AdminPanel className="p-4">
        <h2 className="text-[13px] font-semibold text-ink">{t("preview.title")}</h2>
        <p className="mb-3 mt-0.5 text-[12px] text-ink-muted">{t("preview.description")}</p>
        <div className="mb-3">
          <ImportTemplatePairPicker
            languages={languages}
            sourceLanguage={previewPair.sourceLanguage}
            targetLanguage={previewPair.targetLanguage}
            onChange={setPreviewPair}
            disabled={languagesLoading}
          />
        </div>
        <ImportTemplatePreview
          config={cleaned}
          sourceLanguage={previewPair.sourceLanguage}
          targetLanguage={previewPair.targetLanguage}
          languageName={languageName}
        />
      </AdminPanel>

      <SampleValuesDialog
        language={editingLanguage}
        languageName={languageName}
        columns={columns}
        values={editingLanguage ? config.samples[editingLanguage] ?? {} : {}}
        onClose={() => setEditingLanguage(null)}
        onChange={(key, value) => {
          if (!editingLanguage) return;
          edit((current) => ({
            ...current,
            samples: {
              ...current.samples,
              [editingLanguage]: { ...current.samples[editingLanguage], [key]: value },
            },
          }));
        }}
      />

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="border-hairline bg-surface-1 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">{t("resetDialog.title")}</DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">{t("resetDialog.description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>
              {t("resetDialog.cancel")}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void reset()} disabled={resetMutation.isPending}>
              {resetMutation.isPending ? <Spinner className="h-4 w-4 animate-spin" /> : null}
              {t("resetDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SampleValuesDialog({
  language,
  languageName,
  columns,
  values,
  onClose,
  onChange,
}: {
  language: string | null;
  languageName: (code: string) => string;
  columns: ImportTemplateColumn[];
  values: Partial<Record<ImportTemplateColumnKey, string>>;
  onClose: () => void;
  onChange: (key: ImportTemplateColumnKey, value: string) => void;
}) {
  const t = useTranslations("adminGlobalGlossary.importTemplate.sampleDialog");
  const tGroups = useTranslations("glossary.importTemplate.groups");

  return (
    <Dialog open={language !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-hairline bg-surface-1 sm:max-h-[90dvh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {t("title", { language: language ? languageName(language) : "" })}
          </DialogTitle>
          <DialogDescription className="text-xs text-ink-muted">{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4">
          {columns.map((column) => (
            <label key={column.key} className="flex flex-col gap-1">
              <span className="text-[11.5px] font-medium text-ink-muted">
                {column.name} <span className="text-ink-subtle">· {tGroups(column.group)}</span>
                {column.hidden ? <span className="text-ink-subtle"> · {t("hidden")}</span> : null}
              </span>
              <Input
                value={values[column.key] ?? ""}
                onChange={(event) => onChange(column.key, event.target.value)}
                maxLength={300}
                inputMode={column.key === "priority" ? "numeric" : undefined}
                className="h-8 text-[12.5px]"
              />
            </label>
          ))}
        </div>
        <DialogFooter className="mt-2">
          <Button size="sm" onClick={onClose}>{t("done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
