import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { StaffAccessSnapshot } from "@/lib/admin/staff-permissions";
import type {
  InviteStaffResult,
  PermissionHoldersDto,
  SaveStaffRoleRequest,
  StaffDirectoryPage,
  StaffDirectoryQuery,
  StaffInvitationDto,
  StaffMemberDto,
  StaffPermissionCatalogDto,
  StaffRoleDto,
} from "@/types/admin-staff";

/**
 * /admin/staff and /admin/roles (G10). Every call is enforced server-side by a staff permission
 * the auth service resolves per request; the portal hiding a button is a courtesy, not the gate.
 */
export const adminStaffService = {
  me: async (): Promise<StaffAccessSnapshot> => {
    const { data } = await apiClient.get<StaffAccessSnapshot>(API.adminStaff.me);
    return data;
  },

  list: async (query: StaffDirectoryQuery): Promise<StaffDirectoryPage> => {
    const { data } = await apiClient.get<StaffDirectoryPage>(API.adminStaff.base, { params: query });
    return data;
  },

  get: async (userId: string): Promise<StaffMemberDto> => {
    const { data } = await apiClient.get<StaffMemberDto>(API.adminStaff.detail(userId));
    return data;
  },

  invite: async (email: string, roleId: string, reason?: string): Promise<InviteStaffResult> => {
    const { data } = await apiClient.post<InviteStaffResult>(API.adminStaff.invitations, { email, roleId, reason });
    return data;
  },

  invitations: async (): Promise<StaffInvitationDto[]> => {
    const { data } = await apiClient.get<StaffInvitationDto[]>(API.adminStaff.invitations);
    return data;
  },

  revokeInvitation: async (id: string, reason: string): Promise<StaffInvitationDto> => {
    const { data } = await apiClient.post<StaffInvitationDto>(API.adminStaff.revokeInvitation(id), { reason });
    return data;
  },

  changeRole: async (userId: string, roleId: string, reason: string): Promise<StaffMemberDto> => {
    const { data } = await apiClient.post<StaffMemberDto>(API.adminStaff.role(userId), { roleId, reason });
    return data;
  },

  suspend: async (userId: string, reason: string): Promise<StaffMemberDto> => {
    const { data } = await apiClient.post<StaffMemberDto>(API.adminStaff.suspend(userId), { reason });
    return data;
  },

  reactivate: async (userId: string, reason: string): Promise<StaffMemberDto> => {
    const { data } = await apiClient.post<StaffMemberDto>(API.adminStaff.reactivate(userId), { reason });
    return data;
  },

  remove: async (userId: string, reason: string): Promise<void> => {
    await apiClient.post(API.adminStaff.remove(userId), { reason });
  },

  roles: async (): Promise<StaffRoleDto[]> => {
    const { data } = await apiClient.get<StaffRoleDto[]>(API.adminStaff.roles);
    return data;
  },

  createRole: async (request: SaveStaffRoleRequest): Promise<StaffRoleDto> => {
    const { data } = await apiClient.post<StaffRoleDto>(API.adminStaff.roles, request);
    return data;
  },

  updateRole: async (id: string, request: SaveStaffRoleRequest): Promise<StaffRoleDto> => {
    const { data } = await apiClient.put<StaffRoleDto>(API.adminStaff.roleDetail(id), request);
    return data;
  },

  duplicateRole: async (id: string, name?: string): Promise<StaffRoleDto> => {
    const { data } = await apiClient.post<StaffRoleDto>(API.adminStaff.duplicateRole(id), { name: name ?? null });
    return data;
  },

  deleteRole: async (id: string, reason: string): Promise<void> => {
    await apiClient.post(API.adminStaff.deleteRole(id), { reason });
  },

  permissions: async (): Promise<StaffPermissionCatalogDto> => {
    const { data } = await apiClient.get<StaffPermissionCatalogDto>(API.adminStaff.permissions);
    return data;
  },

  permissionHolders: async (code: string): Promise<PermissionHoldersDto> => {
    const { data } = await apiClient.get<PermissionHoldersDto>(API.adminStaff.permissionHolders(code));
    return data;
  },
};
