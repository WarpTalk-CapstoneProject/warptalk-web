export const WORKSPACE_GATEWAY_PATH = "/workspace";

const RESERVED_WORKSPACE_SLUGS = new Set([
  "api",
  "about",
  "admin",
  "billing",
  "dashboard",
  "dev",
  "forgot-password",
  "invitations",
  "join",
  "localhost",
  "login",
  "payment-cancelled",
  "pricing",
  "register",
  "room",
  "rooms",
  "settings",
  "test-meeting",
  "workspace",
]);

function isHostCandidate(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "localhost" || normalized.includes(".") || normalized.includes(":");
}

export function normalizeWorkspaceSlug(value: string | null | undefined) {
  const slug = value?.trim().toLowerCase();
  if (
    !slug ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) ||
    RESERVED_WORKSPACE_SLUGS.has(slug)
  ) {
    return null;
  }

  return slug;
}

export function isUsableWorkspaceSlug(value: string | null | undefined) {
  return normalizeWorkspaceSlug(value) !== null;
}

export function getWorkspaceEntryPath(activeWorkspaceSlug: string | null | undefined) {
  const slug = normalizeWorkspaceSlug(activeWorkspaceSlug);
  return slug ? `/${slug}/home` : WORKSPACE_GATEWAY_PATH;
}

export function parseWorkspaceSlugInput(input: string) {
  const raw = input.trim();
  if (!raw) return null;

  if (raw.includes("://")) {
    try {
      const parsed = new URL(raw);
      return parseWorkspacePathSegments(parsed.pathname.split("/").filter(Boolean));
    } catch {
      return null;
    }
  }

  const pathOnly = raw.split("?")[0].split("#")[0].trim();
  const segments = pathOnly.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  if (segments.length === 1) return normalizeWorkspaceSlug(segments[0]);

  const pathSegments = isHostCandidate(segments[0]) ? segments.slice(1) : segments;
  return parseWorkspacePathSegments(pathSegments);
}

function parseWorkspacePathSegments(segments: string[]) {
  if (segments.length === 0) return null;
  if (segments[0].toLowerCase() === "workspace") {
    return normalizeWorkspaceSlug(segments[1]);
  }

  return normalizeWorkspaceSlug(segments[0]);
}
