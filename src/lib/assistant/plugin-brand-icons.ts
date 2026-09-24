/**
 * Where a plugin's brand mark comes from — the ONE source every surface draws from: the member's
 * connections page, the workspace Plugins page, WarpBot's menus and chips, and /admin/plugins.
 *
 * THE FILES live in `public/assets/plugins/`, served by this app. The marketplace rows point at them
 * too (`plugins.avatar_url`, assistant migrations 20260907100000 for Google and 20260924120000 for
 * the remote MCP apps), so a row normally arrives with its icon. The map below is the fallback for a
 * row that does not: one created before its migration ran, or an admin row whose avatar was cleared.
 * Before it existed, every seeded MCP app drew as a letter tile — L, N, AJ, A, M, C, Z.
 *
 * Keyed by marketplace plugin key. A workspace's private plugin is keyed `ws_<name>_<hex>`, so a
 * private "Linear" can never borrow Linear's mark and pass itself off as the marketplace app.
 *
 * Sources: gilbarbara/logos for Linear, Notion, Atlassian, Asana and monday.com (multi-colour marks
 * kept as they are); simple-icons (CC0) for Canva, painted with its brand gradient, and Zapier, in
 * its brand orange — gilbarbara has no Canva and only Zapier's wordmark.
 *
 * No imports: node-run tests load this file directly.
 */
export const PLUGIN_BRAND_ICONS: Readonly<Record<string, string>> = Object.freeze({
  google_drive: "/assets/plugins/google-drive.svg",
  google_calendar: "/assets/plugins/google-calendar.svg",
  google_meet: "/assets/plugins/google-meet.svg",
  linear: "/assets/plugins/linear.svg",
  notion: "/assets/plugins/notion.svg",
  atlassian: "/assets/plugins/atlassian.svg",
  asana: "/assets/plugins/asana.svg",
  monday: "/assets/plugins/monday.svg",
  canva: "/assets/plugins/canva.svg",
  zapier: "/assets/plugins/zapier.svg",
});

/** The fields a surface can offer; each DTO names the key differently. */
export interface PluginIconSubject {
  avatarUrl?: string | null;
  /** Member catalog and workspace rows. */
  key?: string | null;
  /** Admin rows and request rows. */
  pluginKey?: string | null;
}

/** The bundled brand mark for a marketplace plugin key, or null. */
export function pluginBrandIcon(pluginKey: string | null | undefined): string | null {
  const key = pluginKey?.trim().toLowerCase();
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(PLUGIN_BRAND_ICONS, key) ? PLUGIN_BRAND_ICONS[key] : null;
}

/**
 * The images to try, in order: the row's own avatar (an admin's choice wins), then the bundled
 * brand mark. Empty means initials. Deduplicated, so a row already pointing at its bundled mark is
 * not fetched twice after a failure.
 */
export function pluginIconSources(plugin: PluginIconSubject): string[] {
  const sources = [plugin.avatarUrl?.trim() || null, pluginBrandIcon(plugin.key ?? plugin.pluginKey)];
  return sources.filter((source, index): source is string => !!source && sources.indexOf(source) === index);
}

/** "Atlassian Jira & Confluence" → "AJ": the last resort, when no image loads. */
export function pluginInitials(label: string): string {
  return label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
