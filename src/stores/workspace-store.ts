import { create } from "zustand";
import { persist } from "zustand/middleware";
import { normalizeWorkspaceSlug } from "../lib/workspace-slug.ts";
import { normalizeWorkspaceRole, type WorkspaceRole } from "../lib/workspace-role.ts";

interface WorkspaceState {
  activeWorkspaceId: string | null;
  activeWorkspaceName: string | null;
  activeWorkspaceSlug: string | null;
  /**
   * Always canonical lowercase. Typed as the union rather than `string` so that comparing
   * it to an API-cased literal ("Owner"/"Admin") is a compile error, not a silent false.
   */
  role: WorkspaceRole | null;
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

/**
 * Exactly what `partialize` writes to localStorage. Kept separate from `WorkspaceState`
 * because the persisted v0 shape carried a raw, API-cased `role`.
 */
type PersistedWorkspaceState = Omit<
  WorkspaceState,
  "setActiveWorkspace" | "clearActiveWorkspace" | "role"
> & { role: string | null };

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
        const safeSlug = normalizeWorkspaceSlug(slug);
        if (typeof document !== "undefined") {
          if (id) {
            document.cookie = `active_workspace_id=${id}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
          } else {
            document.cookie = "active_workspace_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          }
          if (safeSlug) {
            document.cookie = `active_workspace_slug=${safeSlug}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
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
          activeWorkspaceSlug: safeSlug,
          role: normalizeWorkspaceRole(role),
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
      // v0 persisted whatever casing the API sent ("Owner"). Anyone who logged in before
      // the lowercasing landed still carries that in localStorage, so rehydrating it
      // unchanged would keep two different shapes of `role` alive at once.
      version: 1,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as PersistedWorkspaceState;
        if (version < 1) {
          return { ...state, role: normalizeWorkspaceRole(state.role) };
        }
        return state;
      },
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
