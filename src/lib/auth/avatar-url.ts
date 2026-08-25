/**
 * Where an avatar actually lives.
 *
 * `user.avatarUrl` holds one of two things, and has since Google sign-in was added:
 *
 *   - an absolute URL, for a picture Google hosts
 *   - a path like `/api/v1/auth/profile/avatar/{userId}.png`, for one uploaded here
 *
 * The second is stored relative on purpose — the API is reached on whatever origin the app is
 * served from, and an absolute URL baked at upload time would be wrong the moment that origin
 * differs between environments, which it does.
 *
 * WHO CALLS THIS
 *   `AvatarImage`, and effectively nothing else. This comment used to claim the resolving
 *   happened "once, here, rather than in each of the seven places that put a face on screen" —
 *   and that is precisely what was NOT happening: nine components rendered a face and exactly one
 *   of them called this. Anyone with a Google picture saw it (absolute, so it worked by accident);
 *   anyone who uploaded one saw initials everywhere but their own profile page.
 *
 *   It is called inside the primitive now, so a call site cannot forget. Calling it yourself is
 *   harmless — it is idempotent for absolute URLs — but there is no longer a reason to.
 */

/** The API origin, derived from the same variable the axios client is built with. */
function apiOrigin(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5200/api/v1";
  try {
    return new URL(base).origin;
  } catch {
    // A relative NEXT_PUBLIC_API_URL means same-origin, which is what an empty prefix produces.
    return "";
  }
}

export function resolveAvatarUrl(
  avatarUrl: string | null | undefined,
): string | undefined {
  const value = avatarUrl?.trim();
  if (!value) return undefined;
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("data:")) return value;
  return `${apiOrigin()}${value.startsWith("/") ? "" : "/"}${value}`;
}
