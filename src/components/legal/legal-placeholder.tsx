import Link from "next/link";

/**
 * A deliberately empty legal page.
 *
 * The login screen has linked to /terms and /privacy since it was written, and
 * neither route existed — both were hard 404s on the first screen a stranger
 * sees, for a product that records people's voices. Legal copy cannot be
 * invented by anyone but the team, so these pages state plainly that the
 * document is not published yet instead of pretending to be binding terms.
 * The link stays, the 404 does not, and nobody is misled about what they are
 * agreeing to.
 */
export function LegalPlaceholder({
  title,
  summary,
}: {
  title: string;
  summary: string;
}) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
          WarpTalk
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      </div>

      <p className="text-sm leading-relaxed text-neutral-600">{summary}</p>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-700">
        This document has not been published yet. Until it is, no version of it
        is in force, and nothing on this page should be read as an agreement.
        For questions about how WarpTalk handles your account, your recordings,
        or your voice data, contact the team before creating an account.
      </div>

      <div className="flex flex-wrap gap-4 text-sm font-medium">
        <Link href="/" className="text-neutral-900 hover:underline">
          Back to home
        </Link>
        <Link href="/login" className="text-neutral-900 hover:underline">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
