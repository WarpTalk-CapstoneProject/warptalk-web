/**
 * Open a provider's OAuth consent page, and report whether the browser actually allowed it.
 *
 * Every caller reaches this after an `await` on the connect-url mutation, and that is the whole
 * problem: Safari and Firefox drop the user-gesture grant across an async boundary and block the
 * popup. `window.open` signals that only by returning null, so a caller that ignores the return
 * value ends up telling the user to "finish connecting in your browser" when no browser window
 * ever opened - a dead end on the primary connect flow, with no second attempt offered.
 *
 * It is also the one place the URL is checked. It comes from our own API, but it is handed
 * straight to the browser to follow, and nothing but https should be.
 */
export function openProviderConsent(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  return window.open(url, "_blank", "noopener,noreferrer") !== null;
}
