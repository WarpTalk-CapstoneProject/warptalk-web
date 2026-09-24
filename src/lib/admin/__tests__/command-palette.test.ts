import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADMIN_PALETTE_ACTIONS,
  ADMIN_PALETTE_PAGES,
  listSearchHref,
  parseRecent,
  pushRecent,
  rankPaletteEntries,
  type AdminPaletteEntry,
} from "../command-palette.ts";

const LABELS: Record<string, string> = {
  insights: "Insights",
  workspaces: "Workspaces",
  accounts: "Accounts",
  subscriptions: "Subscriptions",
  plansAndPricing: "Plans & pricing",
  billingLedger: "Billing ledger",
  salesLeads: "Sales leads",
  systemHealth: "System health",
  feedback: "Feedback",
  auditLog: "Audit log",
  announcements: "Announcements",
  emailTemplates: "Email templates",
  platformSettings: "Platform settings",
  plugins: "Plugins",
  globalGlossary: "Global glossary",
  adjustCredit: "Adjust credit…",
  createPlan: "Create plan",
  composeAnnouncement: "Compose announcement",
};
const labelOf = (entry: AdminPaletteEntry) => LABELS[entry.labelKey] ?? entry.labelKey;
const top = (query: string, entries: readonly AdminPaletteEntry[] = [...ADMIN_PALETTE_PAGES, ...ADMIN_PALETTE_ACTIONS]) =>
  rankPaletteEntries(query, entries, labelOf)[0]?.entry.id;

describe("admin palette ranking", () => {
  it("finds the billing ledger from 'invoice' in English and Vietnamese, with or without marks", () => {
    for (const query of ["invoice", "hoá đơn", "hóa đơn", "hoa don", "請求書"]) {
      assert.equal(top(query, ADMIN_PALETTE_PAGES), "billing", query);
    }
  });

  it("puts a page first when its own label is typed", () => {
    assert.equal(top("plans"), "plans");
    assert.equal(top("accounts"), "accounts");
    assert.equal(top("tài khoản"), "accounts");
    assert.equal(top("thuật ngữ"), "globalGlossary");
  });

  it("finds quick actions by verb", () => {
    assert.equal(top("adjust credit"), "adjustCredit");
    assert.equal(top("điều chỉnh tín dụng"), "adjustCredit");
    assert.equal(top("create plan"), "createPlan");
    assert.equal(top("soạn thông báo"), "composeAnnouncement");
  });

  it("returns nothing for nonsense", () => {
    assert.deepEqual(rankPaletteEntries("zzqx", ADMIN_PALETTE_PAGES, labelOf), []);
  });

  it("gives every page and action a unique id and an /admin destination", () => {
    const all = [...ADMIN_PALETTE_PAGES, ...ADMIN_PALETTE_ACTIONS];
    assert.equal(new Set(all.map((entry) => entry.id)).size, all.length);
    for (const entry of all) assert.ok(entry.href.startsWith("/admin"), entry.id);
  });
});

describe("recent items", () => {
  it("dedupes by destination, newest first, capped", () => {
    let list = pushRecent([], { kind: "page", href: "/admin/plans", label: "Plans" });
    list = pushRecent(list, { kind: "workspace", href: "/admin/workspaces/acme", label: "Acme" });
    list = pushRecent(list, { kind: "page", href: "/admin/plans", label: "Plans" });
    assert.deepEqual(list.map((item) => item.href), ["/admin/plans", "/admin/workspaces/acme"]);
    for (let i = 0; i < 20; i += 1) list = pushRecent(list, { kind: "page", href: `/admin/x${i}`, label: "x" });
    assert.equal(list.length, 8);
  });

  it("survives corrupt storage and refuses destinations outside the portal", () => {
    assert.deepEqual(parseRecent("{nope"), []);
    assert.deepEqual(parseRecent(JSON.stringify({ a: 1 })), []);
    assert.deepEqual(
      parseRecent(
        JSON.stringify([
          { kind: "page", href: "https://evil.example", label: "x" },
          { kind: "page", href: "/admin/audit", label: "Audit" },
        ]),
      ).map((item) => item.href),
      ["/admin/audit"],
    );
  });
});

describe("list search links", () => {
  it("hands the query to a list page as ?q=, keeping its own params", () => {
    assert.equal(listSearchHref("/admin/users", " an@x.io "), "/admin/users?q=an%40x.io");
    assert.equal(listSearchHref("/admin/billing?tab=invoices", "INV-1"), "/admin/billing?tab=invoices&q=INV-1");
  });
});
