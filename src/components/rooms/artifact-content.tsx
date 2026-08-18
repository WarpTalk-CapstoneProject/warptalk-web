"use client";

/**
 * WT-432 — reading an artifact's stored content.
 *
 * The summary export is stored as JSON, deliberately: `parseMeetingSummaryContent` reads it, and
 * the room-history panels have rendered it as prose for a long time. But the two pages that show
 * an artifact directly — the ended-room page and the artifacts page — never used any of that. One
 * dropped `content` into a <pre>, the other ran it through `JSON.stringify(JSON.parse(...))`. So
 * the summary a user actually opened after their meeting looked like this:
 *
 *   {"summary": "The transcript contains no substantive meeting content.", "decisions": [], ...
 *    "vi": {"summary": "Bản chép lời không có nội dung..."}}
 *
 * The \u escapes are just Python's `json.dumps` default on the AI worker's side — correct JSON,
 * and invisible the moment anything parses it rather than printing it.
 *
 * One component for both pages, because two viewers of the same artifact drifting apart is how
 * this happened in the first place.
 */

import { useState } from "react";

import { getLanguageName } from "@/lib/language/languages";
import { readSummaryArtifact } from "@/lib/meeting/artifact-content";
import type { MeetingSummaryContent, MeetingSummarySection } from "@/types/meetingSummary";
import { sectionTitle } from "@/lib/meeting/meeting-summary";

export function ArtifactContentView({ content }: { content: string }) {
  const summary = readSummaryArtifact(content);

  if (!summary) {
    return (
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-hairline bg-surface-1 p-3 font-sans text-[12px] leading-relaxed text-ink-muted">
        {content}
      </pre>
    );
  }

  return <SummaryView summary={summary} />;
}

function SummaryView({ summary }: { summary: MeetingSummaryContent }) {
  const translations = summary.translations ?? {};
  const languages = Object.keys(translations);
  const [language, setLanguage] = useState<string | null>(null);

  // The top-level summary is the primary language; `translations` carries the others. Showing
  // only the primary one in a product whose whole point is multilingual meetings hides half the
  // output the assistant already produced.
  const active: MeetingSummarySection | undefined =
    language !== null ? translations[language] : undefined;

  const overview = active ? active.summary : summary.summary;
  const sections = active
    ? sectionsFromTranslation(active)
    : (summary.sections ?? []);

  if (summary.insufficientData) {
    return (
      <div className="rounded-md border border-hairline bg-surface-1 p-3 text-[12px] leading-relaxed text-ink-muted">
        {summary.summary ||
          "The assistant had nothing to summarize for this meeting."}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-md border border-hairline bg-surface-1 p-3">
      {languages.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <LanguageChip
            label="Original"
            active={language === null}
            onClick={() => setLanguage(null)}
          />
          {languages.map((code) => (
            <LanguageChip
              key={code}
              label={getLanguageName(code) || code.toUpperCase()}
              active={language === code}
              onClick={() => setLanguage(code)}
            />
          ))}
        </div>
      ) : null}

      {overview ? (
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
            Overview
          </h4>
          <p className="mt-1.5 text-[12px] leading-6 text-ink">{overview}</p>
        </section>
      ) : null}

      {sections.map((section) => (
        <section key={section.key}>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
            {section.title}
          </h4>
          <ul className="mt-1.5 space-y-1.5">
            {section.items.map((item, index) => (
              <li
                key={`${section.key}-${index}`}
                className="flex gap-2 text-[12px] leading-5 text-ink"
              >
                <span aria-hidden className="text-ink-subtle">
                  &bull;
                </span>
                <span className="min-w-0">
                  {item.owner ? (
                    <span className="font-medium">{item.owner}: </span>
                  ) : null}
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * A translated block carries only the legacy trio, never the template's own sections — the AI
 * worker translates `{summary, decisions, actionItems}`. Rendering them through the same shape
 * keeps one list renderer instead of two.
 */
function sectionsFromTranslation(section: MeetingSummarySection) {
  const result: { key: string; title: string; items: { text: string; owner?: string }[] }[] = [];

  if (section.decisions?.length) {
    result.push({
      key: "decisions",
      title: sectionTitle("decisions"),
      items: section.decisions.map((text) => ({ text })),
    });
  }
  if (section.actionItems?.length) {
    result.push({
      key: "actionItems",
      title: sectionTitle("actionItems"),
      items: section.actionItems.map((item) => ({ text: item.task, owner: item.owner || undefined })),
    });
  }

  return result;
}

function LanguageChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
        active
          ? "bg-ink text-surface-1"
          : "text-ink-muted hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
