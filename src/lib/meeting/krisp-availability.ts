/**
 * Krisp is a LiveKit Cloud capability, not a browser-only capability. A local self-hosted
 * LiveKit server answers the package's entitlement request with 404, which must be treated as a
 * supported fallback rather than an unhandled console error.
 */
export function shouldAttemptKrispNoiseFilter(livekitUrl?: string): boolean {
  const configuredUrl = livekitUrl ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!configuredUrl) return true;

  try {
    const parsed = new URL(configuredUrl.replace(/^ws/i, "http"));
    return !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  } catch {
    // An unusual but valid deployment URL should keep the production path enabled. The Krisp
    // package remains responsible for reporting a genuine remote entitlement failure.
    return true;
  }
}
