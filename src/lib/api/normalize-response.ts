/**
 * Role casing, normalised once on the way in — and nothing else touched.
 *
 * The backend spells roles inconsistently across services ("Owner", "OWNER", "owner"), so every
 * comparison in the app would otherwise have to lowercase defensively. This rewrites those few
 * fields on the response body and leaves the rest alone.
 *
 * IT LIVES IN ITS OWN FILE SO IT CAN BE TESTED
 *     It used to be a private function inside client.ts, which cannot be imported in a unit test
 *     without constructing the whole axios client and its interceptors. That is why the bug
 *     below shipped: the function is four lines of recursion and nothing could exercise it.
 */

/**
 * A `{...}` literal — as opposed to a Blob, File, FormData, ArrayBuffer, Date, Map or any other
 * object whose behaviour lives on its prototype.
 *
 * THIS DISTINCTION IS THE WHOLE BUG
 *     `normalizeResponseRoles` rebuilt every object it met, field by field, into a fresh `{}`.
 *     A Blob satisfies `typeof value === "object"` and is not an array, so a downloaded file went
 *     down that path — and `Object.keys(blob)` is `[]`, because everything a Blob can DO
 *     (.text(), .arrayBuffer(), .size, .type) lives on its prototype, not in own enumerable keys.
 *
 *     So every binary response in the application arrived at its caller as `{}`. The document
 *     preview called `.text()` on it and the page died with "x.text is not a function"; the same
 *     empty object was being handed to every artifact, transcript and file download in the app,
 *     where it failed at `URL.createObjectURL` instead.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const ROLE_KEYS = new Set(["role", "roleName", "currentRole", "workspaceRole"]);

export function normalizeResponseRoles(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(normalizeResponseRoles);
  // Anything that is not a plain object is returned AS IT IS. Rebuilding it would strip the
  // prototype and hand back something that looks similar and does nothing.
  if (!isPlainObject(data)) return data;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (ROLE_KEYS.has(key) && typeof value === "string") {
      result[key] = value.toLowerCase();
    } else if (typeof value === "object" && value !== null) {
      result[key] = normalizeResponseRoles(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
