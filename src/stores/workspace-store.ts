import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WorkspaceState {
  activeWorkspaceId: string | null;
  activeWorkspaceName: string | null;
  activeWorkspaceSlug: string | null;
  role: string | null;
  membershipType: string | null;
  defaultLanguage: string | null;

  setActiveWorkspace: (
    id: string | null,
    name: string | null,
    slug: string | null,
    role: string | null,
    membershipType: string | null,
    defaultLanguage: string | null
  ) => void;
  clearActiveWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      activeWorkspaceName: null,
      activeWorkspaceSlug: null,
      role: null,
      membershipType: null,
      defaultLanguage: null,

      setActiveWorkspace: (id, name, slug, role, membershipType, defaultLanguage) => {
        if (typeof document !== "undefined") {
          if (id) {
            document.cookie = `active_workspace_id=${id}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
          } else {
            document.cookie = "active_workspace_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          }
          if (slug) {
            document.cookie = `active_workspace_slug=${slug}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
          } else {
            document.cookie = "active_workspace_slug=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          }
          if (defaultLanguage) {
            document.cookie = `active_workspace_lang=${defaultLanguage}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
          } else {
            document.cookie = "active_workspace_lang=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          }
        }
        set({
          activeWorkspaceId: id,
          activeWorkspaceName: name,
          activeWorkspaceSlug: slug,
          role: role,
          membershipType: membershipType,
          defaultLanguage: defaultLanguage,
        });
      },

      clearActiveWorkspace: () => {
        if (typeof document !== "undefined") {
          document.cookie = "active_workspace_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          document.cookie = "active_workspace_slug=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          document.cookie = "active_workspace_lang=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
        set({
          activeWorkspaceId: null,
          activeWorkspaceName: null,
          activeWorkspaceSlug: null,
          role: null,
          membershipType: null,
          defaultLanguage: null,
        });
      },
    }),
    {
      name: "warptalk-workspace",
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
        activeWorkspaceName: state.activeWorkspaceName,
        activeWorkspaceSlug: state.activeWorkspaceSlug,
        role: state.role,
        membershipType: state.membershipType,
        defaultLanguage: state.defaultLanguage,
      }),
    }
  )
);
