#!/usr/bin/env node
/**
 * Post-meeting surface contract (Meeting history + Transcripts/AI summaries).
 *
 * Two of the six bugs this guards against were REGRESSIONS of a fix already made in the
 * same file, so these are source-level assertions rather than behaviour tests: they fail
 * the moment someone reintroduces the shape, not just the symptom.
 *
 * Companion unit tests: src/lib/room-history-mapping.test.ts.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Comments are stripped before matching. Several of these checks assert that a bad shape is
 * ABSENT, and the fixes deliberately document the shape they replaced ("this used to ask for
 * pageSize: 100") — matching prose would make the guard fail on its own explanation.
 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const read = (relative) => stripComments(readFileSync(join(root, relative), "utf8"));

const failures = [];
const check = (label, condition, detail) => {
  if (!condition) failures.push(detail ? `${label}\n    ${detail}` : label);
};

const HISTORY_SERVICE = "src/services/roomHistory.service.ts";
const HISTORY_PAGE = "src/app/(app)/[workspaceSlug]/history/page.tsx";
const SUMMARIES_PAGE = "src/app/(app)/[workspaceSlug]/ai-summaries/page.tsx";
const HISTORY_HOOK = "src/hooks/use-room-history.ts";
const MAPPING_LIB = "src/lib/room-history-mapping.ts";
const WIRE_LIB = "src/lib/wire-status.ts";

const historyService = read(HISTORY_SERVICE);
const historyPage = read(HISTORY_PAGE);
const summariesPage = read(SUMMARIES_PAGE);
const historyHook = read(HISTORY_HOOK);

// ── 1. The case-mismatch class ──────────────────────────────────────────────
//
// Backend enums are serialised UPPERCASE (JsonStringEnumConverter, no naming policy), so a
// bare comparison against a lowercase literal on a raw wire value is a branch that can never
// fire. This has shipped three times. Room status must be folded, never compared raw.

check(
  "roomHistory.service must not compare a raw room status against a lowercase literal",
  !/room\.status\s*===\s*["'](?:cancelled|ended|scheduled|waiting|in_progress|paused|expired|failed)["']/.test(
    historyService,
  ),
  `${HISTORY_SERVICE}: use resolveHistoryStatus(room.status) — the wire value is "CANCELLED".`,
);

check(
  "roomHistory.service must derive the history status through resolveHistoryStatus",
  /resolveHistoryStatus\(\s*room\.status\s*\)/.test(historyService),
  `${HISTORY_SERVICE}: expected \`status: resolveHistoryStatus(room.status)\`.`,
);

check(
  "roomHistory.service must fold artifact status rather than trusting its casing",
  /resolveArtifactStatus\(/.test(historyService),
  `${HISTORY_SERVICE}: artifact status must go through resolveArtifactStatus.`,
);

check(
  "foldWireStatus must actually case-fold",
  /toLowerCase\(\)/.test(read(WIRE_LIB)),
  `${WIRE_LIB}: the whole point of the helper is the fold; without it the guard is decorative.`,
);

check(
  "the post-meeting mapping must fold through the shared wire-status helper",
  /foldWireStatus\(/.test(read(MAPPING_LIB)),
  `${MAPPING_LIB}: status comparisons must go through foldWireStatus, not raw equality.`,
);

// The invitation preview had the same bug in the other direction ("Accepted" vs "ACCEPTED").
const invitationPage = read("src/app/invitations/[token]/page.tsx");
check(
  "the invitation preview must not compare a raw status against a cased literal",
  !/previewData\.status\s*===\s*["']/.test(invitationPage),
  'src/app/invitations/[token]/page.tsx: use wireStatusIs(previewData.status, "ACCEPTED").',
);

// ── 2. Server pagination, and the server's own total ────────────────────────

check(
  "roomHistory.service must not pin pageSize to the server's 100-row clamp",
  !/pageSize:\s*100\b/.test(historyService),
  `${HISTORY_SERVICE}: request a real page, not the maximum window.`,
);

check(
  "roomHistory.service must forward page/pageSize to the server",
  /page,/.test(historyService) && /pageSize,/.test(historyService),
  `${HISTORY_SERVICE}: the history request must carry page and pageSize.`,
);

check(
  "roomHistory.service must surface the server's total/page/pageSize",
  /total:\s*data\.total/.test(historyService) &&
    /page:\s*data\.page/.test(historyService) &&
    /pageSize:\s*data\.pageSize/.test(historyService),
  `${HISTORY_SERVICE}: the response carries total/page/pageSize — do not drop them.`,
);

check(
  "the history page must render the server total, never rooms.length",
  !/\{rooms\.length\}\s*results/.test(historyPage),
  `${HISTORY_PAGE}: "\${rooms.length} results" reports 100 for a 300-meeting workspace.`,
);

for (const [label, source, file] of [
  ["history", historyPage, HISTORY_PAGE],
  ["transcripts", summariesPage, SUMMARIES_PAGE],
]) {
  check(
    `the ${label} page must read total from the query result`,
    /data\?\.total/.test(source),
    `${file}: expected the paged total to come from history.data?.total.`,
  );
  check(
    `the ${label} page must expose a pager driven by the URL`,
    /page:\s*String\(page \+ 1\)/.test(source) && /page:\s*String\(page - 1\)/.test(source),
    `${file}: expected Previous/Next controls writing ?page= (admin workspace directory pattern).`,
  );
  check(
    `the ${label} page must read its page number from the URL`,
    /parsePageParam\(\s*searchParams\.get\("page"\)\s*\)/.test(source),
    `${file}: the URL is the source of truth for paging.`,
  );
}

// ── 3. A deep link must never silently show a different meeting ─────────────

check(
  "a ?room= deep link must not fall through to items[0]",
  !/requestedRoomId\s*\)\s*\?\?\s*\n?\s*items\[0\]/.test(summariesPage) &&
    /deepLinkUnreachable/.test(summariesPage),
  `${SUMMARIES_PAGE}: an unreachable deep link must say so, not silently select another meeting.`,
);

// ── 4. Polling: must exist, must be derived from data, must terminate ───────

check(
  "use-room-history must poll while artifacts are unresolved",
  // Anchored on the exact option key — `refetchIntervalInBackground` and a renamed-out
  // `refetchIntervalDISABLED` both contain the substring, so a loose match passes on a
  // hook that no longer polls at all.
  /(^|[\s{,])refetchInterval\s*:/m.test(historyHook),
  `${HISTORY_HOOK}: without this the AI summary only ever appears after a manual reload.`,
);

check(
  "the poll interval must be derived from artifact state, not hardcoded on",
  /shouldPollRoomHistory\(/.test(historyHook),
  `${HISTORY_HOOK}: an always-on interval is a battery/quota leak; derive it from the data.`,
);

check(
  "the poll must be able to stop",
  /shouldPollRoomHistory\([^)]*\)\s*\?[^:]*:\s*false/.test(historyHook),
  `${HISTORY_HOOK}: refetchInterval must return false once everything has resolved.`,
);

// ── 5. Summary panel: three distinguishable states ──────────────────────────

check(
  "the summary panel must not derive 'generating' from a wall clock alone",
  !/const isGenerating\s*=\s*!artifact && recentlyEnded/.test(summariesPage),
  `${SUMMARIES_PAGE}: generating must be read off the artifact's status.`,
);

check(
  "the summary panel must resolve an explicit state",
  /resolveSummaryState\(/.test(summariesPage),
  `${SUMMARIES_PAGE}: expected resolveSummaryState to distinguish ready/generating/failed/empty.`,
);

check(
  "the summary panel must not reuse one sentence for every non-ready state",
  /SUMMARY_EMPTY_COPY/.test(summariesPage) &&
    /failed:\s*\{/.test(summariesPage) &&
    /generating:\s*\{/.test(summariesPage),
  `${SUMMARIES_PAGE}: not-ready, failed and genuinely-empty need distinct copy.`,
);

// ── 6. Retention must not be invented ───────────────────────────────────────

check(
  "retention day-counts must not be hardcoded in the service",
  !/transcriptRetentionDays:\s*\d/.test(historyService) &&
    !/recordingRetentionDays:\s*\d/.test(historyService),
  `${HISTORY_SERVICE}: nothing in warptalk-backend configures these; do not present them as policy.`,
);

check(
  "retention must not fall back to the meeting's own end time",
  !/expiresAt:\s*firstExpiry\s*\?\?\s*room\.endedAt/.test(historyService),
  `${HISTORY_SERVICE}: that rendered "Retention ends <the moment it ended>" for every meeting.`,
);

check(
  "retention must be resolved from real artifact dates only",
  /resolveRetention\(/.test(historyService),
  `${HISTORY_SERVICE}: expected resolveRetention(artifacts).`,
);

check(
  "the history page must not claim a retention policy it cannot source",
  !/Retention follows workspace policy/.test(historyPage) &&
    !/Retention ends \$\{/.test(historyPage),
  `${HISTORY_PAGE}: say only what an artifact's retentionUntil actually states.`,
);

// ── 7. Duration must not come from createdAt ────────────────────────────────

check(
  "duration must not be computed from createdAt",
  !/calculateMeetingDurationSeconds\(\s*room\.createdAt/.test(historyService),
  `${HISTORY_SERVICE}: a meeting pre-created the night before then reports ~14h.`,
);

check(
  "duration must be resolved from startedAt/endedAt (or a server-reported value)",
  /resolveMeetingDurationSeconds\(\{/.test(historyService) &&
    /startedAt:\s*room\.startedAt/.test(historyService) &&
    /endedAt:\s*room\.endedAt/.test(historyService),
  `${HISTORY_SERVICE}: expected resolveMeetingDurationSeconds with startedAt/endedAt.`,
);

for (const [label, source, file] of [
  ["history", historyPage, HISTORY_PAGE],
  ["transcripts", summariesPage, SUMMARIES_PAGE],
]) {
  check(
    `the ${label} page must use the shared duration formatter`,
    /formatMeetingDuration\(/.test(source),
    `${file}: the local formatter rendered "0m" for any meeting under a minute.`,
  );
  check(
    `the ${label} page must not keep a local minute-flooring formatter`,
    !/function formatDuration\(seconds: number\)/.test(source),
    `${file}: two formatters is how they drift.`,
  );
}

// ── Report ──────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error("\n✖ post-meeting surface contract FAILED\n");
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error("");
  process.exit(1);
}

console.log("✔ post-meeting surface contract: all checks passed");
