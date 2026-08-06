import {
  AppleLogo,
  ArrowsClockwise,
  ArrowSquareOut,
  BellRinging,
  Broadcast,
  CaretRight,
  CheckCircle,
  DownloadSimple,
  LinuxLogo,
  Microphone,
  ShieldCheck,
  WindowsLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { DownloadPrimaryCta } from "@/components/download/download-primary-cta";
import {
  formatFileSize,
  groupAssetsByPlatform,
  type DesktopAsset,
} from "@/lib/desktop-releases";
import {
  fetchLatestDesktopRelease,
  getReleasesPageUrl,
} from "@/lib/desktop-releases.server";

export const metadata: Metadata = {
  title: "Download for Desktop",
  description:
    "Get the WarpTalk desktop app for macOS, Windows and Linux — system-wide audio capture, a floating live transcript, and always-on translation outside the browser.",
};

/** Matches the release cache in desktop-releases.server.ts. */
export const revalidate = 600;

const DESKTOP_FEATURES = [
  {
    icon: Microphone,
    title: "System-wide audio capture",
    body: "Translate any call, not just the ones in your browser tab. The desktop client captures system output and your microphone together, so Zoom, Teams and Meet all run through WarpTalk.",
  },
  {
    icon: Broadcast,
    title: "Floating live transcript",
    body: "A frameless always-on-top window keeps the running transcript and translation in view while you work in another app. Move it, resize it, or park it on a second monitor.",
  },
  {
    icon: BellRinging,
    title: "Native notifications and tray",
    body: "Room invites, speaker changes and summary-ready alerts arrive as real OS notifications. Mute the mic or leave a room straight from the system tray.",
  },
  {
    icon: ArrowsClockwise,
    title: "Silent auto-update",
    body: "The app checks for new builds on launch and installs them in the background. You stay on the version the workspace expects without ever visiting this page again.",
  },
];

const REQUIREMENTS = [
  "macOS 11 Big Sur or later — Apple Silicon and Intel",
  "Windows 10 version 1809 or later (64-bit)",
  "Ubuntu 20.04 or later, Debian 11 or later, and equivalents",
  "A working microphone and an internet connection",
];

function AssetRow({ asset }: { asset: DesktopAsset }) {
  const size = formatFileSize(asset.sizeBytes);

  return (
    <a
      href={asset.url}
      download
      className="group flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-1 px-3.5 py-3 transition hover:border-hairline-strong hover:bg-surface-2"
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-ink">
          {asset.label}
        </span>
        {size ? (
          <span className="mt-0.5 block text-[12px] text-ink-subtle">{size}</span>
        ) : null}
      </span>
      <DownloadSimple
        size={16}
        weight="bold"
        className="shrink-0 text-ink-subtle transition group-hover:text-primary"
      />
    </a>
  );
}

function PlatformCard({
  icon: Icon,
  name,
  assets,
}: {
  icon: React.ElementType;
  name: string;
  assets: DesktopAsset[];
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1/60 p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-ink">
          <Icon size={18} weight="fill" />
        </span>
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">{name}</h3>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {assets.length > 0 ? (
          assets.map((asset) => <AssetRow key={asset.url} asset={asset} />)
        ) : (
          <p className="rounded-lg border border-dashed border-hairline px-3.5 py-3 text-[13px] text-ink-subtle">
            No build published for this platform yet.
          </p>
        )}
      </div>
    </div>
  );
}

export default async function DownloadPage() {
  const release = await fetchLatestDesktopRelease();
  const releasesPageUrl = getReleasesPageUrl();
  const grouped = groupAssetsByPlatform(release?.assets ?? []);

  const publishedLabel = release?.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/85 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="WarpTalk home">
            <Image
              src="/assets/logos/warptalk-sidebar-icon.png"
              alt=""
              width={26}
              height={26}
              className="rounded-md"
            />
            <span className="text-[15px] font-semibold tracking-tight">WarpTalk</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/#pricing"
              className="hidden rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink sm:inline-flex"
            >
              Pricing
            </Link>
            <Link
              href="/workspace"
              className="inline-flex h-8 items-center rounded-lg border border-hairline bg-surface-1 px-3 text-[13px] font-medium text-ink transition hover:bg-surface-2"
            >
              Open WarpTalk
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-hairline">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[-14rem] h-[32rem] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(94,106,210,0.22),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-20 text-center md:px-8 md:pb-20 md:pt-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-3 py-1 text-[12px] font-medium text-ink-muted">
            <span className="size-1.5 rounded-full bg-primary" />
            WarpTalk Desktop
          </span>

          <h1 className="mt-6 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink md:text-[56px]">
            Translation that
            <br className="hidden sm:block" /> lives outside the tab
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-ink-muted">
            The desktop app captures system audio, keeps a live transcript floating above your
            work, and stays connected in the tray — so every meeting is translated, whichever
            app it happens in.
          </p>

          <div className="mt-9 flex flex-col items-center gap-4">
            {release ? (
              <>
                <DownloadPrimaryCta assets={release.assets} />
                <p className="text-[12px] text-ink-tertiary">
                  Version {release.version}
                  {publishedLabel ? ` · Released ${publishedLabel}` : ""}
                  {release.notesUrl ? (
                    <>
                      {" · "}
                      <a
                        href={release.notesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink-subtle underline decoration-hairline-strong underline-offset-4 transition hover:text-ink"
                      >
                        Release notes
                      </a>
                    </>
                  ) : null}
                </p>
              </>
            ) : (
              <div className="rounded-2xl border border-hairline bg-surface-1 px-6 py-5">
                <p className="text-[14px] font-medium text-ink">
                  No desktop build has been published yet.
                </p>
                <p className="mt-1.5 text-[13px] text-ink-muted">
                  Builds appear here automatically once a release is cut.
                </p>
                <a
                  href={releasesPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary transition hover:underline"
                >
                  Check the releases page
                  <ArrowSquareOut size={14} weight="bold" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* App preview */}
        <div className="relative mx-auto max-w-5xl px-5 pb-16 md:px-8 md:pb-24">
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-1 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.55)]">
            <div className="flex h-9 items-center gap-1.5 border-b border-hairline bg-surface-2 px-4">
              <span className="size-2.5 rounded-full bg-hairline-tertiary" />
              <span className="size-2.5 rounded-full bg-hairline-tertiary" />
              <span className="size-2.5 rounded-full bg-hairline-tertiary" />
              <span className="ml-3 text-[11px] font-medium text-ink-subtle">
                WarpTalk — Live translation
              </span>
            </div>
            <Image
              src="/assets/backgrounds/dashboard-nebula.png"
              alt="The WarpTalk desktop app running a live translated meeting"
              width={1600}
              height={900}
              className="h-auto w-full"
              priority
            />
          </div>
        </div>
      </section>

      {/* Why desktop */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-ink md:text-[32px]">
            What the browser cannot do
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-muted">
            Everything in the web app is here too. These are the parts that need to run
            natively.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {DESKTOP_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-hairline bg-surface-1/60 p-6 transition hover:border-hairline-strong"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <feature.icon size={20} weight="duotone" />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-ink">
                  {feature.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* All downloads */}
      <section id="all-downloads" className="scroll-mt-16 border-b border-hairline">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-ink md:text-[32px]">
                All downloads
              </h2>
              <p className="mt-3 text-[15px] text-ink-muted">
                {release
                  ? `Every build in version ${release.version}.`
                  : "Builds will be listed here once the first release is published."}
              </p>
            </div>
            <a
              href={releasesPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted transition hover:text-ink"
            >
              Older versions
              <CaretRight size={13} weight="bold" />
            </a>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <PlatformCard icon={AppleLogo} name="macOS" assets={grouped.mac} />
            <PlatformCard icon={WindowsLogo} name="Windows" assets={grouped.windows} />
            <PlatformCard icon={LinuxLogo} name="Linux" assets={grouped.linux} />
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">
                System requirements
              </h2>
              <ul className="mt-5 flex flex-col gap-3">
                {REQUIREMENTS.map((requirement) => (
                  <li key={requirement} className="flex items-start gap-2.5">
                    <CheckCircle
                      size={17}
                      weight="duotone"
                      className="mt-0.5 shrink-0 text-primary"
                    />
                    <span className="text-[14px] leading-relaxed text-ink-muted">
                      {requirement}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-hairline bg-surface-1/60 p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-muted">
                <ShieldCheck size={20} weight="duotone" />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-ink">
                Signing in
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                The desktop app opens your browser to sign in, then hands the session back — so
                your password and Google account never pass through the app itself. You land in
                the same workspaces you already use on the web.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary transition hover:underline"
              >
                Sign in on the web
                <CaretRight size={13} weight="bold" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 md:px-8">
          <p className="text-[12px] text-ink-tertiary">
            © {new Date().getFullYear()} WarpTalk. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-[12px] text-ink-subtle">
            <Link href="/" className="transition hover:text-ink">
              Home
            </Link>
            <Link href="/workspace" className="transition hover:text-ink">
              Open app
            </Link>
            <a
              href={releasesPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-ink"
            >
              Changelog
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
