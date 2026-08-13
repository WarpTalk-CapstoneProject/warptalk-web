import type { SelectWorkspaceResponse } from "@/types/workspace";

type SetActiveWorkspace = (
  id: string | null,
  name: string | null,
  slug: string | null,
  role: string | null,
  membershipType: string | null,
  defaultLanguage: string | null,
) => void;

export function applySelectedWorkspace(
  selection: SelectWorkspaceResponse,
  setActiveWorkspace: SetActiveWorkspace,
) {
  setActiveWorkspace(
    selection.selectedWorkspaceId,
    selection.name,
    selection.slug,
    selection.role,
    selection.membershipType,
    selection.defaultLanguage || "en",
  );
}
