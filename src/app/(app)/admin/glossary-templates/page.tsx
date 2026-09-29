"use client";

import { useMemo, useState } from "react";
import {
  Books,
  Plus,
  FileXls,
  FileCsv,
  Eye,
  PencilSimple,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { AdminPage, AdminPageHeader } from "@/components/admin/admin-page-chrome";
import { CmsTabBar } from "@/components/admin/cms/cms-editor";
import {
  CmsCardGrid,
  CmsEmptyState,
  CmsSearchInput,
  CmsSelectAll,
  CmsSelectBox,
  CmsSortSelect,
  CmsTable,
  CmsTd,
  CmsTh,
  CmsToolbar,
  CmsViewToggle,
  useListView,
} from "@/components/admin/cms/cms-list";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { Button } from "@/components/ui/button";
import {
  BUILT_IN_GLOSSARY_TEMPLATES,
  type GlossaryTemplateDefinition,
  generateTemplateCsv,
  generateTemplateXlsx,
} from "@/lib/glossary/glossary-templates-catalog";
import {
  GlossaryLocalePills,
  GlossaryStatusChips,
  GlossaryTemplateCard,
} from "@/components/admin/cms/glossary-template-card";
import { GlossaryTemplatePreviewDialog } from "@/components/admin/cms/glossary-template-preview-dialog";
import { GlossaryTemplateWizard } from "@/components/admin/cms/glossary-template-wizard";

type StatusTab = "all" | "published" | "draft" | "archived";
type SortOption = "name" | "terms" | "updated";

function createTemplateCopy(template: GlossaryTemplateDefinition): GlossaryTemplateDefinition {
  const stamp = Date.now().toString(36);
  return {
    ...template,
    key: `${template.key}-copy-${stamp}`,
    name: `${template.name} (Copy)`,
    status: "draft",
    updatedAt: new Date().toISOString(),
  };
}

export default function GlossaryTemplatesAdminPage() {
  const [templates, setTemplates] = useState<GlossaryTemplateDefinition[]>(BUILT_IN_GLOSSARY_TEMPLATES);
  const [tab, setTab] = useState<StatusTab>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [langFilter, setLangFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("name");
  const [view, setView] = useListView("wt.admin.glossary-templates.view");
  const [selected, setSelected] = useState<string[]>([]);

  // Dialog states
  const [previewTemplate, setPreviewTemplate] = useState<GlossaryTemplateDefinition | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<GlossaryTemplateDefinition | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Taken keys for deduplication
  const takenKeys = useMemo(() => new Set(templates.map((t) => t.key)), [templates]);

  // Filtering & sorting
  const visible = useMemo(() => {
    return templates
      .filter((t) => {
        if (tab === "published") return t.status === "published";
        if (tab === "draft") return t.status === "draft";
        if (tab === "archived") return t.status === "archived";
        return true;
      })
      .filter((t) => {
        if (categoryFilter === "all") return true;
        return t.category === categoryFilter;
      })
      .filter((t) => {
        if (langFilter === "all") return true;
        return t.sourceLanguage === langFilter || t.targetLanguage === langFilter;
      })
      .filter((t) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          t.key.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.sampleTerms.some((term) => term.term.toLowerCase().includes(q) || term.translation.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "terms") return b.sampleTerms.length - a.sampleTerms.length;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [templates, tab, categoryFilter, langFilter, search, sort]);

  const handleSaveTemplate = (item: GlossaryTemplateDefinition) => {
    setTemplates((prev) => {
      const existsIndex = prev.findIndex((t) => t.key === item.key);
      if (existsIndex >= 0) {
        const next = [...prev];
        next[existsIndex] = item;
        return next;
      }
      return [item, ...prev];
    });
  };

  const handleDuplicate = (template: GlossaryTemplateDefinition) => {
    const copy = createTemplateCopy(template);
    setTemplates((prev) => [copy, ...prev]);
    toast.success(`Đã nhân bản "${template.name}"`);
  };

  const handleArchive = (template: GlossaryTemplateDefinition) => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.key === template.key
          ? { ...t, status: t.status === "archived" ? "published" : "archived" }
          : t,
      ),
    );
    toast.success(template.status === "archived" ? "Đã khôi phục template" : "Đã lưu trữ template");
  };

  const handleDelete = (template: GlossaryTemplateDefinition) => {
    setTemplates((prev) => prev.filter((t) => t.key !== template.key));
    toast.success(`Đã xóa template "${template.name}"`);
  };

  const handleDownloadXlsx = async (template: GlossaryTemplateDefinition) => {
    try {
      const blob = await generateTemplateXlsx(template);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `glossary-template-${template.key}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã tải xuống ${template.name} (.xlsx)`);
    } catch {
      toast.error("Không thể tạo file Excel");
    }
  };

  const handleDownloadCsv = (template: GlossaryTemplateDefinition) => {
    try {
      const csv = generateTemplateCsv(template);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `glossary-template-${template.key}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã tải xuống ${template.name} (.csv)`);
    } catch {
      toast.error("Không thể tạo file CSV");
    }
  };

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Configuration & Content"
        eyebrowIcon={<Books size={14} weight="fill" />}
        title="Glossary Templates"
        description="Quản lý và cấu hình các bộ thuật ngữ mẫu chuẩn theo lĩnh vực và ngôn ngữ (EN, VI, JA) phục vụ toàn bộ hệ thống."
        actions={
          <Button size="sm" onClick={() => { setEditingTemplate(null); setIsWizardOpen(true); }}>
            <Plus size={14} />
            New template
          </Button>
        }
      />

      {/* Tabs */}
      <div className="mt-4">
        <CmsTabBar<StatusTab>
          label="Template statuses"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "all", label: "All", badge: templates.length },
            { value: "published", label: "Published", badge: templates.filter((t) => t.status === "published").length },
            { value: "draft", label: "Draft", badge: templates.filter((t) => t.status === "draft").length },
            { value: "archived", label: "Archived", badge: templates.filter((t) => t.status === "archived").length },
          ]}
        />
      </div>

      {/* Toolbar */}
      <div className="mt-4">
        <CmsToolbar
          chips={
            <div className="flex flex-wrap items-center gap-3">
              <FilterChipGroup label="Category">
                {["all", "IT", "BUSINESS", "GAMING", "GENERAL"].map((cat) => (
                  <FilterChip
                    key={cat}
                    selected={categoryFilter === cat}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat.toUpperCase()}
                  </FilterChip>
                ))}
              </FilterChipGroup>

              <FilterChipGroup label="Language">
                {[
                  { id: "all", label: "All" },
                  { id: "en", label: "EN" },
                  { id: "vi", label: "VI" },
                  { id: "ja", label: "JA" },
                ].map((lang) => (
                  <FilterChip
                    key={lang.id}
                    selected={langFilter === lang.id}
                    onClick={() => setLangFilter(lang.id)}
                  >
                    {lang.label}
                  </FilterChip>
                ))}
              </FilterChipGroup>
            </div>
          }
          controls={
            <>
              <CmsSearchInput
                value={search}
                onChange={setSearch}
                placeholder="Tìm theo tên, key, từ vựng..."
              />
              <CmsSortSelect<SortOption>
                value={sort}
                onChange={setSort}
                options={[
                  { value: "name", label: "Tên template" },
                  { value: "terms", label: "Số lượng thuật ngữ" },
                  { value: "updated", label: "Cập nhật gần nhất" },
                ]}
              />
              <CmsViewToggle view={view} onChange={setView} />
            </>
          }
        />
      </div>

      {/* Main Content Area */}
      <div className="mt-4">
        {visible.length === 0 ? (
          <CmsEmptyState
            title="Không tìm thấy template nào"
            description="Thử thay đổi bộ lọc tìm kiếm hoặc tạo một template mới."
            action={
              <Button size="sm" onClick={() => { setEditingTemplate(null); setIsWizardOpen(true); }}>
                <Plus size={14} />
                Tạo template mới
              </Button>
            }
          />
        ) : view === "grid" ? (
          <CmsCardGrid>
            {visible.map((template) => (
              <GlossaryTemplateCard
                key={template.key}
                template={template}
                selected={selected.includes(template.key)}
                onSelect={() => {
                  setSelected((prev) =>
                    prev.includes(template.key)
                      ? prev.filter((k) => k !== template.key)
                      : [...prev, template.key],
                  );
                }}
                actions={{
                  onPreview: () => setPreviewTemplate(template),
                  onEdit: () => {
                    setEditingTemplate(template);
                    setIsWizardOpen(true);
                  },
                  onDownloadXlsx: () => void handleDownloadXlsx(template),
                  onDownloadCsv: () => handleDownloadCsv(template),
                  onDuplicate: () => handleDuplicate(template),
                  onArchive: () => handleArchive(template),
                  onDelete: () => handleDelete(template),
                }}
              />
            ))}
          </CmsCardGrid>
        ) : (
          <CmsTable>
            <thead>
              <tr className="border-b border-hairline bg-surface-2 text-[11px] uppercase tracking-wider text-ink-muted">
                <CmsTh className="w-10">
                  <CmsSelectAll
                    checked={selected.length === visible.length && visible.length > 0}
                    onChange={(checked) =>
                      setSelected(checked ? visible.map((t) => t.key) : [])
                    }
                    label="Select all"
                  />
                </CmsTh>
                <CmsTh>Template</CmsTh>
                <CmsTh>Languages</CmsTh>
                <CmsTh>Category</CmsTh>
                <CmsTh>Terms count</CmsTh>
                <CmsTh>Status</CmsTh>
                <CmsTh className="text-right">Actions</CmsTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-[12.5px]">
              {visible.map((template) => (
                <tr key={template.key} className="hover:bg-surface-2/60 transition-colors">
                  <CmsTd>
                    <CmsSelectBox
                      checked={selected.includes(template.key)}
                      onChange={() => {
                        setSelected((prev) =>
                          prev.includes(template.key)
                            ? prev.filter((k) => k !== template.key)
                            : [...prev, template.key],
                        );
                      }}
                      label={`Select ${template.name}`}
                    />
                  </CmsTd>
                  <CmsTd>
                    <div>
                      <span
                        onClick={() => setPreviewTemplate(template)}
                        className="font-semibold text-ink hover:text-primary cursor-pointer"
                      >
                        {template.name}
                      </span>
                      <p className="font-mono text-[11px] text-ink-subtle">{template.key}</p>
                    </div>
                  </CmsTd>
                  <CmsTd>
                    <GlossaryLocalePills template={template} />
                  </CmsTd>
                  <CmsTd>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-ink-muted">
                      {template.category}
                    </span>
                  </CmsTd>
                  <CmsTd>
                    <span className="font-medium text-ink-muted">
                      {template.sampleTerms.length} terms (8 cols)
                    </span>
                  </CmsTd>
                  <CmsTd>
                    <GlossaryStatusChips template={template} />
                  </CmsTd>
                  <CmsTd align="right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewTemplate(template)}
                        className="h-7 w-7 p-0 text-ink-muted hover:text-primary"
                        title="Preview"
                      >
                        <Eye size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingTemplate(template);
                          setIsWizardOpen(true);
                        }}
                        className="h-7 w-7 p-0 text-ink-muted hover:text-primary"
                        title="Edit"
                      >
                        <PencilSimple size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDownloadXlsx(template)}
                        className="h-7 w-7 p-0 text-emerald-600 dark:text-emerald-400"
                        title="Tải .xlsx"
                      >
                        <FileXls size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadCsv(template)}
                        className="h-7 w-7 p-0 text-sky-600 dark:text-sky-400"
                        title="Tải .csv"
                      >
                        <FileCsv size={15} />
                      </Button>
                    </div>
                  </CmsTd>
                </tr>
              ))}
            </tbody>
          </CmsTable>
        )}
      </div>

      {/* Modals & Dialogs */}
      <GlossaryTemplatePreviewDialog
        template={previewTemplate}
        open={!!previewTemplate}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
        onEdit={(tpl) => {
          setEditingTemplate(tpl);
          setIsWizardOpen(true);
        }}
      />

      <GlossaryTemplateWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        templateToEdit={editingTemplate}
        onSave={handleSaveTemplate}
        takenKeys={takenKeys}
      />
    </AdminPage>
  );
}
