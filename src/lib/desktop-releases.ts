/**
 * Desktop release catalogue for the public /download page — pure half.
 *
 * The installers are far too large to live in this repo (a single Windows build is ~130 MB),
 * so the page never serves bytes itself: it reads whatever the desktop repo published and
 * links straight at it. Fetching lives in `desktop-releases.server.ts`; everything here is
 * filename-driven and side-effect free so the download CTA can share it with the server
 * without pulling release-source credentials into the client bundle.
 */

export type DesktopPlatform = "windows" | "mac" | "linux";

/** "universal" covers both a real universal binary and a build with no arch in its name. */
export type DesktopArch = "universal" | "x64" | "arm64";

export type DesktopAssetKind =
  | "windows-installer"
  | "windows-portable"
  | "mac-dmg"
  | "mac-zip"
  | "linux-appimage"
  | "linux-deb";

export interface DesktopAsset {
  kind: DesktopAssetKind;
  platform: DesktopPlatform;
  arch: DesktopArch;
  /** Human label for the button, e.g. "Apple Silicon (.dmg)". */
  label: string;
  fileName: string;
  url: string;
  sizeBytes: number;
}

export interface DesktopRelease {
  version: string;
  publishedAt: string | null;
  notesUrl: string | null;
  assets: DesktopAsset[];
}

/** The lowest common denominator between the GitHub API and a self-hosted manifest. */
export interface RawReleaseFile {
  name: string;
  url: string;
  size?: number | null;
}

export interface RawRelease {
  version: string;
  publishedAt?: string | null;
  notesUrl?: string | null;
  files: RawReleaseFile[];
}

function archFromFileName(lower: string): DesktopArch {
  if (lower.includes("arm64") || lower.includes("aarch64")) return "arm64";
  if (lower.includes("x64") || lower.includes("x86_64") || lower.includes("intel")) {
    return "x64";
  }
  return "universal";
}

function macArchLabel(arch: DesktopArch) {
  if (arch === "arm64") return "Apple Silicon";
  if (arch === "x64") return "Intel";
  return "Universal";
}

/**
 * Turn one published file into a download entry, or null if it is build metadata.
 *
 * electron-builder ships `latest*.yml` and `.blockmap` alongside every installer — those are
 * for electron-updater, not for humans, and must never surface as a download button.
 */
export function classifyDesktopAsset(file: RawReleaseFile): DesktopAsset | null {
  const fileName = file.name?.trim();
  const url = file.url?.trim();
  if (!fileName || !url) return null;

  const lower = fileName.toLowerCase();
  if (lower.endsWith(".blockmap") || lower.endsWith(".yml") || lower.endsWith(".yaml")) {
    return null;
  }

  const sizeBytes = typeof file.size === "number" && file.size > 0 ? file.size : 0;
  const arch = archFromFileName(lower);
  const base = { fileName, url, sizeBytes, arch };

  if (lower.endsWith(".exe")) {
    /**
     * Windows ships TWO .exe files and only their names tell them apart.
     *
     * The desktop repo builds both the `nsis` and `portable` targets. electron-builder names the
     * NSIS installer `WarpTalk-Setup-0.3.2.exe` and the portable build `WarpTalk-0.3.2.exe` —
     * the portable one carries NO marker at all. Keying off the word "portable", as this did at
     * first, therefore matched neither file, labelled both "Installer", and handed every Windows
     * visitor the PORTABLE build as the recommended download: an app that runs once from the
     * Downloads folder, never appears in the Start menu, and never auto-updates.
     *
     * So "Setup" is what identifies an installer, and a bare .exe is assumed portable. That is
     * the safer way round to be wrong. Offering an installer that is really portable strands
     * someone on a build that cannot update itself; offering a portable build labelled portable
     * costs at most a second download.
     */
    const installer = lower.includes("setup") || lower.includes("install");
    return {
      ...base,
      platform: "windows",
      kind: installer ? "windows-installer" : "windows-portable",
      label: installer ? "Installer (.exe)" : "Portable (.exe)",
    };
  }

  if (lower.endsWith(".msi")) {
    return {
      ...base,
      platform: "windows",
      kind: "windows-installer",
      label: "Installer (.msi)",
    };
  }

  if (lower.endsWith(".dmg")) {
    return {
      ...base,
      platform: "mac",
      kind: "mac-dmg",
      label: `${macArchLabel(arch)} (.dmg)`,
    };
  }

  // Only macOS ships a .zip from electron-builder; a stray archive is not a download.
  if (lower.endsWith(".zip") && (lower.includes("mac") || lower.includes("darwin"))) {
    return {
      ...base,
      platform: "mac",
      kind: "mac-zip",
      label: `${macArchLabel(arch)} (.zip)`,
    };
  }

  if (lower.endsWith(".appimage")) {
    return { ...base, platform: "linux", kind: "linux-appimage", label: "AppImage" };
  }

  if (lower.endsWith(".deb")) {
    return { ...base, platform: "linux", kind: "linux-deb", label: "Debian (.deb)" };
  }

  return null;
}

/** Installers before portable/archive builds, so the first entry is the one to recommend. */
const KIND_PRIORITY: Record<DesktopAssetKind, number> = {
  "mac-dmg": 0,
  "windows-installer": 0,
  "linux-appimage": 0,
  "linux-deb": 1,
  "windows-portable": 2,
  "mac-zip": 2,
};

export function normalizeRelease(raw: RawRelease | null): DesktopRelease | null {
  if (!raw?.version) return null;

  const assets = (raw.files ?? [])
    .map(classifyDesktopAsset)
    .filter((asset): asset is DesktopAsset => asset !== null)
    .sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);

  if (assets.length === 0) return null;

  return {
    version: raw.version.replace(/^v/i, ""),
    publishedAt: raw.publishedAt ?? null,
    notesUrl: raw.notesUrl ?? null,
    assets,
  };
}

/**
 * The single asset to put behind the hero button for a visitor on `platform`.
 *
 * An Apple Silicon visitor offered the Intel build would get a Rosetta-emulated app with no
 * warning, so arch is matched before falling back to whatever else that platform published.
 */
export function pickPrimaryAsset(
  assets: DesktopAsset[],
  platform: DesktopPlatform | null,
  arch: DesktopArch = "universal",
): DesktopAsset | null {
  if (!platform) return null;
  const forPlatform = assets.filter((asset) => asset.platform === platform);
  if (forPlatform.length === 0) return null;

  return (
    forPlatform.find((asset) => asset.arch === arch) ??
    forPlatform.find((asset) => asset.arch === "universal") ??
    forPlatform[0]
  );
}

export function groupAssetsByPlatform(assets: DesktopAsset[]) {
  return {
    windows: assets.filter((asset) => asset.platform === "windows"),
    mac: assets.filter((asset) => asset.platform === "mac"),
    linux: assets.filter((asset) => asset.platform === "linux"),
  };
}

export function formatFileSize(sizeBytes: number) {
  if (!sizeBytes) return "";
  const mb = sizeBytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}
