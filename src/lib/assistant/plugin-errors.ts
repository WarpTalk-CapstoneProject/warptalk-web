import { getErrorMessage } from "@/lib/api/errors";
import { plainTextErrorBody } from "@/lib/assistant/plugin-availability";

/**
 * What to show when a plugin request fails: the server's own words, whichever way it sent them.
 *
 * The plugin endpoints answer some refusals as text/plain (a duplicate request, a plugin retired
 * since the page loaded, the workspace's policy being unknown for a moment), which
 * `getErrorMessage` does not read — so a 409 read as the caller's generic fallback and a 503 as
 * "Too many requests". The plain-text body comes first; everything else is `getErrorMessage`.
 */
export function pluginErrorMessage(error: unknown, fallback: string): string {
  return plainTextErrorBody(error) ?? getErrorMessage(error, fallback);
}
