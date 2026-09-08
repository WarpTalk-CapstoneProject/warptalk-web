"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef } from "react";

import { WarpTalkBrand } from "@/components/layout/warptalk-brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Where a provider's consent lands after the API has redeemed the code.
 *
 * This page exists for one case: the desktop app opens the provider's consent screen in the
 * system browser, so when consent finishes the browser is holding the result and the app that
 * asked for it cannot see it. Handing the user back across that gap needs a page in the browser,
 * and a `warptalk://` link is the only thing that reaches the app.
 *
 * For an ordinary browser session there is nothing to hand back, so this forwards to the plugins
 * page without rendering - the user approved a request seconds ago and does not need to be told
 * about it twice.
 */

const PLUGINS_PATH = "/settings/plugins";

/** A provider is a catalog slug. Anything else does not go into a link this page opens. */
function safeProvider(value: unknown): string | null {
  const provider = Array.isArray(value) ? value[0] : value;
  return typeof provider === "string" && /^[a-z0-9_-]{1,64}$/.test(provider) ? provider : null;
}

/**
 * The subset of the query worth carrying onward.
 *
 * Rebuilt rather than forwarded whole: everything here ends up either in a deep link or in the
 * next URL, and copying an arbitrary query into both is how an open redirect starts.
 */
function outcomeQuery(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of ["status", "reason", "plugin", "ref"]) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return next;
}

function ConnectCallback() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const provider = safeProvider(params?.provider);
  const isDesktopFlow = searchParams.get("client") === "desktop";
  const query = useMemo(
    () => outcomeQuery(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const queryString = query.toString();
  const pluginsUrl = `${PLUGINS_PATH}${queryString ? `?${queryString}` : ""}`;
  const deepLink = provider ? `warptalk://connect/${provider}/callback?${queryString}` : null;

  // The page renders its fallback button from the first frame rather than after a timeout: a
  // browser that silently refuses to open the scheme gives no event to wait for. Handing off is
  // therefore a side effect with no visible state, and a ref keeps it to once per mount.
  const handedOff = useRef(false);

  useEffect(() => {
    if (!isDesktopFlow) {
      router.replace(pluginsUrl);
      return;
    }
    if (!deepLink || handedOff.current) return;
    handedOff.current = true;
    window.location.href = deepLink;
  }, [deepLink, isDesktopFlow, pluginsUrl, router]);

  if (!isDesktopFlow) return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-0 bg-surface-1 px-6 text-center text-ink">
      <WarpTalkBrand className="h-8 w-[130px]" />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">Opening WarpTalk…</h1>
      <p className="mt-2 text-sm text-ink-muted">
        If the app doesn&apos;t open automatically, click the button below.
      </p>
      <a
        href={deepLink ?? pluginsUrl}
        className={cn(buttonVariants({ size: "lg" }), "mt-6 h-10 px-5")}
      >
        {deepLink ? "Open WarpTalk" : "Go to Plugins"}
      </a>
      <p className="mt-7 text-xs text-ink-subtle">
        You can close this tab once WarpTalk opens.
      </p>
    </main>
  );
}

export default function ConnectCallbackPage() {
  return (
    <Suspense fallback={null}>
      <ConnectCallback />
    </Suspense>
  );
}
