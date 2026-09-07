/**
 * How the admin portal addresses one workspace in its URL (WT-560).
 *
 * It used to be the workspace's primary key: `/admin/workspaces/5b6d35d3-c47c-…`. Every other
 * workspace URL in the product names the workspace — `/warptalk-demo-sep490/members` — so the
 * portal was the one place handing a database identifier to the address bar, from where it
 * travels into tickets, screenshots and browser history. (This very defect was reported with a
 * production UUID pasted into it.)
 *
 * The id has to keep working regardless: the admin dashboard, the meetings table and the
 * subscriptions table all link here holding a workspaceId and no slug. So a reference is either
 * kind, and a page given the id kind swaps the URL for the slug once it knows it.
 */

/** 8-4-4-4-12 hex. Deliberately not version-specific — any UUID shape is the id kind. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WorkspaceRefKind = "id" | "slug";

/**
 * A slug can never take this shape: slugs are generated from a workspace's name, and a name
 * that folded to 32 hex characters in five dash-separated runs would be an extraordinary
 * coincidence rather than a collision worth designing around.
 */
export function workspaceRefKind(ref: string | undefined): WorkspaceRefKind {
  return ref && UUID.test(ref.trim()) ? "id" : "slug";
}
