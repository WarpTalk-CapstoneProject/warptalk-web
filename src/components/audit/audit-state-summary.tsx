/**
 * Pieces of an audit row shared by the platform audit log (/admin/audit) and the workspace audit
 * log (/[workspaceSlug]/settings/audit-log). Both read the same store, so a before/after pair
 * must read the same way on both.
 */

export function formatAuditWhen(value: string, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * The before/after pairs an action recorded, if any.
 *
 * Rendered as plain key–value text rather than a JSON blob: these are already redacted twice and
 * are usually one or two fields, and a collapsed `{...}` would hide the only part of the row that
 * says what actually changed.
 */
export function AuditStateSummary({
  before,
  after,
}: {
  before: Record<string, string | null> | null;
  after: Record<string, string | null> | null;
}) {
  const keys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  );

  if (keys.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
      {keys.map((key) => {
        const from = before?.[key];
        const to = after?.[key];
        return (
          <span key={key} className="font-mono text-[11px] text-ink-subtle">
            {key}:{" "}
            {from != null && to != null && from !== to ? (
              <>
                <span className="line-through">{from}</span> → <span className="text-ink">{to}</span>
              </>
            ) : (
              <span className="text-ink">{to ?? from ?? "—"}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
