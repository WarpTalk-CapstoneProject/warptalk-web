import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDesktopAsset,
  groupAssetsByPlatform,
  normalizeRelease,
  pickPrimaryAsset,
  formatFileSize,
} from "../desktop-releases.ts";

const file = (name: string, size = 1024 * 1024) => ({
  name,
  url: `https://example.test/${name}`,
  size,
});

test("electron-updater metadata never becomes a download button", () => {
  // latest.yml and the .blockmap sit next to every installer in the release; they are for the
  // auto-updater, and shipping them as buttons would hand users a file they cannot run.
  assert.equal(classifyDesktopAsset(file("latest.yml")), null);
  assert.equal(classifyDesktopAsset(file("latest-mac.yml")), null);
  assert.equal(classifyDesktopAsset(file("WarpTalk-Setup-0.2.0.exe.blockmap")), null);
});

test("the real v0.3.2 filenames resolve to the right recommended download", () => {
  // Taken verbatim from the first published release. The desktop repo builds both the `nsis` and
  // `portable` Windows targets, and electron-builder gives the PORTABLE one the bare name — so a
  // classifier keyed off the word "portable" matched neither, called both "Installer", and made
  // the portable build the hero download for every Windows visitor. Caught only against real data.
  const release = normalizeRelease({
    version: "v0.3.2",
    files: [
      file("WarpTalk-Setup-0.3.2.exe"), // nsis target — the installer
      file("WarpTalk-0.3.2.exe"), // portable target — no marker in the name
      file("WarpTalk-0.3.2-arm64.dmg"),
      file("WarpTalk-0.3.2.dmg"),
      file("WarpTalk-0.3.2-arm64-mac.zip"),
      file("WarpTalk-0.3.2-mac.zip"),
      file("WarpTalk-0.3.2.AppImage"),
      file("warptalk-desktop_0.3.2_amd64.deb"),
      file("latest.yml"),
      file("latest-mac.yml"),
      file("latest-linux.yml"),
      file("WarpTalk-Setup-0.3.2.exe.blockmap"),
    ],
  })!;

  assert.equal(release.assets.length, 8, "the three .yml files and the .blockmap are not downloads");

  const windows = classifyDesktopAsset(file("WarpTalk-Setup-0.3.2.exe"));
  const portableExe = classifyDesktopAsset(file("WarpTalk-0.3.2.exe"));
  assert.equal(windows?.kind, "windows-installer");
  assert.equal(portableExe?.kind, "windows-portable", "a bare .exe is the portable target");

  // The recommendation each visitor actually gets.
  assert.equal(
    pickPrimaryAsset(release.assets, "windows", "x64")?.fileName,
    "WarpTalk-Setup-0.3.2.exe",
    "a Windows visitor must be offered the installer, not the portable build",
  );
  assert.equal(
    pickPrimaryAsset(release.assets, "mac", "arm64")?.fileName,
    "WarpTalk-0.3.2-arm64.dmg",
  );
  assert.equal(
    pickPrimaryAsset(release.assets, "mac", "x64")?.fileName,
    "WarpTalk-0.3.2.dmg",
    "an Intel Mac falls back to the un-suffixed build, not the arm64 one",
  );
  assert.equal(
    pickPrimaryAsset(release.assets, "linux", "universal")?.fileName,
    "WarpTalk-0.3.2.AppImage",
    "AppImage outranks .deb: it runs on any distribution",
  );
});

test("windows installer and portable builds are told apart", () => {
  const installer = classifyDesktopAsset(file("WarpTalk-Setup-0.2.0.exe"));
  const portable = classifyDesktopAsset(file("WarpTalk-0.2.0-portable.exe"));

  assert.equal(installer?.kind, "windows-installer");
  assert.equal(installer?.platform, "windows");
  assert.equal(portable?.kind, "windows-portable");
});

test("mac builds carry their architecture into the label", () => {
  assert.equal(classifyDesktopAsset(file("WarpTalk-0.2.0-arm64.dmg"))?.label, "Apple Silicon (.dmg)");
  assert.equal(classifyDesktopAsset(file("WarpTalk-0.2.0-x64.dmg"))?.label, "Intel (.dmg)");
  assert.equal(classifyDesktopAsset(file("WarpTalk-0.2.0.dmg"))?.label, "Universal (.dmg)");
});

test("a zip only counts as a mac build when the name says so", () => {
  assert.equal(classifyDesktopAsset(file("WarpTalk-0.2.0-mac.zip"))?.platform, "mac");
  assert.equal(classifyDesktopAsset(file("source-code.zip")), null);
});

test("linux packages are recognised", () => {
  assert.equal(classifyDesktopAsset(file("WarpTalk-0.2.0.AppImage"))?.kind, "linux-appimage");
  assert.equal(classifyDesktopAsset(file("warptalk_0.2.0_amd64.deb"))?.kind, "linux-deb");
});

test("normalizeRelease strips the tag prefix and drops metadata files", () => {
  const release = normalizeRelease({
    version: "v0.2.0",
    publishedAt: "2026-08-01T14:59:53.628Z",
    notesUrl: "https://example.test/releases/v0.2.0",
    files: [file("latest.yml"), file("WarpTalk-Setup-0.2.0.exe", 129136128)],
  });

  assert.equal(release?.version, "0.2.0");
  assert.equal(release?.assets.length, 1);
  assert.equal(release?.assets[0].sizeBytes, 129136128);
});

test("a release with no runnable asset is treated as no release at all", () => {
  // A tag pushed before the build finishes uploading has only latest.yml on it. Rendering that
  // as a release would give the page a version number and zero working buttons.
  assert.equal(normalizeRelease({ version: "v0.3.0", files: [file("latest.yml")] }), null);
  assert.equal(normalizeRelease(null), null);
});

test("installers outrank portable builds so the first entry is the recommended one", () => {
  const release = normalizeRelease({
    version: "0.2.0",
    files: [file("WarpTalk-0.2.0-portable.exe"), file("WarpTalk-Setup-0.2.0.exe")],
  });

  assert.equal(release?.assets[0].kind, "windows-installer");
});

test("architecture is matched before falling back within a platform", () => {
  const release = normalizeRelease({
    version: "0.2.0",
    files: [file("WarpTalk-0.2.0-x64.dmg"), file("WarpTalk-0.2.0-arm64.dmg")],
  });
  const assets = release?.assets ?? [];

  assert.equal(pickPrimaryAsset(assets, "mac", "arm64")?.arch, "arm64");
  assert.equal(pickPrimaryAsset(assets, "mac", "x64")?.arch, "x64");
  // An unknown arch still gets something runnable rather than nothing.
  assert.ok(pickPrimaryAsset(assets, "mac", "universal"));
  assert.equal(pickPrimaryAsset(assets, "linux", "x64"), null);
  assert.equal(pickPrimaryAsset(assets, null), null);
});

test("assets group by platform for the all-downloads section", () => {
  const release = normalizeRelease({
    version: "0.2.0",
    files: [
      file("WarpTalk-Setup-0.2.0.exe"),
      file("WarpTalk-0.2.0-arm64.dmg"),
      file("WarpTalk-0.2.0.AppImage"),
      file("warptalk_0.2.0_amd64.deb"),
    ],
  });
  const grouped = groupAssetsByPlatform(release?.assets ?? []);

  assert.equal(grouped.windows.length, 1);
  assert.equal(grouped.mac.length, 1);
  assert.equal(grouped.linux.length, 2);
});

test("file sizes render in the unit a human expects", () => {
  assert.equal(formatFileSize(129136128), "123 MB");
  assert.equal(formatFileSize(2 * 1024 * 1024 * 1024), "2.0 GB");
  assert.equal(formatFileSize(0), "");
});
