"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { STAFF_ACCESS_KEY } from "@/hooks/use-staff-access";
import { adminStaffService } from "@/services/admin-staff.service";
import type { SaveStaffRoleRequest, StaffDirectoryQuery } from "@/types/admin-staff";

export const ADMIN_STAFF_KEYS = {
  all: ["admin-staff"] as const,
  directory: (query: StaffDirectoryQuery) => ["admin-staff", "directory", query] as const,
  invitations: ["admin-staff", "invitations"] as const,
  roles: ["admin-staff", "roles"] as const,
  permissions: ["admin-staff", "permissions"] as const,
  holders: (code: string) => ["admin-staff", "holders", code] as const,
};

export function useStaffDirectory(query: StaffDirectoryQuery) {
  return useQuery({
    queryKey: ADMIN_STAFF_KEYS.directory(query),
    queryFn: () => adminStaffService.list(query),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
}

export function useStaffInvitations(enabled = true) {
  return useQuery({
    queryKey: ADMIN_STAFF_KEYS.invitations,
    queryFn: adminStaffService.invitations,
    enabled,
    staleTime: 15_000,
  });
}

export function useStaffRoles() {
  return useQuery({ queryKey: ADMIN_STAFF_KEYS.roles, queryFn: adminStaffService.roles, staleTime: 30_000 });
}

export function useStaffPermissionCatalog() {
  return useQuery({ queryKey: ADMIN_STAFF_KEYS.permissions, queryFn: adminStaffService.permissions, staleTime: 30_000 });
}

export function usePermissionHolders(code: string | null) {
  return useQuery({
    queryKey: ADMIN_STAFF_KEYS.holders(code ?? ""),
    queryFn: () => adminStaffService.permissionHolders(code!),
    enabled: Boolean(code),
    staleTime: 15_000,
  });
}

/**
 * Every staff write invalidates the whole staff cache and the caller's own access: a role edit
 * can change what the editor sees, and the lists show counts that every write moves.
 */
function useStaffMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_STAFF_KEYS.all }),
        queryClient.invalidateQueries({ queryKey: STAFF_ACCESS_KEY }),
      ]);
    },
  });
}

export const useInviteStaff = () =>
  useStaffMutation((args: { email: string; roleId: string; reason?: string }) =>
    adminStaffService.invite(args.email, args.roleId, args.reason));

export const useRevokeStaffInvitation = () =>
  useStaffMutation((args: { id: string; reason: string }) => adminStaffService.revokeInvitation(args.id, args.reason));

export const useChangeStaffRole = () =>
  useStaffMutation((args: { userId: string; roleId: string; reason: string }) =>
    adminStaffService.changeRole(args.userId, args.roleId, args.reason));

export const useSuspendStaff = () =>
  useStaffMutation((args: { userId: string; reason: string }) => adminStaffService.suspend(args.userId, args.reason));

export const useReactivateStaff = () =>
  useStaffMutation((args: { userId: string; reason: string }) => adminStaffService.reactivate(args.userId, args.reason));

export const useRemoveStaff = () =>
  useStaffMutation((args: { userId: string; reason: string }) => adminStaffService.remove(args.userId, args.reason));

export const useCreateStaffRole = () =>
  useStaffMutation((request: SaveStaffRoleRequest) => adminStaffService.createRole(request));

export const useUpdateStaffRole = () =>
  useStaffMutation((args: { id: string; request: SaveStaffRoleRequest }) => adminStaffService.updateRole(args.id, args.request));

export const useDuplicateStaffRole = () =>
  useStaffMutation((args: { id: string; name?: string }) => adminStaffService.duplicateRole(args.id, args.name));

export const useDeleteStaffRole = () =>
  useStaffMutation((args: { id: string; reason: string }) => adminStaffService.deleteRole(args.id, args.reason));
