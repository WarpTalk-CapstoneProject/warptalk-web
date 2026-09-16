/**
 * Krisp is a LiveKit Cloud capability, not a browser-only capability. A local self-hosted
 * LiveKit server answers the package's entitlement request with 404, which must be treated as a
 * supported fallback rather than an unhandled console error.
 */
export function shouldAttemptKrispNoiseFilter(livekitUrl?: string): boolean {
  // The caller passes the URL; this does not read the environment itself. Reading it here made
  // the answer depend on where the function runs: CI sets NEXT_PUBLIC_LIVEKIT_URL to
  // ws://127.0.0.1:7880 (ci.yml), so "no endpoint configured" silently became "the ambient local
  // endpoint" and the case this function exists to allow could not be tested at all.
  if (!livekitUrl) return true;

  try {
    const parsed = new URL(livekitUrl.replace(/^ws/i, "http"));
    return !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  } catch {
    // An unusual but valid deployment URL should keep the production path enabled. The Krisp
    // package remains responsible for reporting a genuine remote entitlement failure.
    return true;
  }
}
