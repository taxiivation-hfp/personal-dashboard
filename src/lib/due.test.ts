import { test } from "node:test";
import assert from "node:assert/strict";
import { dueTone } from "./due.ts";

const D = "2026-10-15";

test("due today is red, and so is anything already late", () => {
  assert.equal(dueTone(D, D), "var(--color-due-0)");
  assert.equal(dueTone("2026-10-13", D), "var(--color-due-0)");
  // A week late is the same red as today: lateness is a fact the line states; the hue only
  // says "now".
  assert.equal(dueTone("2026-10-08", D), "var(--color-due-0)");
});

test("tomorrow and two days out sit between red and yellow", () => {
  assert.equal(dueTone("2026-10-16", D), "var(--color-due-1)");
  assert.equal(dueTone("2026-10-17", D), "var(--color-due-2)");
});

test("three days out is yellow", () => {
  assert.equal(dueTone("2026-10-18", D), "var(--color-due-3)");
});

test("four days and beyond keep the default ink", () => {
  assert.equal(dueTone("2026-10-19", D), null);
  assert.equal(dueTone("2026-10-22", D), null);
});

test("the hue follows the day being viewed, not the real today", () => {
  // Stepping back to the 12th, a card due on the 15th is three days out again.
  assert.equal(dueTone(D, "2026-10-12"), "var(--color-due-3)");
});
