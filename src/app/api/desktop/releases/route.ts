import { NextResponse } from "next/server";

import {
  fetchLatestDesktopRelease,
  getReleasesPageUrl,
} from "@/lib/desktop-releases.server";

/**
 * The latest desktop build, normalised.
 *
 * /download renders from this same data server-side, so the endpoint exists for the callers
 * that cannot: the desktop app checking for updates behind a corporate proxy, and any client
 * that wants a fresh answer without a full page load.
 *
 * `release: null` is a 200, not an error — "no build published yet" is a valid state that
 * callers should render as such rather than retry.
 */
export async function GET() {
  const release = await fetchLatestDesktopRelease();

  return NextResponse.json(
    { release, releasesPageUrl: getReleasesPageUrl() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
      },
    },
  );
}

export const revalidate = 600;
