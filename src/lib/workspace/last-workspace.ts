/**
 * Which workspace this ACCOUNT was in last time — remembered across sign-outs. WT-347.
 *
 * WHY THE ACTIVE-WORKSPACE STORE CANNOT ANSWER THIS
 *   `useWorkspaceStore` is one of the session-scoped stores, and `login()` empties every one of
 *   them before it installs the arriving identity (session-scoped-state.ts: a change of account
 *   must not leave the previous one's data on screen). That is correct, and it has a cost: at the
 *   exact moment the login page decides where to send somebody, the browser has just forgotten
 *   which workspace they were using. The only thing left to do was land on the hub and open
 *   `items[0]`, which for anyone in more than one workspace is a guess — and the hub itself, when
 *   it happened to still hold a workspace, read that as "came here to choose" and showed the
 *   chooser instead.
 *
 * WHY THIS IS NOT A LEAK
 *   The record is keyed by user id and only ever read back for that same id, so account B signing
 *   in on account A's browser learns nothing from it: `recallLastWorkspaceSlug(B)` is null until B
 *   has opened a workspace. It holds a slug and nothing else — no name, no role, no membership —
 *   and a slug is a public URL segment, not account data. It is deliberately NOT cleared on
 *   sign-out, because surviving the sign-out is the entire point: the flow this fixes is
 *   sign-out (or session expiry) followed by signing back in as the same person.
 *
 * WHY NOT THE SERVER
 *   `POST /workspaces/{id}/select` does cache the selection per user, but no endpoint reads it
 *   back, so the client cannot ask. If one appears, this file is the single thing to replace.
 *
 * Only ever a HINT. The destination it produces is `/{slug}/home`, and `[workspaceSlug]/layout`
 * re-selects that workspace through the server on arrival — a membership that has since been
 * revoked fails there and falls back to the hub exactly as any stale link does.
 */

import { normalizeWorkspaceSlug } from "./workspace-slug.ts";

export const LAST_WORKSPACE_STORAGE_KEY = "warptalk-last-workspace";

/** The subset of `Storage` this needs — the real localStorage, or a test's plain map. */
export type LastWorkspaceStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): LastWorkspaceStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    // Storage can throw outright (blocked third-party context, some private modes). A missing
    // memory must never be what stops a sign-in.
    return null;
  }
}

function readMemory(storage: LastWorkspaceStorage): Record<string, string> {
  try {
    const raw = storage.getItem(LAST_WORKSPACE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const memory: Record<string, string> = {};
    for (const [userId, slug] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof slug === "string") memory[userId] = slug;
    }
    return memory;
  } catch {
    return {};
  }
}

/**
 * The workspace this user opened most recently, as a canonical slug, or null when nothing is
 * known — a first sign-in on this browser, a different account, or a value that no longer parses
 * as a slug.
 */
export function recallLastWorkspaceSlug(
  userId: string | null | undefined,
  storage: LastWorkspaceStorage | null = browserStorage(),
): string | null {
  if (!userId || !storage) return null;
  return normalizeWorkspaceSlug(readMemory(storage)[userId]);
}

/** Record that this user is in this workspace. A slug that does not normalise is not recorded. */
export function rememberLastWorkspaceSlug(
  userId: string | null | undefined,
  slug: string | null | undefined,
  storage: LastWorkspaceStorage | null = browserStorage(),
): void {
  const safeSlug = normalizeWorkspaceSlug(slug);
  if (!userId || !safeSlug || !storage) return;
  try {
    const memory = readMemory(storage);
    if (memory[userId] === safeSlug) return;
    storage.setItem(LAST_WORKSPACE_STORAGE_KEY, JSON.stringify({ ...memory, [userId]: safeSlug }));
  } catch {
    // Quota or a read-only storage. Not remembering is the pre-WT-347 behaviour, not an error.
  }
}

/**
 * Which of a user's workspaces to open when nothing has been chosen yet.
 *
 * Both auto-open paths — the hub and the app shell — used to take `items[0]`, which for anyone
 * in more than one workspace is whichever the server happened to list first. The remembered one
 * wins when it is still in the list; a memory of a workspace this account has since left is
 * simply ignored, and the first workspace is what it always was: the fallback.
 */
export function preferRememberedWorkspace<T extends { slug?: string | null }>(
  items: readonly T[],
  rememberedSlug: string | null | undefined,
): T | undefined {
  if (items.length === 0) return undefined;
  const wanted = normalizeWorkspaceSlug(rememberedSlug);
  if (!wanted) return items[0];
  return items.find((item) => normalizeWorkspaceSlug(item.slug) === wanted) ?? items[0];
}
