import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  timelineMonths,
  timelineGroups,
  TIMELINE_START,
  MONTHS_AHEAD,
} from "./timeline.ts";

test("addMonths walks forward across a year boundary", () => {
  assert.equal(addMonths("2025-11", 3), "2026-02");
});

test("addMonths walks backward across a year boundary", () => {
  assert.equal(addMonths("2026-02", -3), "2025-11");
});

test("addMonths by twelve is the same month next year", () => {
  assert.equal(addMonths("2025-07", 12), "2026-07");
});

test("months run from the fixed start to a rolling horizon", () => {
  const months = timelineMonths("2026-09-03");
  assert.equal(months[0], TIMELINE_START);
  assert.equal(months[months.length - 1], addMonths("2026-09", MONTHS_AHEAD));
  // Jul 2025 .. the horizon, inclusive at both ends. Counted from the constants rather
  // than written down, so raising MONTHS_AHEAD (12 -> 24 on 2026-09-20) moves it here too.
  const toViewedMonth = 15; // Jul 2025 .. Sep 2026, inclusive
  assert.equal(months.length, toViewedMonth + MONTHS_AHEAD);
});

test("months are contiguous and ascending", () => {
  const months = timelineMonths("2026-09-03");
  for (let i = 1; i < months.length; i++) {
    assert.equal(months[i], addMonths(months[i - 1]!, 1));
  }
});

test("the first academic year groups as term 3, summer, term 4, winter", () => {
  const groups = timelineGroups(timelineMonths("2026-09-03"));
  const [a, b, c, d] = groups;
  assert.deepEqual(
    [a, b, c, d].map((g) => [g!.start, g!.end, g!.label, g!.side]),
    [
      ["2025-07", "2025-11", "Term 3", "up"],
      ["2025-11", "2026-02", "Summer break", "down"],
      ["2026-02", "2026-06", "Term 4", "up"],
      ["2026-06", "2026-07", "Winter break", "down"],
    ],
  );
});

test("term numbers increment across years — the owner's ruling", () => {
  const groups = timelineGroups(timelineMonths("2027-09-01"));
  const terms = groups.filter((g) => g.label.startsWith("Term "));
  // The anchors the ruling names by hand: Jul 2025 opens Term 3, Feb 2026 is Term 4,
  // Jul 2026 is Term 5 — two a year, forever.
  assert.deepEqual(terms.slice(0, 5).map((g) => [g.start, g.label]), [
    ["2025-07", "Term 3"],
    ["2026-02", "Term 4"],
    ["2026-07", "Term 5"],
    ["2027-02", "Term 6"],
    ["2027-07", "Term 7"],
  ]);
  // Past those, the run is asserted as a RUN rather than a fixed list: HOW MANY terms are
  // visible is a function of MONTHS_AHEAD, which is a dial (12 -> 24 on 2026-09-20), and a
  // test that pins the dial's current setting fails every time it is turned.
  assert.ok(terms.length > 5);
  terms.forEach((g, i) => assert.equal(g.label, `Term ${3 + i}`));
});

test("adjacent groups share their boundary month", () => {
  const groups = timelineGroups(timelineMonths("2026-09-03"));
  for (let i = 1; i < groups.length; i++) {
    assert.equal(groups[i]!.start, groups[i - 1]!.end);
  }
});

test("brackets strictly alternate up and down", () => {
  const groups = timelineGroups(timelineMonths("2026-09-03"));
  for (let i = 1; i < groups.length; i++) {
    assert.notEqual(groups[i]!.side, groups[i - 1]!.side);
  }
});

test("a group reaching past the rolling edge is clipped, keeps its identity", () => {
  // Written against MONTHS_AHEAD rather than the month it currently lands on, so raising
  // the horizon (12 -> 24 on 2026-09-20) retunes the dial without rewriting the test.
  const months = timelineMonths("2026-09-03");
  const edge = addMonths("2026-09", MONTHS_AHEAD);
  const groups = timelineGroups(months);
  const lastGroup = groups[groups.length - 1]!;
  assert.equal(lastGroup.end, edge);
  // The edge falls in September, so the group covering it is the July term of that year.
  const july = `${edge.slice(0, 4)}-07`;
  assert.equal(lastGroup.start, july);
  assert.equal(lastGroup.key, july);
  assert.equal(
    lastGroup.label,
    `Term ${3 + 2 * (Number(edge.slice(0, 4)) - 2025)}`,
  );
});

test("a group clipped to a single month is dropped", () => {
  // Range ending exactly on a boundary month: the next group would span one circle.
  const months: string[] = [];
  let cur = "2025-07";
  while (cur <= "2025-11") {
    months.push(cur);
    cur = addMonths(cur, 1);
  }
  const groups = timelineGroups(months);
  assert.deepEqual(
    groups.map((g) => g.label),
    ["Term 3"],
  );
});

// --- the canvas ------------------------------------------------------------------------

import {
  zoomAbout,
  clampView,
  centreOn,
  worldWidth,
  monthX,
  MIN_SCALE,
  MAX_SCALE,
  WINDOW_TINTS,
  isWindowTint,
  tintHex,
  PAD,
  MONTH_W,
} from "./timeline.ts";

test("zooming about a point keeps that point fixed on screen", () => {
  const v = { x: -300, y: 40, s: 1 };
  const [cx, cy] = [512, 300];
  const wx = (cx - v.x) / v.s;
  const wy = (cy - v.y) / v.s;
  const z = zoomAbout(v, cx, cy, 1.5);
  assert.equal(z.s, 1.5);
  // The same world point, projected through the new view, lands where the cursor was.
  assert.ok(Math.abs(wx * z.s + z.x - cx) < 1e-9);
  assert.ok(Math.abs(wy * z.s + z.y - cy) < 1e-9);
});

test("zoom clamps to its range and is the identity at a limit", () => {
  const v = { x: 0, y: 0, s: MAX_SCALE };
  assert.equal(zoomAbout(v, 10, 10, 2), v);
  const small = zoomAbout({ x: 0, y: 0, s: 1 }, 10, 10, 0.0001);
  assert.equal(small.s, MIN_SCALE);
  assert.equal(zoomAbout(small, 10, 10, 0.5), small);
});

test("clampView never lets the world leave the viewport", () => {
  const worldW = 4000;
  const worldH = 1000;
  // Pushed miles to the left: the world's right edge must still be within slack of
  // the viewport's left edge.
  const far = clampView({ x: -100000, y: 0, s: 1 }, 1000, 800, worldW, worldH);
  assert.equal(far.x, 1000 - worldW - 400);
  // Pushed miles to the right.
  const back = clampView({ x: 100000, y: 0, s: 1 }, 1000, 800, worldW, worldH);
  assert.equal(back.x, 400);
  // A view already in range is returned as the same object — no churn per frame.
  const ok = { x: -500, y: -50, s: 1 };
  assert.equal(clampView(ok, 1000, 800, worldW, worldH), ok);
});

test("clampView lets a world smaller than the viewport float inside it", () => {
  // At 0.3 the 4000px world is 1200px; in a 2000px viewport it may sit anywhere from
  // -slack to (2000 - 1200) + slack.
  const s = 0.3;
  const left = clampView({ x: -5000, y: 0, s }, 2000, 800, 4000, 1000);
  assert.equal(left.x, -800);
  const right = clampView({ x: 5000, y: 0, s }, 2000, 800, 4000, 1000);
  assert.equal(right.x, 800 + 800);
});

test("centreOn puts the world point at the viewport's centre", () => {
  const v = centreOn(1000, 500, 1.2, 800, 600);
  assert.ok(Math.abs(1000 * v.s + v.x - 400) < 1e-9);
  assert.ok(Math.abs(500 * v.s + v.y - 300) < 1e-9);
});

test("world geometry hangs off the month allotment", () => {
  assert.equal(worldWidth(1), PAD * 2);
  assert.equal(worldWidth(27), PAD * 2 + 26 * MONTH_W);
  assert.equal(monthX(0), PAD);
  assert.equal(monthX(3), PAD + 3 * MONTH_W);
});

// The window tints are certified the way the pillar palette is in eventColor.test.ts:
// recomputed here so a value retuned by eye cannot rot silently.
const srgbToLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * srgbToLinear(((n >> 16) & 255) / 255) +
    0.7152 * srgbToLinear(((n >> 8) & 255) / 255) +
    0.0722 * srgbToLinear((n & 255) / 255)
  );
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const INK = "#23201b"; // --color-ink, kept in step with globals.css by hand
const PAPER = "#fdfbf6"; // --paper

test("ink is body-text legible on every window tint", () => {
  for (const t of WINDOW_TINTS) {
    assert.ok(contrast(INK, t.hex) >= 4.5, `${t.name} is ${contrast(INK, t.hex).toFixed(2)}`);
  }
});

test("every window tint is visibly a tint against paper", () => {
  for (const t of WINDOW_TINTS) {
    assert.ok(contrast(PAPER, t.hex) >= 1.3, `${t.name} is ${contrast(PAPER, t.hex).toFixed(3)} vs paper`);
  }
});

test("tint keys are unique, looked up, and refused when unknown", () => {
  assert.equal(new Set(WINDOW_TINTS.map((t) => t.key)).size, WINDOW_TINTS.length);
  assert.equal(isWindowTint("moss"), true);
  assert.equal(isWindowTint("#cbdad6"), false);
  assert.equal(tintHex("moss"), "#cbdad6");
  assert.equal(tintHex(null), null);
  assert.equal(tintHex("neon"), null);
});

import {
  monthAtX,
  monthOfLegacyWindow,
  CARD_W,
  timelineYears,
  bubbleLayout,
  bubbleRadius,
  pushTargets,
  goalMonths,
  noteInMonth,
} from "./timeline.ts";

test("monthAtX inverts monthX, rounds to nearest, and clamps to the range", () => {
  const today = "2026-10-29";
  assert.equal(monthAtX(monthX(0), today), "2025-07");
  assert.equal(monthAtX(monthX(5), today), "2025-12");
  assert.equal(monthAtX(monthX(5) + 80, today), "2025-12");
  assert.equal(monthAtX(monthX(5) + 90, today), "2026-01");
  assert.equal(monthAtX(-500, today), "2025-07");
  assert.equal(monthAtX(1e9, today), addMonths("2026-10", MONTHS_AHEAD));
  // stable across days: a mid-range x does not depend on today
  assert.equal(monthAtX(monthX(9), "2026-09-01"), monthAtX(monthX(9), "2027-03-01"));
});

test("a legacy window's month is read from the card's centre, not its left edge", () => {
  const today = "2026-10-29";
  // a card whose centre sits exactly over Dec 2025 has its left edge CARD_W/2 before it
  assert.equal(monthOfLegacyWindow(monthX(5) - CARD_W / 2, today), "2025-12");
  // the raw left edge would have pulled it a month early (112 > MONTH_W / 2)
  assert.equal(monthAtX(monthX(5) - CARD_W / 2, today), "2025-11");
});

test("timelineYears spans the earliest data year to next year", () => {
  assert.deepEqual(timelineYears("2026-10-29", []), [2026, 2027]);
  assert.deepEqual(timelineYears("2026-10-29", ["2025-07", "2026-02"]), [2025, 2026, 2027]);
  assert.deepEqual(timelineYears("2026-10-29", ["2029-01"]), [2026, 2027]);
});

test("bubbleLayout follows the mockup geometry", () => {
  const l = bubbleLayout([2026, 2027]);
  assert.equal(l.slots.length, 24);
  assert.deepEqual(l.slots[0], { month: "2026-01", gx: 210, gy: 132 });
  assert.deepEqual(l.slots[5], { month: "2026-06", gx: 550, gy: 412 });
  assert.deepEqual(l.slots[12], { month: "2027-01", gx: 210, gy: 132 + 980 });
  assert.deepEqual(l.yearLabels, [{ year: 2026, top: 30 }, { year: 2027, top: 1010 }]);
  assert.equal(l.width, 1440);
  assert.equal(l.height, 1960);
});

test("bubbleRadius: mockup sizes, gentle growth, capped", () => {
  assert.equal(bubbleRadius(0, false, false), 88);
  assert.equal(bubbleRadius(1, false, false), 96);
  assert.equal(bubbleRadius(2, false, false), 104);
  assert.equal(bubbleRadius(99, false, false), 118);
  assert.equal(bubbleRadius(3, true, false), 128);
  assert.equal(bubbleRadius(3, true, true), 215);
  assert.equal(bubbleRadius(0, false, true), 140);
  assert.equal(bubbleRadius(4, false, true), 175);
});

test("pushTargets leaves nodes alone without hover and pushes neighbours away with it", () => {
  const nodes = [
    { x: 0, y: 0, R: 160 },
    { x: 200, y: 0, R: 86 },
  ];
  assert.deepEqual(pushTargets(nodes, null), nodes);
  const t = pushTargets(nodes, 0);
  assert.deepEqual(t[0], nodes[0]);
  assert.ok(t[1]!.x >= 160 + 86 + 36);
  assert.equal(t[1]!.y, 0);
  assert.equal(nodes[1]!.x, 200); // input untouched
});

test("goalMonths: deadline plus every subgoal due; else completion, else now; dropped none", () => {
  const today = "2026-10-29";
  const g = (deadline: string | null, status: string, completedAt: string | null, dues: (string | null)[] = []) => ({
    deadline,
    status,
    completedAt,
    subgoals: dues.map((due) => ({ due })),
  });
  assert.deepEqual(goalMonths(g("2027-03-15", "active", null), today), ["2027-03"]);
  assert.deepEqual(goalMonths(g("2026-11-20", "active", null, ["2026-10-05", "2026-11-02", null]), today), ["2026-10", "2026-11"]);
  assert.deepEqual(goalMonths(g(null, "active", null, ["2026-12-01", "2026-09-01"]), today), ["2026-09", "2026-12"]);
  assert.deepEqual(goalMonths(g(null, "done", "2026-08-02"), today), ["2026-08"]);
  assert.deepEqual(goalMonths(g(null, "active", null, [null]), today), ["2026-10"]);
  assert.deepEqual(goalMonths(g("2027-03-15", "dropped", null, ["2026-10-05"]), today), []);
});

test("noteInMonth: all months, or only the ticked ones", () => {
  assert.equal(noteInMonth({ months: ["2026-10"], allMonths: false }, "2026-10"), true);
  assert.equal(noteInMonth({ months: ["2026-10"], allMonths: false }, "2026-11"), false);
  assert.equal(noteInMonth({ months: [], allMonths: true }, "2031-01"), true);
});
