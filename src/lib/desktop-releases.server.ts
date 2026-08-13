import { normalizeRelease, type DesktopRelease, type RawRelease } from "./desktop-releases";

/**
 * Where the published desktop builds are read from — server-side only, hence the `.server`
 * suffix: it reads release-source configuration that must never reach the client bundle.
 *
 * Two sources, both normalised by `normalizeRelease` into the same shape:
 *
 *   1. GitHub Releases (default) — electron-builder already publishes there, see
 *      warptalk-desktop/electron-builder.yml. The repo must be public, otherwise the asset
 *      URLs 404 for logged-out visitors even though the API call succeeds with a token.
 *   2. A self-hosted manifest (DESKTOP_RELEASE_MANIFEST_URL) — for when the desktop repo has
 *      to stay private and the builds are mirrored to R2/S3 behind downloads.warptalk.vn.
 */

const GITHUB_OWNER =
  process.env.DESKTOP_RELEASE_GITHUB_OWNER?.trim() || "WarpTalk-CapstoneProject";
const GITHUB_REPO =
  process.env.DESKTOP_RELEASE_GITHUB_REPO?.trim() || "warptalk-desktop";

/** Releases are cut by hand at tag time; ten minutes of staleness costs nothing. */
const RELEASE_REVALIDATE_SECONDS = 600;

export function getReleasesPageUrl() {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
}

interface GitHubReleaseResponse {
  tag_name?: string;
  name?: string;
  published_at?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
    size?: number;
  }>;
}

async function fetchFromGitHub(): Promise<RawRelease | null> {
  const token =
    process.env.DESKTOP_RELEASE_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();

  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: RELEASE_REVALIDATE_SECONDS },
    },
  );

  if (!response.ok) return null;

  const data = (await response.json()) as GitHubReleaseResponse;
  const version = data.tag_name || data.name;
  if (!version || data.draft) return null;

  return {
    version,
    publishedAt: data.published_at ?? null,
    notesUrl: data.html_url ?? null,
    files: (data.assets ?? [])
      .filter((asset) => asset.name && asset.browser_download_url)
      .map((asset) => ({
        name: asset.name as string,
        url: asset.browser_download_url as string,
        size: asset.size ?? null,
      })),
  };
}

async function fetchFromManifest(manifestUrl: string): Promise<RawRelease | null> {
  const response = await fetch(manifestUrl, {
    next: { revalidate: RELEASE_REVALIDATE_SECONDS },
  });
  if (!response.ok) return null;

  const data = (await response.json()) as Partial<RawRelease>;
  if (!data?.version || !Array.isArray(data.files)) return null;

  return {
    version: data.version,
    publishedAt: data.publishedAt ?? null,
    notesUrl: data.notesUrl ?? null,
    files: data.files,
  };
}

/**
 * The latest published desktop build, or null when there is nothing to offer yet.
 *
 * Never throws: /download is a public marketing page, and a GitHub outage — or a repo with no
 * release cut yet — must degrade to "coming soon" rather than a 500.
 */
export async function fetchLatestDesktopRelease(): Promise<DesktopRelease | null> {
  const manifestUrl = process.env.DESKTOP_RELEASE_MANIFEST_URL?.trim();
  try {
    const raw = manifestUrl ? await fetchFromManifest(manifestUrl) : await fetchFromGitHub();
    return normalizeRelease(raw);
  } catch {
    return null;
  }
}
