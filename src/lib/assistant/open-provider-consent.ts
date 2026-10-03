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
/**
 * Where an `api_key` plugin is connected. Chat surfaces send the user here instead of opening a
 * consent page, and the plugins page opens that plugin's key field on arrival.
 */
export function pluginApiKeyPageHref(pluginKey: string): string {
  return `/settings/plugins?plugin=${encodeURIComponent(pluginKey)}&connect=api_key`;
}

export function openProviderConsent(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  // No "noopener" feature here: per the HTML spec it makes window.open return null even when the
  // window opened, which read as "blocked" on every connect. Sever the opener by hand instead.
  const opened = window.open(url, "_blank");
  if (!opened) return false;
  try {
    opened.opener = null;
  } catch {
    // Cross-origin hardening only; the window is open either way.
  }
  return true;
}
