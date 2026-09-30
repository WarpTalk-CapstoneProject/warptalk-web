"use client";

/**
 * /admin/roles — staff roles and the permission catalog (G10).
 *
 * Roles: the six built-ins (read-only; duplicate one to start a custom role) and any custom
 * roles, with how many people hold each. Permissions: every permission the platform has, grouped
 * by admin area, with how many roles and people hold it — and, one click further, who exactly.
 *
 * The permission list is not decided here. It is the backend's AdminPermissions catalog, derived
 * from the admin endpoints that exist; every one of those endpoints requires exactly one code.
 */

import { Copy, DotsThree, Eye, Key, PencilSimple, Plus, Trash, UserGear, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminFilterTabs, AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  useAdminActionIntent,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { PermissionHoldersDialog } from "@/components/admin/staff/permission-holders-dialog";
import { RoleEditorDialog, type RoleEditorTarget } from "@/components/admin/staff/role-editor-dialog";
import { StaffReasonDialog, StaffRoleBadge, formatStaffDate } from "@/components/admin/staff/staff-ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useDeleteStaffRole,
  useDuplicateStaffRole,
  useStaffPermissionCatalog,
  useStaffRoles,
} from "@/hooks/use-admin-staff";
import { useCan, useStaffAccess } from "@/hooks/use-staff-access";
import { applyClientListState, enumValue, type ListStateConfig } from "@/lib/admin/list-state";
import { matchesSearch } from "@/lib/admin/search-text";
import { ADMIN_PERMISSIONS, ALL_ADMIN_PERMISSIONS, PERMISSION_AREAS, canGrantRole } from "@/lib/admin/staff-permissions";
import { getErrorMessage } from "@/lib/api/errors";
import type { StaffPermissionDto, StaffRoleDto } from "@/types/admin-staff";

type View = "roles" | "permissions";

const LIST_CONFIG: ListStateConfig = {
  filters: [{ key: "kind", kind: "enum", values: ["builtIn", "custom"] }],
  sortFields: ["name", "permissions", "members", "updated"],
  defaultSort: { field: "name", direction: "asc" },
  columns: [{ id: "role" }, { id: "permissions" }, { id: "members" }, { id: "updated" }, { id: "actions" }],
  groupings: ["kind"],
};

function RolesScreen() {
  const t = useTranslations("adminStaff.roles");
  const tArea = useTranslations("adminStaff.areas");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view: View = searchParams.get("view") === "permissions" ? "permissions" : "roles";
  const setView = (next: View) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "roles") params.delete("view");
    else params.set("view", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const list = useAdminListState(LIST_CONFIG);
  const { access } = useStaffAccess();
  const canManage = useCan(ADMIN_PERMISSIONS.staffManage);
  const roles = useStaffRoles();
  const catalog = useStaffPermissionCatalog();
  const duplicate = useDuplicateStaffRole();
  const remove = useDeleteStaffRole();

  const [editor, setEditor] = useState<RoleEditorTarget | null>(null);
  const [deleting, setDeleting] = useState<StaffRoleDto | null>(null);
  const [holdersOf, setHoldersOf] = useState<string | null>(null);
  useAdminActionIntent({ create: () => canManage && setEditor({ mode: "create" }) });

  const kind = enumValue(list.state.filters, "kind");
  const rows = useMemo(() => {
    const all = roles.data ?? [];
    return applyClientListState(
      all,
      list.state,
      {
        search: (role) => [role.name, role.slug, role.description],
        filters: { kind: (role) => (role.isBuiltIn ? "builtIn" : "custom") },
        sort: {
          name: (role) => role.name.toLowerCase(),
          permissions: (role) => role.permissions.length,
          members: (role) => role.memberCount,
          updated: (role) => new Date(role.updatedAt),
        },
      },
      matchesSearch,
    );
  }, [roles.data, list.state]);

  const runDuplicate = async (role: StaffRoleDto) => {
    try {
      const copy = await duplicate.mutateAsync({ id: role.id });
      toast.success(t("duplicatedToast", { name: copy.name }));
      setEditor({ mode: "edit", role: copy });
    } catch (err) {
      toast.error(getErrorMessage(err, t("duplicateError")));
    }
  };

  const filterFields = useMemo<AdminFilterField[]>(
    () => [
      {
        key: "kind",
        label: t("filters.kind"),
        icon: <UserGear size={13} />,
        kind: "enum",
        options: [
          { value: "builtIn", label: t("filters.builtIn") },
          { value: "custom", label: t("filters.custom") },
        ],
      },
    ],
    [t],
  );

  const columns = useMemo<AdminColumn<StaffRoleDto>[]>(
    () => [
      {
        id: "role",
        header: t("columns.role"),
        primary: true,
        sortField: "name",
        cell: (role) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StaffRoleBadge name={role.name} isSuperAdmin={role.isSuperAdmin} />
              <span className="text-[11px] text-ink-subtle">{role.isBuiltIn ? t("builtIn") : t("custom")}</span>
            </div>
            {role.description ? <p className="mt-1 truncate text-xs text-ink-muted">{role.description}</p> : null}
          </div>
        ),
      },
      {
        id: "permissions",
        header: t("columns.permissions"),
        align: "right",
        className: "w-[130px]",
        sortField: "permissions",
        defaultDirection: "desc",
        cell: (role) => (
          <span className="text-xs text-ink-muted">
            {role.isSuperAdmin ? t("all") : t("permissionCount", { count: role.permissions.length, total: ALL_ADMIN_PERMISSIONS.length })}
          </span>
        ),
      },
      {
        id: "members",
        header: t("columns.members"),
        align: "right",
        className: "w-[120px]",
        sortField: "members",
        defaultDirection: "desc",
        cell: (role) => (
          <div className="text-right">
            <p className="text-xs text-ink-muted">{role.memberCount}</p>
            {role.pendingInvitationCount > 0 ? (
              <p className="text-[11px] text-ink-subtle">{t("pendingInvites", { count: role.pendingInvitationCount })}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "updated",
        header: t("columns.updated"),
        align: "right",
        className: "w-[130px]",
        sortField: "updated",
        defaultDirection: "desc",
        cell: (role) => <span className="text-xs text-ink-muted">{formatStaffDate(role.updatedAt, locale)}</span>,
      },
      {
        id: "actions",
        header: t("columns.actions"),
        align: "right",
        className: "w-[64px]",
        cell: (role) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t("menu.open", { name: role.name })}
              className="inline-grid size-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <DotsThree size={16} weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[190px]">
              <DropdownMenuItem onClick={() => setEditor({ mode: "edit", role })}>
                {canManage && !role.isBuiltIn && role.slug !== access.roleSlug ? <PencilSimple size={14} /> : <Eye size={14} />}
                {canManage && !role.isBuiltIn && role.slug !== access.roleSlug ? t("menu.edit") : t("menu.view")}
              </DropdownMenuItem>
              {canManage && canGrantRole(access, role) ? (
                <DropdownMenuItem onClick={() => void runDuplicate(role)}>
                  <Copy size={14} />
                  {t("menu.duplicate")}
                </DropdownMenuItem>
              ) : null}
              {canManage && !role.isBuiltIn ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={role.memberCount > 0 || role.pendingInvitationCount > 0}
                    onClick={() => setDeleting(role)}
                  >
                    <Trash size={14} />
                    {role.memberCount > 0 || role.pendingInvitationCount > 0 ? t("menu.deleteInUse") : t("menu.delete")}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // runDuplicate is recreated each render and only reads stable mutation handles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale, canManage, access],
  );

  const permissionRows = useMemo(() => {
    const byArea = new Map<string, number>(PERMISSION_AREAS.map((area, index) => [area, index]));
    return [...(catalog.data?.permissions ?? [])].sort(
      (a, b) => (byArea.get(a.area) ?? 99) - (byArea.get(b.area) ?? 99),
    );
  }, [catalog.data]);

  const permissionColumns = useMemo<AdminColumn<StaffPermissionDto>[]>(
    () => [
      {
        id: "permission",
        header: t("permissionColumns.permission"),
        primary: true,
        cell: (permission) => (
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <code className="text-[12px] font-medium text-ink">{permission.code}</code>
              <span className="text-[11px] text-ink-subtle">{tArea(permission.area)}</span>
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">{permission.description}</p>
          </div>
        ),
      },
      {
        id: "roles",
        header: t("permissionColumns.roles"),
        align: "right",
        className: "w-[90px]",
        cell: (permission) => <span className="text-xs text-ink-muted">{permission.roleCount}</span>,
      },
      {
        id: "members",
        header: t("permissionColumns.members"),
        align: "right",
        className: "w-[90px]",
        cell: (permission) => <span className="text-xs text-ink-muted">{permission.memberCount}</span>,
      },
      {
        id: "who",
        header: t("permissionColumns.who"),
        align: "right",
        className: "w-[130px]",
        cell: (permission) => (
          <Button variant="outline" size="sm" onClick={() => setHoldersOf(permission.code)}>
            <UsersThree size={13} />
            {t("whoHasIt")}
          </Button>
        ),
      },
    ],
    [t, tArea],
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<UserGear size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
              <Plus size={14} />
              {t("create")}
            </Button>
          ) : null
        }
      />

      <AdminFilterTabs<View>
        label={t("viewLabel")}
        value={view}
        onChange={setView}
        tabs={[
          { value: "roles", label: t("views.roles") },
          { value: "permissions", label: t("views.permissions") },
        ]}
      />

      {view === "roles" ? (
        <>
          <AdminListToolbar
            list={list}
            searchPlaceholder={t("searchPlaceholder")}
            filters={filterFields}
            count={roles.isPending ? null : rows.length}
            countLabel={t("count", { count: rows.length })}
            display={{
              sortOptions: [
                { field: "name", label: t("sort.name") },
                { field: "permissions", label: t("sort.permissions") },
                { field: "members", label: t("sort.members") },
                { field: "updated", label: t("sort.updated") },
              ],
              groupOptions: [{ key: "kind", label: t("filters.kind") }],
              columns: columns.filter((c) => !c.primary).map((c) => ({ id: c.id, label: c.header })),
            }}
          />
          <AdminPanel>
            <AdminDataTable
              list={list}
              columns={columns}
              rows={rows}
              rowKey={(role) => role.id}
              onRowClick={(role) => setEditor({ mode: "edit", role })}
              isPending={roles.isPending}
              isError={roles.isError}
              onRetry={() => void roles.refetch()}
              empty={{
                title: kind ? t("emptyFilteredTitle") : t("emptyTitle"),
                description: t("emptyDescription"),
                icon: <UserGear size={20} weight="duotone" />,
              }}
              groupings={{
                kind: {
                  keyOf: (role) => (role.isBuiltIn ? "builtIn" : "custom"),
                  label: (key) => t(`filters.${key}`),
                  order: ["builtIn", "custom"],
                },
              }}
              caption={t("title")}
            />
          </AdminPanel>
        </>
      ) : (
        <AdminPanel>
          <AdminDataTable
            columns={permissionColumns}
            rows={permissionRows}
            rowKey={(permission) => permission.code}
            isPending={catalog.isPending}
            isError={catalog.isError}
            onRetry={() => void catalog.refetch()}
            empty={{ title: t("emptyTitle"), icon: <Key size={20} weight="duotone" /> }}
            caption={t("views.permissions")}
          />
        </AdminPanel>
      )}

      <RoleEditorDialog
        target={editor}
        onOpenChange={(open) => !open && setEditor(null)}
        catalog={catalog.data?.permissions ?? []}
        ownRoleSlug={access.roleSlug}
        onDuplicate={(role) => {
          setEditor(null);
          void runDuplicate(role);
        }}
      />
      <PermissionHoldersDialog code={holdersOf} onOpenChange={(open) => !open && setHoldersOf(null)} />
      {deleting ? (
        <StaffReasonDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title={t("deleteDialog.title", { name: deleting.name })}
          description={t("deleteDialog.description")}
          subject={{ primary: deleting.name, secondary: deleting.description ?? undefined }}
          confirmLabel={t("deleteDialog.confirm")}
          pendingLabel={t("deleteDialog.pending")}
          destructive
          isSaving={remove.isPending}
          onSubmit={async (reason) => {
            await remove.mutateAsync({ id: deleting.id, reason });
            toast.success(t("deleteDialog.done", { name: deleting.name }));
          }}
        />
      ) : null}
    </AdminPage>
  );
}

export default function AdminRolesPage() {
  // Same ground as the page it stands in for — see check-admin-surface-contract.
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <RolesScreen />
    </Suspense>
  );
}
