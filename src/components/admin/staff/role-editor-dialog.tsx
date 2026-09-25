"use client";

/**
 * Create or edit a staff role: a name, a sentence about what it is for, and a permission matrix
 * grouped by admin area (G10).
 *
 * Built-in roles open read-only with a "Duplicate" way out, because the server refuses to edit
 * them. The matrix greys out what the editor cannot grant — the server refuses a role that gives
 * more than its author holds, and the role the editor holds cannot be edited at all.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, LockSimple } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { InlineError, StaffRoleBadge } from "@/components/admin/staff/staff-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { useCreateStaffRole, useUpdateStaffRole } from "@/hooks/use-admin-staff";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { hasPermission, isAdminPermission, isReadPermission, permissionsByArea } from "@/lib/admin/staff-permissions";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { StaffPermissionDto, StaffRoleDto } from "@/types/admin-staff";

export type RoleEditorTarget = { mode: "create" } | { mode: "edit"; role: StaffRoleDto };

export function RoleEditorDialog({
  target,
  onOpenChange,
  catalog,
  ownRoleSlug,
  onDuplicate,
}: {
  target: RoleEditorTarget | null;
  onOpenChange: (open: boolean) => void;
  catalog: readonly StaffPermissionDto[];
  ownRoleSlug: string | null;
  onDuplicate: (role: StaffRoleDto) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-2xl">
        {target ? (
          <RoleEditorForm
            key={target.mode === "edit" ? target.role.id : "new"}
            target={target}
            catalog={catalog}
            ownRoleSlug={ownRoleSlug}
            onDone={() => onOpenChange(false)}
            onDuplicate={onDuplicate}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RoleEditorForm({
  target,
  catalog,
  ownRoleSlug,
  onDone,
  onDuplicate,
}: {
  target: RoleEditorTarget;
  catalog: readonly StaffPermissionDto[];
  ownRoleSlug: string | null;
  onDone: () => void;
  onDuplicate: (role: StaffRoleDto) => void;
}) {
  const t = useTranslations("adminStaff.roleEditor");
  const tArea = useTranslations("adminStaff.areas");
  const { access } = useStaffAccess();
  const create = useCreateStaffRole();
  const update = useUpdateStaffRole();
  const role = target.mode === "edit" ? target.role : null;

  const readOnly = role !== null && (role.isBuiltIn || role.slug === ownRoleSlug || !hasPermission(access, "staff.manage"));
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const [error, setError] = useState<string | null>(null);

  const descriptions = useMemo(() => new Map(catalog.map((p) => [p.code, p.description])), [catalog]);
  const groups = useMemo(() => permissionsByArea(catalog.map((p) => p.code)), [catalog]);
  const grantable = (code: string) => access.isSuperAdmin || (isAdminPermission(code) && hasPermission(access, code));

  const toggle = (code: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });

  const setArea = (codes: readonly string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const code of codes) {
        if (!grantable(code)) continue;
        if (on) next.add(code);
        else next.delete(code);
      }
      return next;
    });

  const isPending = create.isPending || update.isPending;

  const submit = async () => {
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    if (selected.size === 0) {
      setError(t("permissionsRequired"));
      return;
    }
    const request = {
      name: name.trim(),
      description: description.trim() || null,
      permissions: [...selected],
    };
    try {
      setError(null);
      if (role) await update.mutateAsync({ id: role.id, request });
      else await create.mutateAsync(request);
      toast.success(role ? t("savedToast", { name: request.name }) : t("createdToast", { name: request.name }));
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, t("genericError")));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {role ? (readOnly ? t("viewTitle") : t("editTitle")) : t("createTitle")}
          {role ? <StaffRoleBadge name={role.name} isSuperAdmin={role.isSuperAdmin} /> : null}
        </DialogTitle>
        <DialogDescription>
          {role?.isBuiltIn
            ? t("builtInDescription")
            : role && role.slug === ownRoleSlug
              ? t("ownRoleDescription")
              : t("description")}
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid max-h-[62vh] gap-4 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="role-name" className="text-[12px] text-ink-muted">
              {t("nameLabel")}
            </Label>
            <Input
              id="role-name"
              className="mt-1.5"
              value={name}
              maxLength={50}
              disabled={readOnly}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </div>
          <div>
            <Label htmlFor="role-description" className="text-[12px] text-ink-muted">
              {t("descriptionLabel")}
            </Label>
            <Textarea
              id="role-description"
              className="mt-1.5 min-h-9"
              rows={1}
              maxLength={255}
              disabled={readOnly}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("descriptionPlaceholder")}
            />
          </div>
        </div>

        {role?.isSuperAdmin ? (
          <p className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-[12px] text-ink-muted">
            {t("superAdminNote")}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-hairline">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] border-b border-hairline bg-surface-2/60 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
            <span>{t("matrixPermission")}</span>
            <span>{t("matrixGranted")}</span>
          </div>
          {groups.map((group) => {
            const areaCodes = group.permissions;
            const allOn = areaCodes.every((code) => selected.has(code) || role?.isSuperAdmin);
            return (
              <section key={group.area} className="border-b border-hairline last:border-b-0">
                <div className="flex items-center justify-between gap-2 bg-surface-1 px-3 pt-2.5 pb-1">
                  <h3 className="text-[12px] font-semibold text-ink">{tArea(group.area)}</h3>
                  {!readOnly ? (
                    <button
                      type="button"
                      className="text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                      onClick={() => setArea(areaCodes, !allOn)}
                    >
                      {allOn ? t("clearArea") : t("selectArea")}
                    </button>
                  ) : null}
                </div>
                <ul>
                  {areaCodes.map((code) => {
                    const checked = role?.isSuperAdmin ? true : selected.has(code);
                    const disabled = readOnly || !grantable(code);
                    return (
                      <li key={code} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-1.5">
                        <label htmlFor={`perm-${code}`} className={cn("min-w-0", !disabled && "cursor-pointer")}>
                          <span className="flex items-center gap-1.5">
                            <code className="text-[12px] font-medium text-ink">{code}</code>
                            <span
                              className={cn(
                                "rounded px-1 text-[10px] font-medium uppercase",
                                isReadPermission(code) ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                              )}
                            >
                              {isReadPermission(code) ? t("kindView") : t("kindChange")}
                            </span>
                            {!readOnly && !grantable(code) ? (
                              <LockSimple size={11} className="text-ink-subtle" aria-label={t("notGrantable")} />
                            ) : null}
                          </span>
                          <span className="block text-[11px] leading-4 text-ink-muted">{descriptions.get(code)}</span>
                        </label>
                        <Checkbox
                          id={`perm-${code}`}
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(value) => toggle(code, value === true)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        {error ? <InlineError message={error} /> : null}
      </div>

      <DialogFooter className="mt-5">
        {role && readOnly && hasPermission(access, "staff.manage") ? (
          <Button variant="outline" onClick={() => onDuplicate(role)}>
            <Copy size={14} />
            {t("duplicate")}
          </Button>
        ) : null}
        <Button variant="outline" onClick={onDone} disabled={isPending}>
          {readOnly ? t("close") : t("cancel")}
        </Button>
        {!readOnly ? (
          <Button onClick={() => void submit()} disabled={isPending}>
            {isPending ? t("saving") : role ? t("save") : t("create")}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}
