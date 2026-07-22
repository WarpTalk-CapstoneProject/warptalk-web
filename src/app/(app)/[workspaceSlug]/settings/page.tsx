"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Lock,
  Spinner,
  Copy
} from "@phosphor-icons/react";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAuthStore } from "@/stores/auth-store";
import {
  useWorkspace,
  useWorkspaceSettings,
  useUpdateWorkspaceSettings
} from "@/hooks/use-workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const settingsSchema = z.object({
  defaultLanguage: z.string().min(1, "Please select default language"),
  timezone: z.string().min(1, "Please select timezone"),
  maxActiveRooms: z.number().min(1, "Must be at least 1 room"),
  artifactRetentionDays: z.number().min(0, "Retention must be 0 (indefinite) or positive"),
  enforceHostApprovalDefault: z.boolean(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

const languages = [
  { code: "en", label: "English" },
  { code: "vi", label: "Vietnamese" },
  { code: "ja", label: "Japanese" },
];

export default function WorkspaceSettingsPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const role = useWorkspaceStore((s) => s.role);
  const currentUser = useAuthStore((s) => s.user);

  // Queries & Mutations
  const workspaceQuery = useWorkspace(activeWorkspaceId || "");
  const settingsQuery = useWorkspaceSettings(activeWorkspaceId || "");
  const updateSettingsMutation = useUpdateWorkspaceSettings(activeWorkspaceId || "");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      defaultLanguage: "",
      timezone: "",
      maxActiveRooms: 1,
      artifactRetentionDays: 0,
      enforceHostApprovalDefault: false,
    },
  });

  const watchAll = watch();

  useEffect(() => {
    if (settingsQuery.data) {
      reset({
        defaultLanguage: settingsQuery.data.defaultLanguage,
        timezone: settingsQuery.data.timezone,
        maxActiveRooms: settingsQuery.data.maxActiveRooms,
        artifactRetentionDays: settingsQuery.data.artifactRetentionDays,
        enforceHostApprovalDefault: settingsQuery.data.enforceHostApprovalDefault,
      });
    }
  }, [settingsQuery.data, reset]);

  if (!activeWorkspaceId) return null;

  const isOwner = role === "Owner";
  const isAdmin = role === "Admin";
  const isOwnerOrAdmin = isOwner || isAdmin;

  if (!isOwnerOrAdmin) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Card className="max-w-md border-hairline bg-surface-1 p-6 text-center shadow-sm">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">Access Denied</CardTitle>
            <CardDescription className="text-xs">
              Only workspace Owners and Administrators can modify workspace configurations.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSettingsSubmit = async (formData: SettingsFormData) => {
    if (!settingsQuery.data) return;
    try {
      await updateSettingsMutation.mutateAsync({
        ...settingsQuery.data,
        ...formData,
      });
      toast.success("Workspace settings updated successfully.");
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error 
        || "Failed to update settings.";
      toast.error(errorMsg);
    }
  };

  return (
    <div className="flex min-h-full flex-col gap-6 px-4 py-4 pb-6 text-ink max-w-3xl">
      {/* Workspace URL / Slug Card */}
      <Card className="border-hairline bg-surface-1 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Workspace Link & Slug</CardTitle>
          <CardDescription className="text-xs">
            Copy the workspace URL or slug to share with others.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Slug */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Workspace Slug</label>
              <div className="relative flex items-center">
                <Input
                  readOnly
                  value={workspaceQuery.data?.slug || ""}
                  className="h-9 text-xs bg-surface-2 border-hairline pr-10 select-all font-mono w-full"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (workspaceQuery.data?.slug) {
                      navigator.clipboard.writeText(workspaceQuery.data.slug);
                      toast.success("Workspace slug copied!");
                    }
                  }}
                  className="absolute right-3 text-ink-muted hover:text-ink transition-colors cursor-pointer"
                  title="Copy Slug"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>

            {/* URL */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Workspace URL</label>
              <div className="relative flex items-center">
                <Input
                  readOnly
                  value={workspaceQuery.data ? `${window.location.origin}/${workspaceQuery.data.slug}` : ""}
                  className="h-9 text-xs bg-surface-2 border-hairline pr-10 select-all font-mono w-full"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (workspaceQuery.data?.slug) {
                      const url = `${window.location.origin}/${workspaceQuery.data.slug}`;
                      navigator.clipboard.writeText(url);
                      toast.success("Workspace URL copied!");
                    }
                  }}
                  className="absolute right-3 text-ink-muted hover:text-ink transition-colors cursor-pointer"
                  title="Copy URL"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit(handleSettingsSubmit)} className="flex flex-col gap-6">
        <Card className="border-hairline bg-surface-1 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">General configuration</CardTitle>
            <CardDescription className="text-xs">
              Branding, language defaults, and concurrent limits.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">Default Language</label>
                <Select
                  value={watchAll.defaultLanguage || ""}
                  onValueChange={(val) => setValue("defaultLanguage", val || "", { shouldDirty: true })}
                >
                  <SelectTrigger className="h-9 text-xs bg-surface-2 border-hairline">
                    <SelectValue placeholder="Select language..." />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((l) => (
                      <SelectItem key={l.code} value={l.code} className="text-xs">
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">Timezone</label>
                <Select
                  value={watchAll.timezone || ""}
                  onValueChange={(val) => setValue("timezone", val || "", { shouldDirty: true })}
                >
                  <SelectTrigger className="h-9 text-xs bg-surface-2 border-hairline">
                    <SelectValue placeholder="Select timezone..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC" className="text-xs">UTC (Greenwich Mean Time)</SelectItem>
                    <SelectItem value="GMT+7" className="text-xs">GMT+7 (Indochina Time)</SelectItem>
                    <SelectItem value="GMT+9" className="text-xs">GMT+9 (Japan Standard Time)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">Max Active Rooms</label>
                <Input
                  type="number"
                  className="h-9 border-hairline focus:ring-1 focus:ring-primary text-xs bg-surface-2/40"
                  {...register("maxActiveRooms", { valueAsNumber: true })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">Artifact Retention (Days)</label>
                <Input
                  type="number"
                  className="h-9 border-hairline focus:ring-1 focus:ring-primary text-xs bg-surface-2/40"
                  {...register("artifactRetentionDays", { valueAsNumber: true })}
                  disabled={isSubmitting}
                />
                <span className="text-[10px] text-ink-muted">
                  Set to 0 for indefinite retention.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-hairline bg-surface-2 p-2.5 mt-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold">Enforce Host Admission by Default</span>
                <span className="text-[9px] text-ink-muted">Requires host permission for participants joining room</span>
              </div>
              <Switch
                checked={!!watchAll.enforceHostApprovalDefault}
                onCheckedChange={(val) => setValue("enforceHostApprovalDefault", val, { shouldDirty: true })}
                disabled={isSubmitting}
              />
            </div>

            <div className="pt-2 border-t border-hairline mt-2">
              <button
                type="submit"
                className="flex h-9 px-6 w-full sm:w-auto items-center justify-center gap-2 rounded-md bg-primary font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50 text-xs sm:self-end cursor-pointer"
                disabled={isSubmitting || updateSettingsMutation.isPending}
              >
                {updateSettingsMutation.isPending ? (
                  <Spinner className="h-4 w-4 animate-spin text-white" />
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
          </CardContent>
        </Card>
      </form>

    </div>
  );
}
