import assert from "node:assert/strict";
import test from "node:test";

import { buildSummaryDocumentModel } from "../summary-document-model.ts";

const meta = { meetingTitle: "Sprint review", startedAt: "2026-09-18T09:00:00Z" };

const item = (text: string, atMs: number | null, alsoAtMs: number[] = []) => ({
  text,
  atMs,
  alsoAtMs,
});

test("sections keep their order and carry their moments, primary first", () => {
  const model = buildSummaryDocumentModel({
    meta,
    summary: {
      summary: "We agreed the release date.",
      sections: [
        { key: "decisions", title: "Decisions", items: [item("Ship on Friday", 72_000, [5000])] },
        {
          key: "actionItems",
          title: "Action items",
          items: [{ ...item("Write the notes", 130_000), owner: "Nhi" }],
        },
      ],
    },
    templateLabel: "General meeting",
  });

  assert.equal(model.overview, "We agreed the release date.");
  assert.equal(model.templateLabel, "General meeting");
  assert.deepEqual(
    model.sections.map((section) => section.title),
    ["Decisions", "Action items"],
  );
  // 1:12 is the moment a click jumps to, so it leads — sorting would promote the supporting turn.
  assert.deepEqual(model.sections[0].items[0].citations, ["1:12", "0:05"]);
  assert.equal(model.sections[1].items[0].owner, "Nhi");
  assert.deepEqual(model.sections[1].items[0].citations, ["2:10"]);
});

test("a point with no recorded moment cites nothing rather than a placeholder", () => {
  const model = buildSummaryDocumentModel({
    meta,
    summary: {
      summary: "",
      sections: [{ key: "decisions", title: "Decisions", items: [item("Ship on Friday", null)] }],
    },
  });

  assert.deepEqual(model.sections[0].items[0].citations, []);
});

test("a repeated moment is cited once", () => {
  const model = buildSummaryDocumentModel({
    meta,
    summary: {
      summary: "",
      sections: [
        { key: "decisions", title: "Decisions", items: [item("Ship", 72_000, [72_000, 90_000])] },
      ],
    },
  });

  assert.deepEqual(model.sections[0].items[0].citations, ["1:12", "1:30"]);
});

test("the traceable narrative replaces the overview instead of printing beside it", () => {
  const model = buildSummaryDocumentModel({
    meta,
    summary: {
      summary: "The team talked about the release.",
      sections: [
        {
          key: "narrative",
          title: "What happened",
          items: [item("The team talked about the release.", 1000)],
        },
      ],
    },
  });

  assert.equal(model.overview, null);
  assert.equal(model.sections[0].key, "narrative");
});

test("a reader's own rendering says so; the published one does not", () => {
  const summary = { summary: "Overview", sections: [] };

  assert.equal(
    buildSummaryDocumentModel({ meta, summary, isPersonalRendering: true }).isPersonalRendering,
    true,
  );
  assert.equal(
    buildSummaryDocumentModel({ meta, summary }).isPersonalRendering,
    false,
  );
});

test("an insufficient-data summary carries the sentence the rail shows, and only then", () => {
  const withMessage = buildSummaryDocumentModel({
    meta,
    summary: { summary: "", insufficientData: true },
    insufficientDataMessage: "There was not enough in this meeting to summarise.",
  });
  assert.equal(
    withMessage.insufficientDataMessage,
    "There was not enough in this meeting to summarise.",
  );

  const ordinary = buildSummaryDocumentModel({
    meta,
    summary: { summary: "Overview" },
    insufficientDataMessage: "There was not enough in this meeting to summarise.",
  });
  assert.equal(ordinary.insufficientDataMessage, null);
});

test("no summary at all still produces a document shell rather than throwing", () => {
  const model = buildSummaryDocumentModel({ meta, summary: null });
  assert.equal(model.overview, null);
  assert.deepEqual(model.sections, []);
  assert.equal(model.meta.meetingTitle, "Sprint review");
});
