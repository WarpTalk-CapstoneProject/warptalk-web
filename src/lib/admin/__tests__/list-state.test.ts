import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyClientListState,
  booleanValue,
  countActiveFilters,
  datePresetRange,
  dateRangeBounds,
  dateRangeValue,
  defaultListState,
  entityValues,
  enumValue,
  enumValues,
  groupRows,
  hasNarrowing,
  matchDatePreset,
  numberRangeValue,
  paginateRows,
  parseFilterValue,
  parseListState,
  serializeListState,
  singleEnumFilter,
  toggleFilterValue,
  type ListStateConfig,
} from "../list-state.ts";
import { looksLikeGuid, matchScore, matchesSearch, normalizeSearchText } from "../search-text.ts";

const config: ListStateConfig = {
  filters: [
    { key: "status", kind: "enum", multiple: true, values: ["active", "suspended", "deleted"] },
    { key: "plan", kind: "enum" },
    { key: "created", kind: "dateRange" },
    { key: "members", kind: "numberRange" },
    { key: "autoRenew", kind: "boolean" },
    { key: "workspace", kind: "entity" },
  ],
  sortFields: ["created", "name", "members"],
  defaultSort: { field: "created", direction: "desc" },
  columns: [{ id: "name" }, { id: "owner" }, { id: "updated", defaultHidden: true }],
  groupings: ["status"],
  views: ["list", "board"],
  toggles: [{ key: "deleted", default: false }],
};

const params = (query: string) => new URLSearchParams(query);

describe("parseListState", () => {
  it("reads an untouched URL as the defaults", () => {
    assert.deepEqual(parseListState(params(""), config), defaultListState(config));
  });

  it("reads every kind of filter", () => {
    const state = parseListState(
      params(
        "q=%20acme%20&status=active,suspended&plan=pro&created=2026-01-01..2026-01-31&members=5..&autoRenew=false&workspace=ws-1",
      ),
      config,
    );
    assert.equal(state.search, "acme");
    assert.deepEqual(state.filters.status, { kind: "enum", values: ["active", "suspended"] });
    assert.deepEqual(state.filters.plan, { kind: "enum", values: ["pro"] });
    assert.deepEqual(state.filters.created, { kind: "dateRange", from: "2026-01-01", to: "2026-01-31" });
    assert.deepEqual(state.filters.members, { kind: "numberRange", min: 5, max: undefined });
    assert.deepEqual(state.filters.autoRenew, { kind: "boolean", value: false });
    assert.deepEqual(state.filters.workspace, { kind: "entity", values: ["ws-1"] });
    assert.equal(countActiveFilters(state), 6);
  });

  it("drops enum values the list does not know, so a stale link cannot 400 the server", () => {
    const state = parseListState(params("status=active,bogus"), config);
    assert.deepEqual(state.filters.status, { kind: "enum", values: ["active"] });
    assert.equal(parseListState(params("status=bogus"), config).filters.status, undefined);
  });

  it("keeps one value on a single-select filter", () => {
    const state = parseListState(params("plan=pro,team"), config);
    assert.deepEqual(state.filters.plan, { kind: "enum", values: ["pro"] });
  });

  it("swaps reversed ranges instead of returning nothing", () => {
    const state = parseListState(params("created=2026-03-01..2026-01-01&members=50..5"), config);
    assert.deepEqual(state.filters.created, { kind: "dateRange", from: "2026-01-01", to: "2026-03-01" });
    assert.deepEqual(state.filters.members, { kind: "numberRange", min: 5, max: 50 });
  });

  it("ignores impossible dates and junk numbers", () => {
    assert.equal(parseFilterValue({ key: "d", kind: "dateRange" }, "2026-02-30.."), null);
    assert.equal(parseFilterValue({ key: "n", kind: "numberRange" }, "abc..def"), null);
    assert.equal(parseFilterValue({ key: "b", kind: "boolean" }, "maybe"), null);
  });

  it("rejects sort fields, groupings and views the list does not offer", () => {
    const state = parseListState(params("sort=secret&dir=sideways&group=owner&view=grid&page=-4"), config);
    assert.deepEqual(state.sort, { field: "created", direction: "desc" });
    assert.equal(state.group, "none");
    assert.equal(state.view, "list");
    assert.equal(state.page, 1);
  });

  it("reads hidden columns, including an explicit empty set", () => {
    assert.deepEqual(parseListState(params("hide=owner,nope"), config).hidden, ["owner"]);
    assert.deepEqual(parseListState(params("hide="), config).hidden, []);
    assert.deepEqual(parseListState(params(""), config).hidden, ["updated"]);
  });
});

describe("serializeListState", () => {
  it("writes nothing for the defaults", () => {
    assert.equal(serializeListState(defaultListState(config), config).toString(), "");
  });

  it("round-trips a full view", () => {
    const query =
      "tab=invoices&q=acme&status=active%2Csuspended&created=2026-01-01..&members=..20&autoRenew=true&sort=name&dir=asc&group=status&view=board&hide=&deleted=1&page=3";
    const state = parseListState(params(query), config);
    const written = serializeListState(state, config, params(query));
    assert.deepEqual(parseListState(written, config), state);
    assert.equal(written.get("tab"), "invoices", "parameters the list does not own are kept");
  });

  it("removes a filter that was cleared", () => {
    const state = parseListState(params("status=active&q=x"), config);
    delete state.filters.status;
    state.search = "";
    assert.equal(serializeListState(state, config, params("status=active&q=x")).toString(), "");
  });
});

describe("filter helpers", () => {
  it("toggles values with and without multi-select", () => {
    const one = toggleFilterValue(undefined, "enum", "a", true);
    const two = toggleFilterValue(one!, "enum", "b", true);
    assert.deepEqual(two, { kind: "enum", values: ["a", "b"] });
    assert.deepEqual(toggleFilterValue(two!, "enum", "a", true), { kind: "enum", values: ["b"] });
    assert.equal(toggleFilterValue({ kind: "enum", values: ["b"] }, "enum", "b", true), null);
    assert.deepEqual(toggleFilterValue(two!, "enum", "c", false), { kind: "enum", values: ["c"] });
  });

  it("tells a narrowed list from an empty one", () => {
    assert.equal(hasNarrowing({ search: "", filters: {} }), false);
    assert.equal(hasNarrowing({ search: " x ", filters: {} }), true);
    assert.equal(hasNarrowing({ search: "", filters: { a: { kind: "boolean", value: false } } }), true);
  });
});

describe("reading filters for an API", () => {
  it("returns each kind, and nothing for a filter of another kind", () => {
    const { filters } = parseListState(
      params("status=active,deleted&created=2026-01-01..&members=..9&autoRenew=true&workspace=a"),
      config,
    );
    assert.deepEqual(enumValues(filters, "status"), ["active", "deleted"]);
    assert.equal(enumValue(filters, "status"), "active");
    assert.equal(enumValue(filters, "plan"), undefined);
    assert.deepEqual(dateRangeValue(filters, "created"), { from: "2026-01-01", to: undefined });
    assert.deepEqual(numberRangeValue(filters, "members"), { min: undefined, max: 9 });
    assert.equal(booleanValue(filters, "autoRenew"), true);
    assert.deepEqual(entityValues(filters, "workspace"), ["a"]);
    assert.deepEqual(entityValues(filters, "status"), []);
  });

  it("turns a status tab into a filter, and 'all' into none", () => {
    assert.deepEqual(singleEnumFilter("locked"), { kind: "enum", values: ["locked"] });
    assert.equal(singleEnumFilter("all"), null);
    assert.equal(singleEnumFilter(""), null);
  });
});

describe("date presets", () => {
  const now = new Date(2026, 8, 25, 15, 30); // 25 Sep 2026, local

  it("resolves presets as local calendar days with an inclusive end", () => {
    assert.deepEqual(datePresetRange("today", now), { from: "2026-09-25", to: "2026-09-25" });
    assert.deepEqual(datePresetRange("7d", now), { from: "2026-09-19", to: "2026-09-25" });
    assert.deepEqual(datePresetRange("30d", now), { from: "2026-08-27", to: "2026-09-25" });
    assert.deepEqual(datePresetRange("thisMonth", now), { from: "2026-09-01", to: "2026-09-25" });
    assert.deepEqual(datePresetRange("lastMonth", now), { from: "2026-08-01", to: "2026-08-31" });
    assert.deepEqual(datePresetRange("thisYear", now), { from: "2026-01-01", to: "2026-09-25" });
  });

  it("names a range that equals a preset", () => {
    assert.equal(matchDatePreset({ from: "2026-09-19", to: "2026-09-25" }, now), "7d");
    assert.equal(matchDatePreset({ from: "2026-09-18", to: "2026-09-25" }, now), null);
  });

  it("turns a day range into half-open and inclusive instants", () => {
    const bounds = dateRangeBounds({ from: "2026-09-01", to: "2026-09-02" });
    assert.equal(bounds.from, new Date(2026, 8, 1).toISOString());
    assert.equal(bounds.toExclusive, new Date(2026, 8, 3).toISOString());
    assert.equal(bounds.toInclusive, new Date(new Date(2026, 8, 3).getTime() - 1).toISOString());
    assert.deepEqual(dateRangeBounds({}), {});
  });
});

describe("client-side lists", () => {
  type Row = { name: string; tier: string; price: number | null; tags: string[]; active: boolean; created: string };
  const rows: Row[] = [
    { name: "Hoá đơn Pro", tier: "pro", price: 20, tags: ["a"], active: true, created: "2026-09-01T10:00:00" },
    { name: "Starter", tier: "free", price: null, tags: ["b"], active: false, created: "2026-08-01T10:00:00" },
    { name: "Team", tier: "pro", price: 10, tags: ["a", "b"], active: true, created: "2026-09-20T10:00:00" },
  ];
  const accessors = {
    search: (row: Row) => [row.name],
    filters: {
      tier: (row: Row) => row.tier,
      tags: (row: Row) => row.tags,
      active: (row: Row) => row.active,
      price: (row: Row) => row.price,
      created: (row: Row) => row.created,
    },
    sort: { name: (row: Row) => row.name, price: (row: Row) => row.price },
  };
  const base = { search: "", filters: {}, sort: { field: "name", direction: "asc" as const } };

  it("searches without diacritics", () => {
    const result = applyClientListState(rows, { ...base, search: "hoa don" }, accessors, matchesSearch);
    assert.deepEqual(result.map((r) => r.name), ["Hoá đơn Pro"]);
  });

  it("ANDs across properties and ORs within one", () => {
    const result = applyClientListState(
      rows,
      {
        ...base,
        filters: {
          tier: { kind: "enum", values: ["pro", "free"] },
          tags: { kind: "enum", values: ["b"] },
          active: { kind: "boolean", value: true },
        },
      },
      accessors,
      matchesSearch,
    );
    assert.deepEqual(result.map((r) => r.name), ["Team"]);
  });

  it("filters number and date ranges", () => {
    const byPrice = applyClientListState(
      rows,
      { ...base, filters: { price: { kind: "numberRange", min: 15 } } },
      accessors,
      matchesSearch,
    );
    assert.deepEqual(byPrice.map((r) => r.name), ["Hoá đơn Pro"]);
    const byDate = applyClientListState(
      rows,
      { ...base, filters: { created: { kind: "dateRange", from: "2026-09-01", to: "2026-09-01" } } },
      accessors,
      matchesSearch,
    );
    assert.deepEqual(byDate.map((r) => r.name), ["Hoá đơn Pro"]);
  });

  it("sorts with empty values last in both directions", () => {
    const asc = applyClientListState(rows, { ...base, sort: { field: "price", direction: "asc" } }, accessors, matchesSearch);
    assert.deepEqual(asc.map((r) => r.name), ["Team", "Hoá đơn Pro", "Starter"]);
    const desc = applyClientListState(rows, { ...base, sort: { field: "price", direction: "desc" } }, accessors, matchesSearch);
    assert.deepEqual(desc.map((r) => r.name), ["Hoá đơn Pro", "Team", "Starter"]);
  });

  it("groups in a fixed order and keeps the row order inside each group", () => {
    const groups = groupRows(rows, (row) => row.tier, ["free", "pro", "enterprise"], true);
    assert.deepEqual(
      groups.map((group) => [group.key, group.rows.map((row) => row.name)]),
      [
        ["free", ["Starter"]],
        ["pro", ["Hoá đơn Pro", "Team"]],
        ["enterprise", []],
      ],
    );
  });

  it("clamps a page past the end", () => {
    const page = paginateRows(rows, 9, 2);
    assert.equal(page.page, 2);
    assert.equal(page.pageCount, 2);
    assert.deepEqual(page.rows.map((r) => r.name), ["Team"]);
  });
});

describe("search text", () => {
  it("folds Vietnamese tone-mark placements and đ", () => {
    assert.equal(normalizeSearchText("Hoá Đơn"), "hoa don");
    assert.equal(normalizeSearchText("hóa đơn"), "hoa don");
  });

  it("ranks exact over prefix over substring", () => {
    assert.ok(matchScore("plans", "Plans") > matchScore("plan", "Plans & pricing"));
    assert.ok(matchScore("plan", "Plans & pricing") > matchScore("pricing", "Plans & pricing"));
    assert.ok(matchScore("rici", "Plans & pricing") > 0);
    assert.equal(matchScore("xyz", "Plans & pricing"), 0);
  });

  it("recognises a GUID", () => {
    assert.equal(looksLikeGuid("0f8fad5b-d9cb-469f-a165-70867728950e"), true);
    assert.equal(looksLikeGuid("INV-2026-0001"), false);
  });
});
