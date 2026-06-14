export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  roleId: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  membershipType: "internal" | "external";
  status: "active" | "inactive" | "invited";
  joinedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  allowExternalCollaboration: boolean;
  isActive: boolean;
}
