"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle,
  PencilSimple,
  Plus,
  ShieldWarning,
  Spinner,
  Translate,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useSystemLanguages,
  useCreateSystemLanguage,
  useUpdateSystemLanguage,
  useToggleSystemLanguage,
  type SystemLanguage,
} from "@/hooks/use-system-languages";
import { useIsSystemAdmin } from "@/hooks/use-is-system-admin";

const languageSchema = z.object({
  code: z.string().min(2, "Language code must be at least 2 characters (e.g. en, vi, ja)"),
  name: z.string().min(2, "Language name is required"),
  nativeName: z.string().optional(),
});

type LanguageFormData = z.infer<typeof languageSchema>;

export default function AdminLanguagesPage() {
  const isSystemAdmin = useIsSystemAdmin();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [languageToEdit, setLanguageToEdit] = useState<SystemLanguage | null>(null);

  const { languages, isLoading } = useSystemLanguages();
  const { createLanguage, isCreating } = useCreateSystemLanguage();
  const { updateLanguage, isUpdating } = useUpdateSystemLanguage();
  const { toggleLanguage, isToggling } = useToggleSystemLanguage();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LanguageFormData>({
    resolver: zodResolver(languageSchema),
    defaultValues: { code: "", name: "", nativeName: "" },
  });

  const editForm = useForm<LanguageFormData>({
    resolver: zodResolver(languageSchema),
    defaultValues: { code: "", name: "", nativeName: "" },
  });

  if (!isSystemAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <ShieldWarning className="h-10 w-10 text-ink-muted" />
        <p className="text-sm font-semibold text-ink">Admin access required</p>
        <p className="text-xs text-ink-muted max-w-sm">
          System languages configure the platform's supported translation targets. Only platform administrators can manage them.
        </p>
      </div>
    );
  }

  const handleCreate = async (data: LanguageFormData) => {
    try {
      await createLanguage(data);
      toast.success(`Language "${data.name}" added successfully.`);
      reset();
      setIsCreateOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to add language.");
    }
  };

  const openEditDialog = (language: SystemLanguage) => {
    setLanguageToEdit(language);
    editForm.reset({
      code: language.code,
      name: language.name,
      nativeName: language.nativeName || "",
    });
  };

  const handleUpdate = async (data: LanguageFormData) => {
    if (!languageToEdit) return;
    try {
      await updateLanguage(data);
      toast.success(`Language "${data.name}" updated.`);
      setLanguageToEdit(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update language.");
    }
  };

  const handleToggleActive = async (code: string, isActive: boolean, name: string) => {
    try {
      await toggleLanguage({ code, isActive });
      toast.success(`Language "${name}" is now ${isActive ? "active" : "inactive"}.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle language state.");
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface-1">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface-1 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface-2 shadow-sm">
            <Translate className="size-5 text-ink" weight="duotone" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink tracking-tight">
              System Languages
            </h1>
            <p className="text-[13px] text-ink-muted mt-0.5">
              Manage the supported target languages across the platform.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-[8px] bg-ink px-3 text-[13px] font-medium text-surface-1 shadow-sm transition-colors hover:bg-ink-strong"
          >
            <Plus size={16} weight="bold" />
            Add Language
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl">
          <Card className="rounded-[16px] shadow-sm overflow-hidden border-hairline bg-surface-1/50 backdrop-blur-xl">
            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-ink-muted">
                <Spinner className="h-5 w-5 animate-spin" />
                <span className="ml-2 text-sm">Loading languages...</span>
              </div>
            ) : languages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-surface-2 mb-4">
                  <Translate className="size-6 text-ink-muted" weight="duotone" />
                </div>
                <h3 className="text-sm font-medium text-ink mb-1">No languages found</h3>
                <p className="text-xs text-ink-muted max-w-sm">
                  Add the first supported language to the platform.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/50 text-ink-subtle">
                      <th className="px-4 py-3 font-medium w-32">Code</th>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Native Name</th>
                      <th className="px-4 py-3 font-medium w-32">Status</th>
                      <th className="px-4 py-3 font-medium text-right w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {languages.map((lang: SystemLanguage) => (
                      <tr
                        key={lang.code}
                        className="group hover:bg-surface-2/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-ink">
                          {lang.code}
                        </td>
                        <td className="px-4 py-3 text-ink font-medium">
                          {lang.name}
                        </td>
                        <td className="px-4 py-3 text-ink-subtle">
                          {lang.nativeName || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={lang.isActive}
                              onCheckedChange={(checked) =>
                                handleToggleActive(lang.code, checked, lang.name)
                              }
                              disabled={isToggling}
                            />
                            <span className="text-xs text-ink-muted">
                              {lang.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEditDialog(lang)}
                            className="inline-flex size-7 items-center justify-center rounded-[6px] text-ink-subtle opacity-0 transition-all hover:bg-surface-2 hover:text-ink group-hover:opacity-100 focus:opacity-100"
                            title="Edit language"
                          >
                            <PencilSimple size={14} weight="regular" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSubmit(handleCreate)}>
            <DialogHeader>
              <DialogTitle>Add System Language</DialogTitle>
              <DialogDescription>
                Add a new language to the platform's supported targets.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="code" className="text-xs font-medium text-ink-subtle">
                  Language Code (ISO 639-1)
                </Label>
                <Input
                  id="code"
                  placeholder="en"
                  {...register("code")}
                  className={errors.code ? "border-danger" : ""}
                />
                {errors.code && (
                  <p className="text-[11px] text-danger">{errors.code.message}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name" className="text-xs font-medium text-ink-subtle">
                  Name (English)
                </Label>
                <Input
                  id="name"
                  placeholder="English"
                  {...register("name")}
                  className={errors.name ? "border-danger" : ""}
                />
                {errors.name && (
                  <p className="text-[11px] text-danger">{errors.name.message}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nativeName" className="text-xs font-medium text-ink-subtle">
                  Native Name (Optional)
                </Label>
                <Input
                  id="nativeName"
                  placeholder="English"
                  {...register("nativeName")}
                />
              </div>
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-[8px] px-3 py-2 text-[13px] font-medium text-ink-muted hover:text-ink transition-colors"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="flex items-center gap-2 rounded-[8px] bg-ink px-4 py-2 text-[13px] font-medium text-surface-1 shadow-sm transition-colors hover:bg-ink-strong disabled:opacity-50"
              >
                {isCreating ? <Spinner className="animate-spin" size={14} /> : null}
                Add Language
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!languageToEdit} onOpenChange={(open) => !open && setLanguageToEdit(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={editForm.handleSubmit(handleUpdate)}>
            <DialogHeader>
              <DialogTitle>Edit System Language</DialogTitle>
              <DialogDescription>
                Update the name or native name for {languageToEdit?.code}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-code" className="text-xs font-medium text-ink-subtle">
                  Language Code
                </Label>
                <Input
                  id="edit-code"
                  disabled
                  {...editForm.register("code")}
                  className="bg-surface-2"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-name" className="text-xs font-medium text-ink-subtle">
                  Name (English)
                </Label>
                <Input
                  id="edit-name"
                  {...editForm.register("name")}
                  className={editForm.formState.errors.name ? "border-danger" : ""}
                />
                {editForm.formState.errors.name && (
                  <p className="text-[11px] text-danger">{editForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-nativeName" className="text-xs font-medium text-ink-subtle">
                  Native Name (Optional)
                </Label>
                <Input
                  id="edit-nativeName"
                  {...editForm.register("nativeName")}
                />
              </div>
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setLanguageToEdit(null)}
                className="rounded-[8px] px-3 py-2 text-[13px] font-medium text-ink-muted hover:text-ink transition-colors"
                disabled={isUpdating}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdating}
                className="flex items-center gap-2 rounded-[8px] bg-ink px-4 py-2 text-[13px] font-medium text-surface-1 shadow-sm transition-colors hover:bg-ink-strong disabled:opacity-50"
              >
                {isUpdating ? <Spinner className="animate-spin" size={14} /> : null}
                Save Changes
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
