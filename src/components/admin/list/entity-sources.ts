import { adminWorkspaceService } from "@/services/admin-workspace.service";

import type { AdminFilterOption } from "./types";

/**
 * The workspace picker behind every "Workspace is …" filter (subscriptions, ledger, invoices,
 * feedback). Searches the admin directory by name or slug — including suspended workspaces, since
 * a suspension is exactly when someone goes looking at a workspace's money.
 */
export async function searchAdminWorkspaces(query: string): Promise<AdminFilterOption[]> {
  const page = await adminWorkspaceService.getDirectory({ search: query, page: 1, pageSize: 8, sort: "name_asc" });
  return page.items.map((workspace) => ({ value: workspace.id, label: workspace.name, hint: workspace.slug }));
}

/** Names for workspace ids that arrived in a shared link. A lookup that fails keeps the short id. */
export async function resolveAdminWorkspaces(ids: readonly string[]): Promise<AdminFilterOption[]> {
  const settled = await Promise.allSettled(ids.slice(0, 10).map((id) => adminWorkspaceService.getDetail(id)));
  return settled.flatMap((result) =>
    result.status === "fulfilled"
      ? [{ value: result.value.id, label: result.value.name, hint: result.value.slug }]
      : [],
  );
}
