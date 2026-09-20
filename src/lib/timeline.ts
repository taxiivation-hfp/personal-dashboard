// THE TIMELINE'S CALENDAR — which months exist, and how they group into terms and breaks.
//
// PURE and import-free, so it runs under `node --test` on the same terms as rings.ts,
// goals.ts and dates.ts. The screen (Timeline.tsx) draws what this file derives; the two
// editable texts — a month's note and a group's name — are stored overrides that sit ON
// TOP of these defaults, never inside them.
//
// The shape is the owner's academic year, stated 2026-09-03:
//
//   Jul–Nov  term        Nov–Feb  summer break
//   Feb–Jun  term        Jun–Jul  winter break     …and repeat.
//
// TERM NUMBERS INCREMENT, the owner's ruling in the same breath: Jul 2025 opens Term 3,
// Feb 2026 is Term 4, Jul 2026 is Term 5 — two terms a year, forever. The break names
// repeat as they are. All of these are only DEFAULTS: every group name is editable in
// place on the timeline, and a stored name wins (see timeline_groups).
//
// Adjacent groups SHARE their boundary month — November both ends Term 3 and starts the
// summer break — and the brackets alternate above and below the line, which is what keeps
// two brackets meeting on one circle from colliding. Terms sit above, breaks below; since
// the cycle strictly alternates term/break, the alternation falls out of the kind.

/** Where the timeline begins. Fixed, not rolling: the record starts where it started. */
export const TIMELINE_START = "2025-07";

/**
 * How many months past the current one the timeline extends — the rolling future the
 * vision board needs. The owner's pick of 12 (2026-09-03), RAISED TO 24 on 2026-09-20 when
 * the career roadmap landed: its PR deadlines run to the ACS skills assessment in Jul 2028,
 * and a month note is keyed by a month, so a horizon at Sep 2027 would have left the last
 * and highest-stakes year of the plan as rows pointing at circles the canvas never drew.
 */
export const MONTHS_AHEAD = 24;

export type TimelineGroup = {
  /** The group's IDENTITY — its canonical first month, uncut by any range clipping. It is
   *  what a stored name in timeline_groups is keyed by, so a group half off the visible
   *  edge still answers to the name the owner gave it. */
  key: string;
  /** First VISIBLE month of the span, 'YYYY-MM' — the canonical start, clipped to range. */
  start: string;
  /** Last month of the span, inclusive. Shared with the next group's start. */
  end: string;
  /** The DEFAULT name; a row in timeline_groups overrides it. */
  label: string;
  /** Which side of the line the bracket draws on. Terms up, breaks down. */
  side: "up" | "down";
};

const pad = (n: number) => String(n).padStart(2, "0");
const ym = (y: number, m: number) => `${y}-${pad(m)}`;

/** 'YYYY-MM' + n months, positive or negative. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = (y ?? 0) * 12 + ((m ?? 1) - 1) + n;
  return ym(Math.floor(t / 12), (((t % 12) + 12) % 12) + 1);
}

/**
 * Every month the timeline shows, oldest first: TIMELINE_START through the month `today`
 * falls in plus MONTHS_AHEAD. Derived from the day being lived rather than stored, so the
 * future edge rolls forward on its own and never needs maintenance.
 */
export function timelineMonths(today: string): string[] {
  const last = addMonths(today.slice(0, 7), MONTHS_AHEAD);
  const out: string[] = [];
  let cur = TIMELINE_START;
  // The guard is arithmetic, not paranoia: a `today` before the start must still yield
  // the start month rather than an empty timeline.
  while (cur <= last || out.length === 0) {
    out.push(cur);
    if (cur === last && out.length > 0) break;
    cur = addMonths(cur, 1);
    if (out.length > 1200) break; // a century of months means the inputs are garbage
  }
  return out;
}

/**
 * The groups covering [first..last], CLIPPED to that range: a group reaching past the
 * timeline's rolling edge ends its bracket on the last visible month and grows back as
 * the months roll in. A group clipped down to a single month is dropped — a bracket over
 * one circle is a hat, not a span.
 */
export function timelineGroups(months: string[]): TimelineGroup[] {
  if (months.length === 0) return [];
  const first = months[0]!;
  const last = months[months.length - 1]!;

  const out: TimelineGroup[] = [];
  // Walk academic years from the July at or before `first`. Term numbers are anchored to
  // the owner's real course — Jul 2025 = Term 3 — so they are derived from the year, not
  // counted from wherever the visible range happens to begin.
  const firstYear = Number(first.slice(0, 4)) - 1;
  const lastYear = Number(last.slice(0, 4)) + 1;
  for (let y = firstYear; y <= lastYear; y++) {
    const july = 3 + 2 * (y - 2025);
    const feb = 4 + 2 * (y - 2025); // February of year y+1
    const cycle: Omit<TimelineGroup, "key">[] = [
      { start: ym(y, 7), end: ym(y, 11), label: `Term ${july}`, side: "up" },
      { start: ym(y, 11), end: ym(y + 1, 2), label: "Summer break", side: "down" },
      { start: ym(y + 1, 2), end: ym(y + 1, 6), label: `Term ${feb}`, side: "up" },
      { start: ym(y + 1, 6), end: ym(y + 1, 7), label: "Winter break", side: "down" },
    ];
    for (const g of cycle) {
      const start = g.start < first ? first : g.start;
      const end = g.end > last ? last : g.end;
      if (start >= end) continue; // outside the range, or clipped to one month
      out.push({ ...g, key: g.start, start, end });
    }
  }
  return out;
}

// ------------------------------------------------------------------ THE CANVAS
//
// The timeline is a PAN-AND-ZOOM CANVAS, not a scrolling strip — the owner's revision,
// 2026-09-03: "scrolling should let us zoom; it should be like a whole canvas". The
// screen holds one view {x, y, s} — a translate and a scale applied to the WORLD, whose
// coordinates are the ones every stored position is written in (px from a fixed origin
// at Jul 2025, and from the world's top). The maths below is pure so the two rules that
// make a canvas feel right — zoom about the cursor, and never lose the content — are
// pinned by tests rather than eyeballed.

/** One month's horizontal allotment in world px. The strip's whole geometry hangs off it. */
export const MONTH_W = 170;
/** Leading/trailing room before the first and after the last circle. */
export const PAD = 100;
/** A floating window's width, world px — also what the drag clamp keeps inside the world. */
export const CARD_W = 224;
/** The world's height. FIXED, not the viewport's: a stored y must mean the same place on
 *  every screen, and the line sits at LINE_Y so windows can float above OR below it. */
export const WORLD_H = 1000;
export const LINE_Y = 500;
/** Zoom range. The floor is chosen so two years of months fit a laptop width; the ceiling
 *  is where a card's type is already twice its size and more is only blur. */
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 2.5;

export type View = { x: number; y: number; s: number };

/** The world's width for a given number of months. */
export const worldWidth = (months: number): number =>
  PAD * 2 + Math.max(0, months - 1) * MONTH_W;

/** Month index -> the x of its circle's centre, in world px. */
export const monthX = (index: number): number => PAD + Math.max(0, index) * MONTH_W;

/**
 * Zoom by `factor` ABOUT a viewport point (cx, cy) — the point under the cursor stays
 * under the cursor, which is the one property that makes wheel-zoom feel like handling
 * the thing rather than watching it slide. Scale clamps to the range; at the limits the
 * view is returned unchanged rather than drifting under a factor that can no longer apply.
 */
export function zoomAbout(v: View, cx: number, cy: number, factor: number): View {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * factor));
  if (s === v.s) return v;
  // The world point under the cursor, then the translate that puts it back there.
  const wx = (cx - v.x) / v.s;
  const wy = (cy - v.y) / v.s;
  return { x: cx - wx * s, y: cy - wy * s, s };
}

/**
 * Keep the world in reach. A canvas may be pushed about freely, but never so far that
 * nothing of it is left on screen — the translate is clamped so the world's box always
 * overlaps the viewport, with `slack` (a fraction of the viewport) of room past each
 * edge. When the scaled world is smaller than the viewport the same rule lets it sit
 * anywhere inside, slack included, rather than pinning it to a corner.
 */
export function clampView(
  v: View,
  viewW: number,
  viewH: number,
  worldW: number,
  worldH: number,
  slack = 0.4,
): View {
  const sw = worldW * v.s;
  const sh = worldH * v.s;
  const sx = viewW * slack;
  const sy = viewH * slack;
  const x = Math.min(Math.max(v.x, Math.min(0, viewW - sw) - sx), Math.max(0, viewW - sw) + sx);
  const y = Math.min(Math.max(v.y, Math.min(0, viewH - sh) - sy), Math.max(0, viewH - sh) + sy);
  return x === v.x && y === v.y ? v : { x, y, s: v.s };
}

/** The view that shows world point (wx, wy) at the viewport's centre, at scale s. */
export const centreOn = (wx: number, wy: number, s: number, viewW: number, viewH: number): View => ({
  x: viewW / 2 - wx * s,
  y: viewH / 2 - wy * s,
  s,
});

// ------------------------------------------------------------ THE FLOATING WINDOWS
//
// Two kinds float over the line: a GOAL window (one of the board's own goals, placed
// here by choice — the timeline stores which and where, never a second copy) and a TEXT
// window (a few of the owner's words, with a tint). Both are rows of timeline_windows.

/**
 * A text window's tint, from a CURATED set — the pillar palette's eight hues mixed
 * 72% toward white, and never a free hex field (the /colours ruling). Every value is
 * measured: ink clears 4.5:1 on all of them by a wide margin (a test pins it), and each
 * is distinct from paper. MUTED text is deliberately never printed on a tint — it fails
 * 4.5:1 on anything tinted enough to read as a colour, so a text window's controls are
 * ink, and the swatch row carries no words at all.
 */
export const WINDOW_TINTS: { key: string; name: string; hex: string }[] = [
  { key: "moss", name: "Moss", hex: "#cbdad6" },
  { key: "olive", name: "Olive", hex: "#d6dacb" },
  { key: "clay", name: "Clay", hex: "#dfd8c6" },
  { key: "rust", name: "Rust", hex: "#e3d4cc" },
  { key: "plum", name: "Plum", hex: "#dbd1d8" },
  { key: "iris", name: "Iris", hex: "#d4d2e3" },
  { key: "slate", name: "Slate", hex: "#d1d6da" },
  { key: "teal", name: "Teal", hex: "#c9dbdb" },
];

export const isWindowTint = (key: string): boolean =>
  WINDOW_TINTS.some((t) => t.key === key);

export const tintHex = (key: string | null): string | null =>
  key == null ? null : (WINDOW_TINTS.find((t) => t.key === key)?.hex ?? null);

/** How long a text window may run. A sticky note, not a page — pages live in the journal. */
export const WINDOW_TEXT_MAX = 500;
