import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { LEGAL_CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE } from "@/lib/legal/legal-contact";

type LegalSection = { heading: string; body: string[] };

/**
 * Renders /terms or /privacy from the `legal` catalog.
 *
 * The documents live in `messages/{locale}/legal.json` as ordered `sections`, each a heading
 * plus paragraphs, so the three locales stay key-for-key identical (`test:i18n-catalog`) and
 * the copy is edited in the catalog, not in JSX. A paragraph starting with "- " is a list
 * item; consecutive items render as one list. `{email}` is replaced with the contact mailbox.
 */
export async function LegalDocument({ kind }: { kind: "terms" | "privacy" }) {
  const t = await getTranslations("legal");
  const format = await getFormatter();

  const sections = t.raw(`${kind}.sections`) as Record<string, LegalSection>;
  const effectiveDate = format.dateTime(new Date(`${LEGAL_EFFECTIVE_DATE}T00:00:00Z`), {
    dateStyle: "long",
    timeZone: "UTC",
  });
  const other = kind === "terms" ? "privacy" : "terms";

  return (
    <main className="min-h-[100dvh] bg-white text-neutral-900">
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <header className="space-y-4 border-b border-neutral-200 pb-8">
          <Link
            href="/"
            className="text-xs font-medium uppercase tracking-widest text-neutral-500 hover:text-neutral-900"
          >
            {t("brand")}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t(`${kind}.title`)}</h1>
          <p className="text-sm text-neutral-500">{t("document.effective", { date: effectiveDate })}</p>
          <p className="text-base leading-relaxed text-neutral-700">{t(`${kind}.summary`)}</p>
        </header>

        <nav aria-label={t("document.contents")} className="border-b border-neutral-200 py-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-500">
            {t("document.contents")}
          </h2>
          <ol className="grid gap-1.5 text-sm sm:grid-cols-2">
            {Object.entries(sections).map(([id, section]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-neutral-700 hover:text-neutral-900 hover:underline">
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-10 py-10">
          {Object.entries(sections).map(([id, section]) => (
            <section key={id} id={id} className="scroll-mt-8 space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">{section.heading}</h2>
              <SectionBody paragraphs={section.body} />
            </section>
          ))}
        </div>

        <footer className="space-y-4 border-t border-neutral-200 pt-8 text-sm">
          <p className="text-neutral-600">
            {t("document.questions")}{" "}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-medium text-neutral-900 hover:underline">
              {LEGAL_CONTACT_EMAIL}
            </a>
          </p>
          <div className="flex flex-wrap gap-4 font-medium">
            <Link href={`/${other}`} className="text-neutral-900 hover:underline">
              {t(`${other}.title`)}
            </Link>
            <Link href="/" className="text-neutral-900 hover:underline">
              {t("document.backToHome")}
            </Link>
            <Link href="/login" className="text-neutral-900 hover:underline">
              {t("document.backToSignIn")}
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

function SectionBody({ paragraphs }: { paragraphs: string[] }) {
  const blocks: Array<string | string[]> = [];
  for (const raw of paragraphs) {
    const text = raw.replaceAll("{email}", LEGAL_CONTACT_EMAIL);
    if (text.startsWith("- ")) {
      const last = blocks[blocks.length - 1];
      if (Array.isArray(last)) last.push(text.slice(2));
      else blocks.push([text.slice(2)]);
    } else {
      blocks.push(text);
    }
  }

  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-neutral-700">
      {blocks.map((block, index) =>
        Array.isArray(block) ? (
          <ul key={index} className="list-disc space-y-1.5 pl-5">
            {block.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{block}</p>
        ),
      )}
    </div>
  );
}
