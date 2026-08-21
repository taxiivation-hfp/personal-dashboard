import test from "node:test";
import assert from "node:assert/strict";
import { CALORIE_STREAK_FLOOR, streakEnding } from "./streaks.ts";

const days = (...d: string[]) => new Set(d);

test("counts consecutive earned days ending at the anchor", () => {
  assert.equal(
    streakEnding("2026-08-21", days("2026-08-19", "2026-08-20", "2026-08-21")),
    3,
  );
});

test("an unearned day before the anchor ends the run", () => {
  assert.equal(
    streakEnding("2026-08-21", days("2026-08-18", "2026-08-19", "2026-08-21")),
    1,
  );
});

test("no earned days is zero, not a walk through the whole calendar", () => {
  assert.equal(streakEnding("2026-08-21", days()), 0);
});

test("grace: a pending anchor is 'not yet', never a break", () => {
  const earned = days("2026-08-19", "2026-08-20");
  assert.equal(streakEnding("2026-08-21", earned, { grace: true }), 2);
  // Without grace the same day reads as a broken run — the past-day reading.
  assert.equal(streakEnding("2026-08-21", earned), 0);
});

test("grace applies to the anchor alone — an unearned yesterday still breaks", () => {
  assert.equal(
    streakEnding("2026-08-21", days("2026-08-18", "2026-08-19"), {
      grace: true,
    }),
    0,
  );
});

test("an earned anchor counts under grace exactly as without it", () => {
  const earned = days("2026-08-20", "2026-08-21");
  assert.equal(streakEnding("2026-08-21", earned, { grace: true }), 2);
  assert.equal(streakEnding("2026-08-21", earned), 2);
});

test("unscheduled days neither count nor break — the Sundays-only item", () => {
  // Sundays: 2026-08-09 and 2026-08-16 are Sundays; everything between is off-mask.
  const sundaysOnly = (d: string) =>
    new Date(`${d}T12:00:00Z`).getUTCDay() === 0;
  assert.equal(
    streakEnding("2026-08-16", days("2026-08-09", "2026-08-16"), {
      scheduledOn: sundaysOnly,
    }),
    2,
  );
});

test("an entry landing on an off day is skipped, not double-read", () => {
  const weekdaysOnly = (d: string) => {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    return wd !== 0 && wd !== 6;
  };
  // Fri 14th and Mon 17th earned, plus a stray Saturday tick — the run is 2, the
  // Saturday neither adding a third nor breaking the bridge it sits on.
  assert.equal(
    streakEnding("2026-08-17", days("2026-08-14", "2026-08-15", "2026-08-17"), {
      scheduledOn: weekdaysOnly,
    }),
    2,
  );
});

test("earned days after the anchor are ignored", () => {
  assert.equal(
    streakEnding("2026-08-20", days("2026-08-20", "2026-08-21")),
    1,
  );
});

test("a never-scheduled mask terminates at the earliest earned date", () => {
  assert.equal(
    streakEnding("2026-08-21", days("2020-01-01"), {
      scheduledOn: () => false,
    }),
    0,
  );
});

test("the food-log floor sits below the eating floor, and stays put", () => {
  // The streak asks "did you log the day", not "did you eat enough" — pinning it to the
  // 2,500 eating floor would give an honest under-day a reason not to be logged.
  assert.equal(CALORIE_STREAK_FLOOR, 2000);
});
