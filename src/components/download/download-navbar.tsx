"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { hasRememberedAccessToken } from "@/lib/auth/landing-redirect";
import { useAuthStore } from "@/stores/auth-store";

export function DownloadNavbar() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const signedIn =
    mounted && ((isAuthenticated && !!user) || hasRememberedAccessToken());

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/workspace");
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-30 px-5 py-5 md:px-8 lg:px-12">
      <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-white/10 bg-black/35 px-4 py-3 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <Link
          href="/"
          className="flex items-center rounded-full border border-black bg-black px-4 py-2 transition-colors hover:bg-black"
          aria-label="WarpTalk home"
        >
          <Image
            src="/assets/logos/warptalk-logo-darkmode.jpg"
            alt="WarpTalk"
            width={144}
            height={144}
            priority
            className="h-9 w-32 object-cover"
          />
        </Link>

        <div className="hidden items-center gap-2 text-sm text-white/62 md:flex">
          <Link
            href="/"
            className="relative rounded-full px-4 py-2 transition-colors hover:text-white"
          >
            Home
          </Link>
          {!signedIn ? (
            <>
              <Link
                href="/login"
                className="relative rounded-full px-4 py-2 transition-colors hover:text-white"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="relative rounded-full px-4 py-2 transition-colors hover:text-white"
              >
                Register
              </Link>
            </>
          ) : null}
        </div>

        {signedIn ? (
          <button
            type="button"
            onClick={handleBack}
            className="rounded-xl bg-gradient-to-b from-white to-neutral-300 px-5 py-2.5 text-sm font-medium text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:from-white hover:to-white"
          >
            Back
          </button>
        ) : (
          <Link
            href="/login"
            className="rounded-xl bg-gradient-to-b from-white to-neutral-300 px-5 py-2.5 text-sm font-medium text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:from-white hover:to-white md:hidden"
          >
            Login
          </Link>
        )}
      </nav>
    </header>
  );
}
