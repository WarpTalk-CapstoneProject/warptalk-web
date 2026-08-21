import {
  AppleLogo,
  ArrowSquareOut,
  CaretRight,
  LinuxLogo,
  WindowsLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { DownloadNavbar } from "@/components/download/download-navbar";
import { DownloadPrimaryCta } from "@/components/download/download-primary-cta";
import {
  formatFileSize,
  groupAssetsByPlatform,
  type DesktopAsset,
} from "@/lib/desktop-releases";
import { buildInstallNotes, type InstallNote } from "@/lib/desktop/install-notes";
import {
  fetchLatestDesktopRelease,
  getReleasesPageUrl,
} from "@/lib/desktop-releases.server";

export const metadata: Metadata = {
  title: "Download WarpTalk",
  description:
    "Download the WarpTalk desktop app for macOS, Windows, and Linux.",
};

export const revalidate = 600;

type DownloadRow =
  | {
      kind: "asset";
      icon: React.ElementType;
      label: string;
      asset: DesktopAsset;
    }
  | {
      kind: "link";
      icon: React.ElementType;
      label: string;
      href: string;
      action: string;
      external?: boolean;
    };

function DesktopAssetRows({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: DownloadRow[];
}) {
  return (
    <section className="grid gap-8 border-t border-white/10 py-9 md:grid-cols-[280px_1fr]">
      <div>
        <h2 className="text-[13px] font-semibold leading-5 text-white">{title}</h2>
        <p className="mt-1 max-w-[260px] text-[12px] leading-5 text-white/48">
          {description}
        </p>
      </div>

      <div className="divide-y divide-white/10">
        {rows.map((row) => {
          const Icon = row.icon;

          if (row.kind === "asset") {
            const size = formatFileSize(row.asset.sizeBytes);

            return (
              <a
                key={`${row.label}-${row.asset.url}`}
                href={row.asset.url}
                download
                className="group flex min-h-12 items-center gap-3 py-2.5"
              >
                <Icon
                  size={16}
                  weight="fill"
                  className="shrink-0 text-white/42 transition group-hover:text-white"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-white">
                    {row.label}
                  </span>
                  {size ? (
                    <span className="mt-0.5 block text-[11px] text-white/38">
                      {row.asset.label} · {size}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-[11px] text-white/38">
                      {row.asset.label}
                    </span>
                  )}
                </span>
                <span className="inline-flex h-6 items-center rounded-full bg-white/[0.08] px-2.5 text-[11px] font-semibold text-white transition group-hover:bg-white/[0.14]">
                  Download
                </span>
              </a>
            );
          }

          const content = (
            <>
              <Icon
                size={16}
                weight="duotone"
                className="shrink-0 text-white/42 transition group-hover:text-white"
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white">
                {row.label}
              </span>
              <span className="inline-flex h-6 items-center rounded-full bg-white/[0.08] px-2.5 text-[11px] font-semibold text-white transition group-hover:bg-white/[0.14]">
                {row.action}
              </span>
            </>
          );

          if (row.external) {
            return (
              <a
                key={row.label}
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-h-12 items-center gap-3 py-2.5"
              >
                {content}
              </a>
            );
          }

          return (
            <Link
              key={row.label}
              href={row.href}
              className="group flex min-h-12 items-center gap-3 py-2.5"
            >
              {content}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/**
 * One "the OS will stop you, here is the way through" block, beside the downloads it applies to.
 *
 * The content — which platforms get a note, what it says, and when the macOS one disappears —
 * lives in `@/lib/desktop/install-notes` rather than here, so the rules that matter (Open Anyway
 * rather than a quarantine-stripping shell command; the note deleting itself once builds are
 * notarized) can be asserted by a contract test instead of trusted to review.
 */
function InstallNoteSection({ note }: { note: InstallNote }) {
  return (
    <section className="grid gap-8 border-t border-white/10 py-9 md:grid-cols-[280px_1fr]">
      <div>
        <h2 className="text-[13px] font-semibold leading-5 text-white">{note.title}</h2>
        <p className="mt-1 max-w-[260px] text-[12px] leading-5 text-white/48">
          {note.summary}
        </p>
      </div>

      <div>
        <ol className="divide-y divide-white/10">
          {note.steps.map((step, index) => (
            <li key={step} className="flex min-h-12 items-start gap-3 py-2.5">
              <span className="mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-semibold text-white/70">
                {index + 1}
              </span>
              <span className="text-[13px] leading-[18px] text-white/72">{step}</span>
            </li>
          ))}
        </ol>

        <p className="mt-3 text-[11px] leading-5 text-white/38">
          {note.footnote}
          {note.link ? (
            <>
              {" "}
              <Link
                href={note.link.href}
                className="text-white/52 underline decoration-white/20 underline-offset-4 transition hover:text-white"
              >
                {note.link.label}
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}

function firstAsset(assets: DesktopAsset[]) {
  return assets[0] ?? null;
}

export default async function DownloadPage() {
  const release = await fetchLatestDesktopRelease();
  const releasesPageUrl = getReleasesPageUrl();
  const grouped = groupAssetsByPlatform(release?.assets ?? []);
  const installNotes = buildInstallNotes({
    version: release?.version ?? null,
    hasMacAsset: grouped.mac.length > 0,
    hasWindowsAsset: grouped.windows.length > 0,
  });

  const desktopRows: DownloadRow[] = [
    firstAsset(grouped.mac)
      ? {
          kind: "asset",
          icon: AppleLogo,
          label: "macOS",
          asset: firstAsset(grouped.mac) as DesktopAsset,
        }
      : {
          kind: "link",
          icon: AppleLogo,
          label: "macOS",
          href: releasesPageUrl,
          action: "Coming soon",
          external: true,
        },
    firstAsset(grouped.windows)
      ? {
          kind: "asset",
          icon: WindowsLogo,
          label: "Windows",
          asset: firstAsset(grouped.windows) as DesktopAsset,
        }
      : {
          kind: "link",
          icon: WindowsLogo,
          label: "Windows",
          href: releasesPageUrl,
          action: "Coming soon",
          external: true,
        },
    firstAsset(grouped.linux)
      ? {
          kind: "asset",
          icon: LinuxLogo,
          label: "Linux",
          asset: firstAsset(grouped.linux) as DesktopAsset,
        }
      : {
          kind: "link",
          icon: LinuxLogo,
          label: "Linux",
          href: releasesPageUrl,
          action: "Coming soon",
          external: true,
        },
  ];

  const publishedLabel = release?.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-dvh bg-[#050505] font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-white antialiased">
      <DownloadNavbar />

      <main>
        <section className="mx-auto max-w-[720px] px-6 pb-11 pt-[116px] text-center">
          <Image
            src="/assets/logos/warptalk-sidebar-icon.png"
            alt="WarpTalk desktop app icon"
            width={92}
            height={92}
            className="mx-auto h-[92px] w-[92px] rounded-[22px] bg-white object-contain p-5 shadow-[0_18px_70px_-40px_rgba(255,255,255,0.5)]"
            priority
          />

          <h1 className="mt-8 text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-white">
            Download WarpTalk
          </h1>
          <p className="mx-auto mt-3 max-w-[460px] text-[14px] leading-6 text-white/50">
            Available for macOS, Windows, and Linux.
          </p>

          <div className="mt-6 flex flex-col items-center gap-2.5">
            {release ? (
              <>
                <DownloadPrimaryCta assets={release.assets} />
                <p className="text-[11px] text-white/34">
                  Version {release.version}
                  {publishedLabel ? ` · Released ${publishedLabel}` : ""}
                  {release.notesUrl ? (
                    <>
                      {" · "}
                      <a
                        href={release.notesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/50 underline decoration-white/20 underline-offset-4 transition hover:text-white"
                      >
                        Release notes
                      </a>
                    </>
                  ) : null}
                </p>
              </>
            ) : (
              <>
                <a
                  href={releasesPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-black transition hover:bg-white/85"
                >
                  View releases
                  <ArrowSquareOut size={13} weight="bold" />
                </a>
                <p className="text-[11px] text-white/34">
                  Desktop builds will appear here once a release is published.
                </p>
              </>
            )}
          </div>
        </section>

        <section id="all-downloads" className="mx-auto max-w-[760px] px-6 pb-20">
          <DesktopAssetRows
            title="WarpTalk Desktop"
            description="A focused desktop experience for live translation, system audio capture, and meeting workflows outside the browser."
            rows={desktopRows}
          />
          {installNotes.map((note) => (
            <InstallNoteSection key={note.platform} note={note} />
          ))}
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6 text-[11px] text-white/34 md:px-12">
          <span>© {new Date().getFullYear()} WarpTalk</span>
          <a
            href={releasesPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition hover:text-white"
          >
            Releases
            <CaretRight size={12} weight="bold" />
          </a>
        </div>
      </footer>
    </div>
  );
}
