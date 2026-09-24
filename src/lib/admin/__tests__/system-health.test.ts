import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GRAFANA_DASHBOARDS,
  formatRate,
  grafanaDashboardUrl,
  normalizeEmbedPath,
  pipelineRows,
  rateTone,
} from "../system-health.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const meetings = GRAFANA_DASHBOARDS.find((d) => d.key === "meetings")!;

describe("Grafana embed URLs", () => {
  it("builds a same-origin kiosk URL for a provisioned dashboard", () => {
    const url = grafanaDashboardUrl("/grafana", meetings, "dark");
    assert.equal(
      url,
      "/grafana/d/warptalk-meetings/?orgId=1&theme=dark&refresh=30s&from=now-24h&to=now&kiosk",
    );
  });

  it("drops the kiosk flag for the open-in-Grafana link", () => {
    const url = grafanaDashboardUrl("/grafana/", meetings, "light", { kiosk: false });
    assert.ok(url?.startsWith("/grafana/d/warptalk-meetings/?"));
    assert.ok(!url?.includes("kiosk"));
  });

  it("refuses anything that is not a same-origin path", () => {
    for (const path of [null, undefined, "", "/", "https://grafana.example.com", "//evil.example.com/g", "grafana", '/g"><script>']) {
      assert.equal(normalizeEmbedPath(path), null, String(path));
      assert.equal(grafanaDashboardUrl(path, meetings, "light"), null, String(path));
    }
  });

  it("uses exactly the uids the infrastructure chart provisions", () => {
    assert.deepEqual(
      GRAFANA_DASHBOARDS.map((d) => d.uid),
      ["warptalk-meetings", "warptalk-platform", "warptalk-pods"],
    );
  });
});

describe("rates", () => {
  it("formats with one decimal and never claims 0% for unknown", () => {
    assert.equal(formatRate(0.81234), "81.2%");
    assert.equal(formatRate(1), "100%");
    assert.equal(formatRate(0), "0.0%");
    assert.equal(formatRate(null), "—");
    assert.equal(formatRate(Number.NaN), "—");
  });

  it("bands match the dashboards and the alert", () => {
    assert.equal(rateTone(0.97), "good");
    assert.equal(rateTone(0.9), "warn");
    assert.equal(rateTone(0.5), "bad");
    assert.equal(rateTone(null), "unknown");
  });
});

describe("pipeline rows", () => {
  it("always has stt, translation and tts in pipeline order, joined with latency", () => {
    const rows = pipelineRows(
      [
        { stage: "tts", ok: 90, failed: 10, deadLettered: 0, successRate: 0.9 },
        { stage: "billing", ok: 5, failed: 0, deadLettered: 0, successRate: 1 },
        { stage: "stt", ok: 40, failed: 10, deadLettered: 1, successRate: 0.8 },
      ],
      [
        { stage: "stt", p95Ms: 1200 },
        { stage: "tts_synthesis", p95Ms: 900 },
      ],
    );

    assert.deepEqual(rows.map((r) => r.stage), ["stt", "translation", "tts"]);
    assert.equal(rows[0].p95Ms, 1200);
    assert.equal(rows[0].deadLettered, 1);
    assert.equal(rows[1].successRate, null, "a silent stage is unknown, not 0%");
    assert.equal(rows[2].successRate, 0.9);
    assert.equal(rows[2].p95Ms, null);
  });
});

describe("page wiring", () => {
  const page = readFileSync(join(ROOT, "src/app/(app)/admin/health/page.tsx"), "utf8");

  it("embeds Grafana only through the helper, so the path is always checked", () => {
    assert.match(page, /grafanaDashboardUrl\(/);
    assert.doesNotMatch(page, /src=\{`\//, "no hand-built iframe src");
    assert.match(page, /<iframe/);
  });

  it("no longer shows the scrape-targets-down tile", () => {
    assert.doesNotMatch(page, /tileScrapeTargetsDown/);
  });

  it("shows the meeting success rate and the outbox dead letters", () => {
    assert.match(page, /health\.meetings/);
    assert.match(page, /outboxDeadLetters/);
  });
});

describe("the app CSP still lets the page frame its own origin", () => {
  it("frame-src 'self' is present in the Traefik security headers contract the web relies on", () => {
    // The CSP is served by Traefik (warptalk-infrastructure security-headers.yaml), not by Next.
    // Next only sets X-Frame-Options: DENY on its own pages, which governs who may frame the
    // PORTAL, not what the portal may frame. Pinned here so a Next-side CSP added later has to
    // keep the Grafana frame working.
    const nextConfig = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    const csp = /Content-Security-Policy[^\n]*\n?[^\n]*frame-src([^;"]*)/.exec(nextConfig);
    if (csp) assert.match(csp[1], /'self'/);
  });
});
