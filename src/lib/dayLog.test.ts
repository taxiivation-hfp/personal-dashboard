import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByDay, firstLine, type LogEntry } from "./dayLog.ts";

const e = (over: Partial<LogEntry>): LogEntry => ({
  kind: "gym",
  id: 1,
  date: "2026-08-12",
  title: null,
  body: null,
  meta: null,
  ...over,
});

test("days come back newest first", () => {
  const days = groupByDay([
    e({ date: "2026-08-10" }),
    e({ date: "2026-08-14" }),
    e({ date: "2026-08-12" }),
  ]);
  assert.deepEqual(
    days.map((d) => d.date),
    ["2026-08-14", "2026-08-12", "2026-08-10"],
  );
});

test("within a day the journal leads and drift reasons trail", () => {
  // The journal is about the day as a whole; a drift reason is a footnote to one block of
  // it. If this order ever inverts, the scroll opens every day on an explanation.
  const day = groupByDay([
    e({ kind: "drift", title: "Mandarin" }),
    e({ kind: "reading", title: "Deep Work, ch. 2" }),
    e({ kind: "skill", title: "Piano" }),
    e({ kind: "journal", title: "A long Tuesday" }),
    e({ kind: "gym", title: "Push" }),
    e({ kind: "outreach", title: "Messaged Sam" }),
  ])[0];
  assert.deepEqual(
    day.entries.map((x) => x.kind),
    ["journal", "gym", "skill", "outreach", "reading", "drift"],
  );
});

test("two sessions of one kind keep the order they were written", () => {
  const day = groupByDay([
    e({ kind: "gym", id: 9, title: "Evening" }),
    e({ kind: "gym", id: 4, title: "Morning" }),
  ])[0];
  assert.deepEqual(
    day.entries.map((x) => x.title),
    ["Morning", "Evening"],
  );
});

test("a day with nothing written does not appear at all", () => {
  // Empty days are omitted rather than returned blank: a scroll that says "you wrote
  // nothing" fourteen times for every once it says something is a scroll that draws
  // absence as a result, which this app does not do anywhere else either.
  assert.deepEqual(groupByDay([]), []);
});

test("firstLine skips blank leading lines and never invents a title", () => {
  assert.equal(firstLine("\n\n  Push day  \n3x5"), "Push day");
  assert.equal(firstLine(""), null);
  assert.equal(firstLine(null), null);
  assert.equal(firstLine("   \n  \n"), null);
});
