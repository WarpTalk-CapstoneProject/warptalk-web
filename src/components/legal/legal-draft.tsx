import Link from "next/link";

/**
 * Renders a DRAFT legal document — not the real, binding Terms/Privacy the app used to promise
 * with `<LegalPlaceholder>`. Written by an AI pass over the product's actual features (translation,
 * voice cloning, workspaces, billing) as a starting point for legal review, not as something a
 * visitor should ever agree to as-is.
 *
 * WT-835 / WT-836: the placeholder correctly refused to invent legal copy. This still doesn't
 * invent it — every clause that needs a real answer from the team is marked `NeedsConfirmation`
 * inline, and the banner above the content says outright that nothing on the page is in force.
 * Swap this for the reviewed, final copy once @Tú confirms the marked items; this component
 * should not survive that review unchanged.
 */

export type LegalSection = {
  heading: string;
  paragraphs: string[];
};

// i18n-allow: "CẦN XÁC NHẬN" ("needs confirmation") is the literal marker draft-legal.tsx's
// content files use for a reviewer note — matching it here is code, not copy, and it stays
// Vietnamese because the reviewer (@Tú) and this file's whole purpose are.
function NeedsConfirmationHighlighted({ text }: { text: string }) {
  const parts = text.split(/(\[CẦN XÁC NHẬN[^\]]*\])/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("[CẦN XÁC NHẬN") ? (
          <mark
            key={index}
            className="rounded bg-amber-200 px-1 py-0.5 font-medium text-amber-900"
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function LegalDraft({
  title,
  lastUpdatedNote,
  sections,
  reviewNotes,
}: {
  title: string;
  lastUpdatedNote: string;
  sections: LegalSection[];
  reviewNotes: string[];
}) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col gap-8 px-6 py-16">
      {/* i18n-allow: "@Tú" is the reviewer's name, and the [CẦN XÁC NHẬN] marker below it is
          explained in the file header — this banner is itself the notice that the page is a
          draft, not translated end-user copy. */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
        <p className="font-semibold">
          ⚠️ Draft — pending legal review by @Tú. Not yet in force.
        </p>
        <p className="mt-1">
          This page is a working draft generated from the product&apos;s actual features, not a
          published legal document. Highlighted items below (
          <mark className="rounded bg-amber-200 px-1 py-0.5 font-medium text-amber-900">
            [CẦN XÁC NHẬN]
          </mark>
          ) still need an answer from the team before this can replace the placeholder shown to
          real visitors. Nothing on this page should be read as an agreement until it is reviewed
          and this banner is removed.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">WarpTalk</p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-neutral-500">{lastUpdatedNote}</p>
      </div>

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">{section.heading}</h2>
            {section.paragraphs.map((paragraph, index) => (
              <p key={index} className="text-sm leading-relaxed text-neutral-700">
                <NeedsConfirmationHighlighted text={paragraph} />
              </p>
            ))}
          </section>
        ))}
      </div>

      {/* i18n-allow: "@Tú" is the reviewer's name — see the file header. */}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-700">
        <p className="mb-2 font-semibold text-neutral-900">
          Checklist for @Tú before this goes live:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {reviewNotes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
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
