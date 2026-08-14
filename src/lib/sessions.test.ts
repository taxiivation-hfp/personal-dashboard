import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEARCH_PAGE,
  searchSession,
  sessionTitle,
  splitSession,
} from "./sessions.ts";

const doc = (note: string | null, title: string | null = null) => ({ title, note });

// ---------------------------------------------------------------- the heading

test("the first line is the title, and the rest is the body", () => {
  const s = splitSession(doc("Push Day A\nBench 3x8 @ 60\nOHP 3x10 @ 30"));
  assert.equal(s.title, "Push Day A");
  assert.equal(s.body, "Bench 3x8 @ 60\nOHP 3x10 @ 30");
});

// The line breaks ARE the log. A blank line between exercises is the owner's own spacing and
// reflowing it would rewrite the document on the way to the screen.
test("interior blank lines survive untouched", () => {
  const s = splitSession(doc("Legs\nSquat 5x5\n\nRDL 3x10\n\n\nCalves"));
  assert.equal(s.body, "Squat 5x5\n\nRDL 3x10\n\n\nCalves");
});

test("blank lines under the title are spacing, and are dropped with it", () => {
  assert.equal(splitSession(doc("Pull Day\n\n\nRows 4x8")).body, "Rows 4x8");
});

test("a note opening on blank lines still finds its title", () => {
  const s = splitSession(doc("\n\n  Chest  \nFlyes 3x12"));
  assert.equal(s.title, "Chest", "trimmed, and never an empty heading");
  assert.equal(s.body, "Flyes 3x12");
});

// The rescued Discord history arrived with a title in its own COLUMN, alongside a note that
// is entirely training. Promoting its first line as well would eat a real set out of the body.
test("a STORED title wins and leaves its note whole", () => {
  const s = splitSession(doc("Bench 3x8 @ 60\nOHP 3x10", "Imported session"));
  assert.equal(s.title, "Imported session");
  assert.equal(s.body, "Bench 3x8 @ 60\nOHP 3x10", "not one line lighter");
});

test("a blank stored title is no title at all, so the note supplies one", () => {
  assert.equal(splitSession(doc("Legs\nSquat", "   ")).title, "Legs");
});

test("an empty session has no title and no body", () => {
  for (const n of [null, "", "   ", "\n\n"]) {
    const s = splitSession(doc(n));
    assert.equal(s.title, null, JSON.stringify(n));
    assert.equal(s.body, "");
  }
});

test("a one-line session is all title and no body", () => {
  const s = splitSession(doc("Easy 5k"));
  assert.equal(s.title, "Easy 5k");
  assert.equal(s.body, "");
});

test("sessionTitle is the split's title and nothing else", () => {
  assert.equal(sessionTitle(doc("Push Day A\nBench")), "Push Day A");
  assert.equal(sessionTitle(doc(null)), null);
});

// The property the whole "derived, never stored" argument rests on: reading a session must
// not be able to lose any of it.
test("title and body together hold every non-spacing line of the note", () => {
  const note = "Push Day A\n\nBench 3x8\n\nOHP 3x10\nFlyes 3x12";
  const s = splitSession(doc(note));
  const kept = [s.title, ...s.body.split("\n")].filter((l) => l && l.trim());
  const original = note.split("\n").filter((l) => l.trim());
  assert.deepEqual(kept, original);
});

// ---------------------------------------------------------------- searching

test("an empty query matches nothing, rather than everything", () => {
  for (const q of ["", "   "]) {
    assert.equal(searchSession(doc("Bench 3x8"), q), null);
  }
});

test("a hit returns the matching lines, with their real line numbers", () => {
  const hit = searchSession(
    doc("Push Day A\nBench 3x8 @ 60\nOHP 3x10\nIncline bench 3x10"),
    "bench",
  );
  assert.ok(hit);
  assert.equal(hit.titleHit, false);
  assert.deepEqual(
    hit.lines.map((l) => l.n),
    [2, 4],
    "counted over the whole note, title line included",
  );
  assert.equal(hit.lines[0]!.text, "Bench 3x8 @ 60");
});

test("case is ignored in both directions", () => {
  assert.ok(searchSession(doc("Legs\nSQUAT 5x5"), "squat"));
  assert.ok(searchSession(doc("Legs\nsquat 5x5"), "SQUAT"));
});

test("a query is a PHRASE, not a bag of words", () => {
  const s = doc("Push\nIncline DB press\nFlat bench");
  assert.ok(searchSession(s, "incline db"), "the phrase is there");
  assert.equal(
    searchSession(s, "incline bench"),
    null,
    "two words ten lines apart are not a match",
  );
});

test("the title matching is a hit even when no body line does", () => {
  const hit = searchSession(doc("Leg Day\nSquat 5x5"), "leg day");
  assert.ok(hit);
  assert.equal(hit.titleHit, true);
  assert.deepEqual(hit.lines, [], "nothing in the body to point at");
});

// The derived title is drawn as the heading, so listing it again as a body line would show
// the same text twice in one result.
test("the derived title line is not repeated among the body lines", () => {
  const hit = searchSession(doc("Bench Day\nBench 3x8"), "bench");
  assert.ok(hit);
  assert.equal(hit.titleHit, true);
  assert.deepEqual(hit.lines.map((l) => l.n), [2]);
});

// A stored title is not in the note, so nothing in the note may be skipped on its account.
test("with a stored title, the note's first line is still searchable", () => {
  const hit = searchSession(doc("Bench 3x8\nOHP 3x10", "Imported"), "bench");
  assert.ok(hit);
  assert.deepEqual(hit.lines.map((l) => l.n), [1]);
});

test("blank lines never match, whatever the query", () => {
  const hit = searchSession(doc("Legs\nSquat\n\n   \nRDL"), "s");
  assert.ok(hit);
  assert.ok(hit.lines.every((l) => l.text.trim() !== ""));
});

test("no match anywhere is null, not an empty hit", () => {
  assert.equal(searchSession(doc("Legs\nSquat 5x5"), "deadlift"), null);
  assert.equal(searchSession(doc(null), "anything"), null);
});

test("the search page size is a round screenful", () => {
  assert.equal(SEARCH_PAGE, 10);
  assert.ok(Number.isInteger(SEARCH_PAGE) && SEARCH_PAGE > 0);
});
