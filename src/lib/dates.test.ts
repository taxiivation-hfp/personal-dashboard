import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays } from "./dates.ts";

test("harness runs and addDays works", () => {
  assert.equal(addDays("2026-08-05", -13), "2026-07-23");
});
