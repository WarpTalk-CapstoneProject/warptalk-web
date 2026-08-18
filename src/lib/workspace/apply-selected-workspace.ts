import type { SelectWorkspaceResponse } from "@/types/workspace";

type SetActiveWorkspace = (
  id: string | null,
  name: string | null,
  slug: string | null,
  role: string | null,
  membershipType: string | null,
  defaultLanguage: string | null,
  canCreateMeetings?: boolean | null,
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
    // `?? true`, not `|| true` — an explicit `false` from the server is the whole point of the
    // field and must survive. Only a missing value falls back to allowed.
    selection.canCreateMeetings ?? true,
  );
}
