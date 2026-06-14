import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { Workspace, WorkspaceMember } from "@/types/workspace";

export const workspaceService = {
  getWorkspaces: async (): Promise<Workspace[]> => {
    try {
      const response = await apiClient.get<Workspace[]>(API.workspaces.list);
      return response.data;
    } catch (e) {
      // Mock data since WorkspaceService is not deployed
      return [{
        id: "019ec641-97a7-78c9-8f18-000000000000",
        name: "FPT-SEP490-SU26",
        slug: "fpt-sep490-su26",
        description: "Mock workspace",
        logoUrl: undefined,
        ownerId: "019ec641-97a7-78c9-8f18-000000000000",
        createdAt: new Date().toISOString(),
      }];
    }
  },

  getWorkspace: async (id: string): Promise<Workspace> => {
    return {
      id: "019ec641-97a7-78c9-8f18-000000000000",
      name: "FPT-SEP490-SU26",
      slug: "fpt-sep490-su26",
      description: "Mock workspace",
      logoUrl: undefined,
      ownerId: "019ec641-97a7-78c9-8f18-000000000000",
      createdAt: new Date().toISOString(),
    };
  },

  getWorkspaceMembers: async (workspaceId: string): Promise<WorkspaceMember[]> => {
    try {
      const response = await apiClient.get<WorkspaceMember[]>(API.workspaces.members(workspaceId));
      return response.data;
    } catch (e) {
      // Return the mock seed data we just inserted into DB
      const firstNames = ['John', 'Jane', 'Michael', 'Emily', 'David', 'Sarah', 'James', 'Anna', 'Robert', 'Laura', 'William', 'Emma', 'Joseph', 'Olivia', 'Charles', 'Sophia', 'Thomas', 'Isabella', 'Daniel', 'Mia'];
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
      
      const members: WorkspaceMember[] = [];
      for (let i = 0; i < 20; i++) {
        members.push({
          id: `mock-member-${i}`,
          workspaceId: workspaceId,
          userId: `mock-user-${i}`,
          roleId: "95beb6bb-a255-4958-891f-68fa540ebe3d",
          email: `${firstNames[i].toLowerCase()}.${lastNames[i].toLowerCase()}${i+1}@warptalk.com`,
          fullName: `${firstNames[i]} ${lastNames[i]}`,
          avatarUrl: undefined,
          joinedAt: new Date().toISOString()
        });
      }
      
      // Add existing accounts
      members.push({
        id: "admin-member",
        workspaceId,
        userId: "admin-user",
        roleId: "99bf57ba-9d3c-471b-a5ae-94901a0c81b4",
        email: "admin@warptalk.com",
        fullName: "System Admin",
        joinedAt: new Date().toISOString()
      });
      members.push({
        id: "owner-member",
        workspaceId,
        userId: "owner-user",
        roleId: "99bf57ba-9d3c-471b-a5ae-94901a0c81b4",
        email: "owner@warptalk.com",
        fullName: "Workspace Owner",
        joinedAt: new Date().toISOString()
      });
      members.push({
        id: "member-member",
        workspaceId,
        userId: "member-user",
        roleId: "95beb6bb-a255-4958-891f-68fa540ebe3d",
        email: "member@warptalk.com",
        fullName: "Regular Member",
        joinedAt: new Date().toISOString()
      });

      return members;
    }
  },
};
