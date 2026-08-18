"use client";

import {
  AppleLogo,
  DownloadSimple,
  LinuxLogo,
  WindowsLogo,
} from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";

import {
  formatFileSize,
  pickPrimaryAsset,
  type DesktopArch,
  type DesktopAsset,
  type DesktopPlatform,
} from "@/lib/desktop-releases";
import { cn } from "@/lib/utils";

const PLATFORM_LABEL: Record<DesktopPlatform, string> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
};

const PLATFORM_ICON: Record<DesktopPlatform, React.ElementType> = {
  mac: AppleLogo,
  windows: WindowsLogo,
  linux: LinuxLogo,
};

interface UserAgentData {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{
    platform?: string;
    architecture?: string;
    bitness?: string;
  }>;
}

function platformFromString(value: string): DesktopPlatform | null {
  const lower = value.toLowerCase();
  if (lower.includes("mac") || lower.includes("darwin")) return "mac";
  if (lower.includes("win")) return "windows";
  if (lower.includes("linux") || lower.includes("x11")) return "linux";
  return null;
}

/**
 * Whether this Mac is Apple Silicon, from the GPU string.
 *
 * Safari and Firefox both report "Intel Mac OS X" in the user agent on an M-series Mac, so the
 * UA alone would hand every Safari user the Intel build. The renderer string does not lie:
 * Apple Silicon reports an Apple GPU, Intel Macs report Intel/AMD/NVIDIA.
 */
function macLooksAppleSilicon(): boolean | null {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    if (!info) return null;
    const renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? "");
    if (!renderer) return null;
    return /apple\s*(m\d|gpu|silicon)/i.test(renderer);
  } catch {
    return null;
  }
}

async function detectClient(): Promise<{
  platform: DesktopPlatform | null;
  arch: DesktopArch;
}> {
  const uaData = (navigator as Navigator & { userAgentData?: UserAgentData })
    .userAgentData;

  // Chromium exposes the real architecture, including under Rosetta. Prefer it.
  if (uaData?.getHighEntropyValues) {
    try {
      const hints = await uaData.getHighEntropyValues(["architecture", "platform"]);
      const platform = platformFromString(hints.platform ?? uaData.platform ?? "");
      const architecture = (hints.architecture ?? "").toLowerCase();
      if (platform) {
        if (architecture.includes("arm")) return { platform, arch: "arm64" };
        if (architecture.includes("x86")) return { platform, arch: "x64" };
        return { platform, arch: "universal" };
      }
    } catch {
      // Fall through to the user-agent string.
    }
  }

  const platform = platformFromString(navigator.userAgent);
  if (platform === "mac") {
    const appleSilicon = macLooksAppleSilicon();
    if (appleSilicon === true) return { platform, arch: "arm64" };
    if (appleSilicon === false) return { platform, arch: "x64" };
    return { platform, arch: "universal" };
  }
  if (platform === "windows") {
    return {
      platform,
      arch: /arm64|aarch64/i.test(navigator.userAgent) ? "arm64" : "x64",
    };
  }
  return { platform, arch: "universal" };
}

/**
 * The hero download button, resolved to this visitor's OS.
 *
 * Renders a neutral "See all downloads" state on the server and during the first paint: the
 * detected platform is client-only, and guessing it during SSR would flash the wrong OS name.
 * Every platform is listed further down the page regardless, so a bad guess costs one scroll.
 */
export function DownloadPrimaryCta({
  assets,
  allDownloadsHref = "#all-downloads",
}: {
  assets: DesktopAsset[];
  allDownloadsHref?: string;
}) {
  const [detected, setDetected] = useState<{
    platform: DesktopPlatform | null;
    arch: DesktopArch;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void detectClient().then((result) => {
      if (!cancelled) setDetected(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const primary = pickPrimaryAsset(assets, detected?.platform ?? null, detected?.arch);
  const otherPlatforms = (["mac", "windows", "linux"] as DesktopPlatform[]).filter(
    (platform) =>
      platform !== detected?.platform && assets.some((a) => a.platform === platform),
  );

  if (!primary) {
    return (
      <a
        href={allDownloadsHref}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-black shadow-[0_14px_40px_-22px_rgba(255,255,255,0.6)] transition hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <DownloadSimple size={16} weight="bold" />
        See all downloads
      </a>
    );
  }

  const PlatformIcon = PLATFORM_ICON[primary.platform];
  const size = formatFileSize(primary.sizeBytes);

  return (
    <div className="flex flex-col items-center gap-2.5">
      <a
        href={primary.url}
        download
        className={cn(
          "group inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-black",
          "shadow-[0_14px_40px_-22px_rgba(255,255,255,0.6)] transition hover:bg-white/85",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
        )}
      >
        <PlatformIcon size={16} weight="fill" />
        Download for {PLATFORM_LABEL[primary.platform]}
        <span className="text-black/38">·</span>
        <span className="font-medium text-black/60">{primary.label}</span>
      </a>

      <p className="text-[11px] text-white/38">
        {size ? `${size} · ` : ""}
        {otherPlatforms.length > 0 ? (
          <>
            Also on{" "}
            <a
              href={allDownloadsHref}
              className="text-white/52 underline decoration-white/20 underline-offset-4 transition hover:text-white"
            >
              {otherPlatforms.map((platform) => PLATFORM_LABEL[platform]).join(" and ")}
            </a>
          </>
        ) : (
          <a
            href={allDownloadsHref}
            className="text-white/52 underline decoration-white/20 underline-offset-4 transition hover:text-white"
          >
            All downloads
          </a>
        )}
      </p>
    </div>
  );
}
