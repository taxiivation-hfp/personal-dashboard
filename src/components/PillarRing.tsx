"use client";

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { skillDefaultHex, METRICS } from "@/lib/rings";
import type { MetricRing, PillarRingView } from "@/lib/rings";
import type { PillarKey, SkillSlice } from "@/lib/queries";

/**
 * The lamp, on a ring's TRACK.
 *
 * The track is the OBJECT and the arc is the DATUM, and that distinction is the whole
 * licence for this. Lighting the track says the ring is a physical thing sitting under a
 * lamp and says nothing whatsoever about your day. A gradient on the ARC would encode a
 * value — a 25% day, drawn entirely in the lit upper arc, would look brighter than a 100%
 * day — which The One Lamp Rule forbids outright.
 *
 * It also strengthens The Legible-Empty Rule rather than eroding it. The lit face is exactly
 * today's --color-line-strong, unchanged; the shaded face is DARKER, never lighter, so every
 * point on every track is now at least as visible as before and the bottom is ~25% more so.
 *
 * Gated at 48px: a vertical gradient across an 18px metric ring is a <defs> nobody can see.
 */
const LIT_TRACK_MIN = 48;

/** Below this the track is flat. Above it, lit at the top and shaded at the foot. */
const trackStroke = (size: number, id: string) =>
  size >= LIT_TRACK_MIN ? `url(#${id})` : "var(--color-line-strong)";

/**
 * The gradient itself.
 *
 * userSpaceOnUse and an explicit y2, because objectBoundingBox on a stroked circle measures
 * the PATH's box and not the element's, which puts the falloff half a stroke out of step.
 *
 * The stops carry their colour in style, not as a stop-color attribute: var() is not
 * honoured inside an SVG presentation attribute, so the attribute form silently renders
 * black. It is the single likeliest way for this to be transcribed wrongly.
 */
function LitTrack({
  id,
  size,
  gradRef,
}: {
  id: string;
  size: number;
  /**
   * Handed out so a ROTATING ring can counter-rotate the gradient per frame.
   *
   * The lamp is at twelve o'clock and stays there — that is The One Lamp Rule's first
   * clause. A gradient referenced from inside a rotating group rotates with the group, so
   * without the counter-turn the lit face would sweep around the ring and the light would
   * read as attached to the object rather than to the room.
   */
  gradRef?: Ref<SVGLinearGradientElement>;
}) {
  return (
    <defs>
      <linearGradient
        ref={gradRef}
        id={id}
        gradientUnits="userSpaceOnUse"
        x1={0}
        y1={0}
        x2={0}
        y2={size}
      >
        <stop offset="0%" style={{ stopColor: "var(--color-line-strong)" }} />
        <stop offset="100%" style={{ stopColor: "var(--color-line-edge)" }} />
      </linearGradient>
    </defs>
  );
}

/**
 * One ring. Two species use it, and they MUST stay visually distinct — otherwise today's
 * adherence reads as one more quota to fill, and the quota rings borrow adherence's
 * authority:
 *
 *   adherence — 176px, amber, a fine 8px stroke, the numeral INSIDE
 *   pillar    — 48px and 28px, pillar-hued, thinner still, fact line BESIDE or BELOW
 *               (never a percentage)
 *
 * Size and hue separate them, not stroke weight: both are drawn as a line around
 * something rather than as a gauge, because a thick arc reads as a dashboard dial and
 * this app is emphatically not that. The strokes are caller-set, so the two species stay
 * one component and cannot drift apart in behaviour.
 *
 * Three ring states, and the third is what stops a first load reading as total failure:
 *   filled          fill > 0        a hued arc
 *   empty but live  fill === 0      faint track, no arc  ("0 of 8 days")
 *   ghost           fill === null   DASHED track, no arc ("no data source yet")
 *
 * `fill === null` never reaches the arc maths. JavaScript coerces null to 0, so a
 * compute-then-check would silently draw a 0% ring at 7am for a day that has not
 * happened yet — the exact mistake adherence.ts avoids by returning null rather than 0.
 */

const TONE: Record<PillarKey | "accent", string> = {
  accent: "var(--color-accent)",
  social_capital: "var(--color-social)",
  physical: "var(--color-physical)",
  portfolio: "var(--color-portfolio)",
};

/** An owner-chosen hue wins over the default. `color` is always from the curated
 *  palette — engine.setPillarColor refuses anything else. */
export const toneColor = (
  tone: PillarKey | "accent",
  color?: string | null,
): string => color ?? TONE[tone];

/**
 * How much bigger than the ring the bloom's box is.
 *
 * 1.24 is solved, not chosen. `.pillar-bloom` peaks at the 76% stop of `closest-side`, so the
 * peak lands at `size * 1.24 / 2 * 0.76 = size * 0.471` — which is the stroke's own radius at
 * every size the column solver produces. The light comes off the ring rather than sitting
 * behind it, which is the whole difference between a lamp and an achievement glow.
 */
const BLOOM_BOX = 1.24;
/**
 * Below this a ring gets no bloom.
 *
 * The same argument that gates the lit track at 48px: an annular gradient across an 18px
 * metric ring is 4px of tint nobody can resolve, and eight of them down a list is haze. The
 * bloom belongs to the donut a pillar is READ from, not to the row markers beside its facts.
 */
const BLOOM_MIN_SIZE = 48;

/** The lamp behind a pillar donut. Constant by construction — it takes a hue and a size and
 *  has no way to be told a value, which is what keeps The One Lamp Rule's second clause
 *  true here rather than merely intended. */
function PillarBloom({ size, hue }: { size: number; hue: string }) {
  if (size < BLOOM_MIN_SIZE) return null;
  const box = Math.round(size * BLOOM_BOX);
  return (
    <span
      aria-hidden
      className="pillar-bloom"
      style={
        {
          width: box,
          height: box,
          "--bloom-hue": hue,
        } as CSSProperties
      }
    />
  );
}

export default function Ring({
  fill,
  overdrive = null,
  size,
  stroke,
  tone,
  color = null,
  dashed = false,
  bloom = false,
  children,
}: {
  fill: number | null;
  /**
   * Work past the threshold, 0..1. Drawn as a second, lighter arc over the full ring.
   *
   * VISUAL ONLY — it never reaches the pillar mean. Extra effort is acknowledged where it
   * happened; it cannot paper over a metric that was neglected.
   */
  overdrive?: number | null;
  size: number;
  stroke: number;
  tone: PillarKey | "accent";
  /** Owner-chosen hue from the curated palette; falls back to the CSS default. */
  color?: string | null;
  /**
   * Draw the track DASHED — "there is no source for this yet".
   *
   * Explicit rather than inferred from `fill == null`, which used to imply it. That
   * conflated two different statements: the adherence ring passes null all morning to
   * mean "nothing is due yet", and it was being drawn in the same dashes the app uses for
   * "nothing is wired up". A morning with nothing due is not a missing data source, and on
   * the hero element that misread matters.
   */
  dashed?: boolean;
  /**
   * Draw the lamp's bloom behind this ring. The 176px adherence hero, and nothing else.
   *
   * A BOOLEAN, deliberately — it can be on or off and can never be given a value. A bloom
   * that brightened with the figure would turn marking a block into a reward, which is the
   * one thing the light layer may not do. See The One Lamp Rule in globals.css.
   *
   * Not given to the pillar donuts either: three coloured blooms would be three accents by
   * the back door, and a pillar ring that glowed as it filled is exactly the "full ring is
   * a win" reading CLAUDE.md forbids.
   */
  bloom?: boolean;
  children?: ReactNode;
}) {
  // Per instance: two rings on one page sharing a gradient id would have the second
  // silently inherit the first's geometry.
  const trackId = `lit-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // Guard clause, not a fallback expression: null must never enter the arithmetic.
  const ghost = fill == null;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = ghost ? 0 : c * Math.min(1, Math.max(0, fill));
  const over =
    ghost || overdrive == null ? 0 : c * Math.min(1, Math.max(0, overdrive));

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* First in DOM order so it paints beneath the arc without needing a z-index — the
          ring is drawn ON the lit ground, not over a lamp. */}
      {bloom && <span aria-hidden className="ring-bloom" />}
      <svg
        // POSITIONED, so DOM order decides paint order and the bloom lands underneath.
        // Without it the absolutely-positioned bloom paints in step 8 and this static
        // inline SVG in step 7 — i.e. the lamp over the ring, which is the opposite of the
        // comment above and of the whole idea. The ring is drawn ON the lit ground.
        className="relative"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <LitTrack id={trackId} size={size} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          // --color-line-strong, not --color-panel-2: the recessed surface token is
          // #efe9de against a #f2ede4 page, which is so close that an EMPTY ring reads as
          // nothing at all rather than as "a ring that isn't filled". An unfilled ring
          // must still be legible — that is the whole "neglected, not failed" signal.
          // At 48px and up it is the lamp's lit-to-shaded ramp, which starts at exactly
          // that colour and only ever gets darker.
          stroke={trackStroke(size, trackId)}
          strokeWidth={stroke}
          strokeDasharray={
            dashed
              ? `${Math.max(2, stroke)} ${Math.max(3, stroke * 1.6)}`
              : undefined
          }
        />
        {/* Mounted whenever there is a figure at all, NOT only when it is above zero.
            Behind `dash > 0` the first mark of the day — the one that lifts the figure off
            0 — mounted the circle instead of transitioning it, so the single most important
            travel in the app was the one that snapped. At dash 0 the arc is invisible
            anyway; the guard was buying nothing and costing that. */}
        {!ghost && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={toneColor(tone, color)}
            strokeWidth={stroke}
            // BUTT, never round: round caps add half a stroke width at each end, which
            // makes the smallest non-zero fills read as roughly half again their true
            // value. The ring would overstate exactly where honesty matters most.
            strokeLinecap="butt"
            strokeDasharray={`${dash} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="motion-arc"
          />
        )}
        {/* A second lap, translucent and inset, over an already-full ring. Reads as
            "past the minimum" without reading as "more is better" — it is the same fact
            the caption already states, made visible. */}
        {over > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={toneColor(tone, color)}
            strokeWidth={Math.max(1, stroke * 0.42)}
            strokeLinecap="butt"
            strokeDasharray={`${over} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="motion-arc"
            style={{ opacity: 0.45 }}
          />
        )}
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

/** One slice of a pillar's donut — or of any of its bands. */
export type RingSegment = {
  key: string;
  /** Names the slice at its arc. Optional now that bands exist whose slices are UNITS
   *  (one event, one outreach) rather than metrics — a six-slot band with six copies of
   *  "Events" around it would be noise, so the builders label one slot per band. */
  label?: string;
  /** 0..1, or null for a metric with no source. */
  fill: number | null;
  /** Share of the band. Drives the slice's ARC LENGTH. */
  weight: number;
  /** No writer for this source yet — drawn dashed and never filled. */
  ghost: boolean;
  /** Explicit stroke colour — a SKILL's own hue on the Portfolio ring. Absent, the slice
   *  takes the pillar hue stepped by index (segmentShade). */
  color?: string | null;
  /**
   * A SPACER: takes up arc, draws nothing — not even track. For bands with no target
   * (birch events, parked skills), where the units must stay the size units are but an
   * empty track to the full circle would draw a quota that does not exist.
   */
  bare?: boolean;
};

/**
 * LABELS, ATTACHED TO THEIR ARCS.
 *
 * The donut was the app's least legible object: two to four arcs, all the same base hue,
 * with nothing saying which was which — so the name sits AT the arc, always, in every view.
 * The leader-line system this replaces parked the names in two fixed side columns, which
 * cannot survive a ring that rotates: the elbow geometry assumes the anchor never moves.
 *
 * Here each label rides its own segment — positioned at the slice's midpoint, just off the
 * stroke — and when the ring turns, the label turns with it while the TEXT counter-rotates
 * so it is always upright. The radial distance breathes with the world angle (see
 * `labelDist`), so a horizontal word near three o'clock stands further out than one at
 * twelve, and no glyph ever crosses the arc it names.
 */
/** How far the label sits off the stroke. 4, down from 6: every pixel here is paid twice
 *  in the box, and the ring was paying it out of its own diameter. */
const LABEL_GAP = 4;

/** The label's own type. Off the app's step scale and predates this pass; left alone
 *  deliberately, because changing it moves the whole column's width budget. */
const LABEL_SIZE = 11.5;

/**
 * A label's width, ESTIMATED rather than measured.
 *
 * 0.52em per glyph is Source Sans's average at this size — "Outreach", the longest metric
 * name, comes out at 50px against a measured 48. Deterministic on purpose: the estimate is
 * used during render to place the label and size the box, and measuring instead would mean
 * an SSR pass that disagrees with the client, a layout that shifts when fonts land, and a
 * box that changes size after first paint.
 */
const labelW = (t: string): number => t.length * LABEL_SIZE * 0.52 + 2;

/**
 * How far a label's CENTRE must sit from the ring's centre so its horizontal box clears
 * the stroke, at a given world angle.
 *
 * The text is always upright while its anchor rides the circle, so the clearance needed is
 * the box's half-extent along the radial direction: |cos|·w/2 near three and nine o'clock,
 * |sin|·h/2 near twelve and six. Adding exactly that keeps every label hugging the ring —
 * close at the poles where the box is shallow, further out at the sides where it is wide —
 * instead of orbiting at the worst-case distance all the way round.
 */
const labelDist = (rl: number, w: number, rad: number): number =>
  rl +
  Math.abs(Math.cos(rad)) * (w / 2 + 2) +
  Math.abs(Math.sin(rad)) * (LABEL_SIZE / 2 + 1.5);

/**
 * The box's label margin, each side. SOLVED, not chosen: the worst case is a label at
 * three o'clock — `labelDist` puts its centre at `rl + w/2 + 2`, and its right edge another
 * w/2 out, so the pad must hold the widest name plus the gap and margin. "Outreach" at 50px
 * plus LABEL_GAP plus 2 rounds to 56. Vertically the same sum uses the type height instead:
 * 11.5 + 1.5 + gap ≈ 20. Both trimmed from 60/22 — the owner's ruling was that the rings
 * had become too small, and these pads are the width the rings were paying for.
 *
 * EXPORTED, because PillarSections solves ring sizes against them. They used to be written
 * down in both files, which is precisely how two numbers drift apart.
 */
export const LABEL_PAD_X = 56;
/** Vertical: the label anchor sits at `size/2 + 2`, and a label at twelve o'clock extends
 *  one type height plus its margins above that — 11.5 + 1.5 + 2 ≈ 15. 16, measured down
 *  from a 20 that was insurance twice over; the four points go straight to the donut. */
export const LABEL_PAD_Y = 16;

/**
 * ROTATION. Idle, the three pillar donuts turn — one lap a minute, slow enough to read as
 * alive rather than as motion. A hovered ring slows to a fifth of that (never stops: a
 * stopped ring looks broken, a slowed one looks attended to), and the two speeds meet
 * through an exponential approach so there is no snap at either edge.
 *
 * The loop is a rAF driven from JavaScript, which this codebase treats with suspicion —
 * rAF does not fire in a hidden tab. That is precisely why it is SAFE here: the rotation is
 * pure decoration, owns no state and reveals nothing, so a hidden tab simply holds still.
 * The dt clamp keeps the first frame after a long pause from teleporting the ring.
 */
const SPIN_IDLE = 6; /* deg/s — one lap in 60s */
const SPIN_HOVER = 1.1; /* deg/s — noticeably slower, visibly not stopped */
const SPIN_TAU = 0.45; /* s — how fast the two speeds blend into each other */
/**
 * The KICK: one fast full turn when a ring is clicked open, decaying exponentially so it
 * launches hard and settles soft — the spin IS the expand's flourish, and both land
 * together because KICK_TAU is tuned to --dur-expand's 630ms. The floor keeps the last
 * degrees from asymptoting forever.
 */
const KICK_TAU = 0.16; /* s */
const KICK_FLOOR = 140; /* deg/s */

/** Honours the OS setting for the gestures driven from JavaScript. The CSS half is nulled
 *  in globals.css; this half has to be asked. */
const wantsMotion = (): boolean =>
  typeof window === "undefined" ||
  typeof window.matchMedia !== "function" ||
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The DEFAULT pillar hues as hex, because `segmentShade` has to do arithmetic on a colour
 * and `var(--color-social)` is not a number.
 *
 * MUST move with the tokens in globals.css. There is no way to resolve a CSS variable
 * during render that also works server-side — the same constraint that forced
 * --color-accent-rgb to exist beside --color-accent, and this carries the same warning.
 */
const TONE_HEX: Record<PillarKey | "accent", string> = {
  accent: "#9a6a2e",
  social_capital: "#8c7434",
  physical: "#467c6c",
  portfolio: "#67609b",
};

/** #rgb / #rrggbb → [h 0..360, s 0..100, l 0..100], or null for anything else. */
function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let hx = m[1]!;
  if (hx.length === 3)
    hx = hx
      .split("")
      .map((c) => c + c)
      .join("");
  const r = parseInt(hx.slice(0, 2), 16) / 255;
  const g = parseInt(hx.slice(2, 4), 16) / 255;
  const b = parseInt(hx.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const S = s / 100;
  const L = l / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = S * Math.min(L, 1 - L);
    const v = L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Per-segment shade steps: same hue, stepped lightness and saturation, so two arcs of one
 * pillar read as SIBLINGS rather than as one arc with a gap in it.
 *
 * The steps lean DARK — one gentle lighter step, never more. Every pillar hue is certified
 * at ≥3:1 against the page as a stroke, and darkening only adds contrast while lightening
 * spends it; +7L is measured as the most the weakest hue (social, 3.86:1) can give up and
 * stay above the floor. Subtle by design: distinct at a glance, nothing near a rainbow.
 */
const SHADE_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-8, 6],
  [7, -9],
  [-14, 10],
  [4, -5],
];

/** The i-th segment's stroke, derived from the pillar hue. Falls back to the hue untouched
 *  when it is not parseable hex — a wrong colour would be worse than a flat ring. */
function segmentShade(hue: string, i: number): string {
  const step = SHADE_STEPS[i % SHADE_STEPS.length]!;
  if (step[0] === 0 && step[1] === 0) return hue;
  const hsl = hexToHsl(hue);
  if (!hsl) return hue;
  const [h, s, l] = hsl;
  return hslToHex(
    h,
    Math.max(0, Math.min(100, s + step[1])),
    Math.max(8, Math.min(92, l + step[0])),
  );
}

/** Fraction of the circle an unweighted metric gets, so "tracked but not scored" and
 *  "no source yet" still appear instead of silently vanishing at weight 0. */
const UNSCORED_SHARE = 0.09;
/** Gap between slices, in fractions of the circle. Small — the slices should read as one
 *  ring divided, not as separate arcs floating near each other. */
const GAP = 0.012;

/**
 * A pillar as ONE segmented donut rather than a ring plus a row of little ones.
 *
 * The old shape drew a pillar ring for the mean and then a small ring per metric beneath
 * it, which said the same thing twice and made three pillars taller than a screen. Here
 * each metric is a SLICE of a single ring: arc length is its weight, so Strength owns most
 * of Physical's circle and Cardio a fifth of it, and the amount of colour around the whole
 * donut IS the pillar's fill. One glance, one shape, no arithmetic.
 *
 * Unscored and ghost metrics get a fixed small slice each rather than a weighted one —
 * their weight is 0, so weighting would delete them from a ring that is supposed to show
 * everything the pillar tracks. They are drawn dashed and never filled, which is already
 * this app's language for "recorded, but not a target".
 */
export function SegmentedRing({
  segments,
  mid = [],
  outer = [],
  size,
  stroke,
  tone,
  color = null,
  spin = false,
  kick = 0,
  glow = false,
  children,
}: {
  segments: RingSegment[];
  /**
   * A SECOND full band between the donut and the thin outer lap — medium stroke, its own
   * segments. Social wears its birch events here; Portfolio its parked skills. The three
   * radii read outward as the standing they encode: the core commitment innermost, the
   * adjacent-but-lesser band around it, the thin extra outermost.
   */
  mid?: RingSegment[];
  /**
   * Rotate, idly and forever — see the SPIN_* constants. Opt-in, because rotation is a
   * statement about the surface: the pillar column is a glance, where a slow turn reads as
   * alive; the record is a reading surface, where anything moving is a thing you cannot
   * finish reading.
   */
  spin?: boolean;
  /**
   * A counter. Each increment buys one fast full turn — the clicked ring's flourish as it
   * expands. A counter rather than a boolean so two clicks in a session are two spins
   * without anyone having to remember to reset a flag.
   */
  kick?: number;
  /**
   * Metrics drawn as a thin LAP OUTSIDE the donut instead of a slice of it.
   *
   * This is where a metric goes when it has a floor of its own but must never move the
   * pillar's average — Misc, at one session a fortnight. As a slice it would either take
   * space from the metrics that do count, or sit there at weight 0 looking like a slice
   * that had been switched off. As an outer lap it reads as an extra, which is exactly
   * what it is.
   *
   * Translucent rather than glowing: a glow is a shadow, and the count in this app is
   * zero.
   */
  outer?: RingSegment[];
  size: number;
  stroke: number;
  tone: PillarKey;
  color?: string | null;
  /**
   * Draw the pillar's own lamp behind the donut.
   *
   * A BOOLEAN, exactly as the hero's `bloom` is, and for the same reason: it can be on or off
   * and can never be given a value. The owner asked for the adherence ring's glow on these
   * three, which reverses this file's old ruling that pillar donuts get no bloom — but the
   * half of that ruling that mattered is kept, because it is the half The One Lamp Rule
   * actually rests on. A bloom that tracked the fill would say a full ring is a win; a bloom
   * that is identical at 0/8 and 11/8 says only that there is a ring here.
   *
   * Opt-in rather than automatic, so the record's dense chart grid does not inherit three
   * glows it never asked for.
   */
  glow?: boolean;
  children?: ReactNode;
}) {
  const cx = size / 2;
  const cy = size / 2;
  /**
   * HEX, not the var() token, because `segmentShade` does arithmetic on it. The owner's
   * chosen colour arrives as hex already; only the defaults needed mirroring — see
   * TONE_HEX and its must-move-together warning.
   */
  const hue = color ?? TONE_HEX[tone];
  const trackId = `lit-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // Every band is drawn INSIDE `size`, with the donut inset to make room, so a pillar
  // with three bands and one with one still occupy the same box and the column stays
  // aligned. Reading outward: main donut, then the mid band at ~70% stroke, then the thin
  // lap at 45% — thickness IS the standing, so the radii never have to be explained.
  //
  // The lap USED to be drawn at 0.55 opacity, which measured 1.93-2.14:1 against the pillar
  // window once the donut grew to 148px — under the 3:1 floor for a stroke, i.e. a mark you
  // could not reliably see. Translucency was the wrong lever: it was standing in for "this
  // is an extra", and thickness and radius already say that. So every band is FULL HUE and
  // separation is carried by stroke weight and radius alone.
  const lapStroke = outer.length ? Math.max(2, stroke * 0.45) : 0;
  const lapGap = outer.length ? 5 : 0;
  const midStroke = mid.length ? Math.max(3, stroke * 0.7) : 0;
  const midGap = mid.length ? 5 : 0;
  const rLap = (size - lapStroke) / 2;
  const rMid = (size - midStroke) / 2 - lapStroke - lapGap;
  const r = (size - stroke) / 2 - lapStroke - lapGap - midStroke - midGap;

  /** A point on a ring of radius `rad`. Angles run from twelve o'clock, clockwise. */
  const at = (turn: number, rad: number) => {
    const a = turn * 2 * Math.PI - Math.PI / 2;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as const;
  };

  /**
   * An arc as a real path rather than a dashed circle.
   *
   * The single ring can place an arc with strokeDasharray + strokeDashoffset, but a slice
   * that must ALSO be dashed cannot — the dash pattern and the wedge offset would be
   * fighting over the same property. Paths sidestep it entirely and are exact at any
   * angle, which matters when several slices have to butt up against each other.
   */
  const arcPath = (from: number, to: number, rad: number) => {
    if (to - from <= 0) return "";
    // A full turn cannot be expressed as one arc — its start and end points coincide.
    const span = Math.min(to - from, 0.9999);
    const [x0, y0] = at(from, rad);
    const [x1, y1] = at(from + span, rad);
    return `M ${x0} ${y0} A ${rad} ${rad} 0 ${span > 0.5 ? 1 : 0} 1 ${x1} ${y1}`;
  };

  /**
   * Weight-proportional slices for ONE band. Scored slices split whatever the unscored
   * ones leave; the gap comes off the END of each slice so arcs never touch; null fill
   * never enters the arithmetic — the same guard the single ring uses. Shared by the main
   * donut and the mid band so two bands cannot disagree about what a weight means.
   */
  const buildSlices = (segs: RingSegment[]) => {
    const unscored = segs.filter((s) => s.weight <= 0);
    const scored = segs.filter((s) => s.weight > 0);
    const totalWeight = scored.reduce((sum, s) => sum + s.weight, 0);
    const scoredShare = Math.max(0, 1 - unscored.length * UNSCORED_SHARE);
    let cursor = 0;
    return segs.map((s) => {
      const share =
        s.weight > 0 && totalWeight > 0
          ? (s.weight / totalWeight) * scoredShare
          : UNSCORED_SHARE;
      const start = cursor;
      cursor += share;
      const span = Math.max(0, share - GAP);
      const fillSpan =
        s.fill == null ? 0 : Math.min(1, Math.max(0, s.fill)) * span;
      return { ...s, start, span, fillSpan };
    });
  };

  const slices = buildSlices(segments);
  const midSlices = buildSlices(mid);

  // Laps share the whole circle between them rather than being packed after the slices —
  // an outer ring that stopped a third of the way round would read as a fourth slice.
  const laps = outer.map((s, i) => {
    const span = (1 - GAP * outer.length) / Math.max(1, outer.length);
    const start = i * (span + GAP);
    const fillSpan = s.fill == null ? 0 : Math.min(1, Math.max(0, s.fill)) * span;
    return { ...s, start, span, fillSpan };
  });

  /**
   * One label per LABELLED slice, at the slice's midpoint, ALWAYS — both views, every
   * size, every band. Slices without a `label` are units (one event, one tick) and stay
   * mute; the builders name one slot per band instead. All labels anchor just past the
   * OUTERMOST band, whichever that is, so a name can never sit across a ring it does not
   * belong to. The geometry is shared between this render (the resting positions) and the
   * rotation loop below (the same maths, per frame), so a static ring and a paused
   * spinning ring are pixel-identical.
   */
  const rl = size / 2 + LABEL_GAP - 2;
  const labelMeta = [...slices, ...midSlices, ...laps]
    .filter((s) => s.label)
    .map((s) => ({
      key: s.key,
      label: s.label!,
      ghost: s.ghost,
      baseDeg: (s.start + s.span / 2) * 360,
      w: labelW(s.label!),
    }));

  // The padded box. Geometry is unchanged — the viewBox simply starts negative, so every
  // cx/cy/r below still means what it meant before the labels existed. The pad is
  // UNCONDITIONAL now: every donut carries its labels, so every donut pays for them.
  const padX = LABEL_PAD_X;
  const padY = LABEL_PAD_Y;
  const boxW = size + padX * 2;
  const boxH = size + padY * 2;

  /**
   * THE ROTATION LOOP. Direct DOM writes from one rAF, never React state — a re-render per
   * frame would rebuild every path on three rings at 60fps for a decoration.
   *
   * Everything the loop needs is republished into `meta` on every render, so a resize or a
   * data refresh changes the geometry under the loop without restarting it — the next frame
   * simply reads the new numbers.
   *
   * Three writes per frame per ring: the group's rotation, the gradient's counter-rotation
   * (the lamp stays at twelve — see LitTrack), and each label's position + counter-turn.
   * The label's translate is in LOCAL coordinates: the group's rotation carries it to the
   * world angle, and `labelDist` is fed the WORLD angle so the upright text breathes in and
   * out as its anchor rounds the circle.
   */
  const rotRef = useRef<SVGGElement | null>(null);
  const gradRef = useRef<SVGLinearGradientElement | null>(null);
  const labelRefs = useRef(new Map<string, SVGGElement>());
  const hoverRef = useRef(false);
  const boostRef = useRef(0);
  const meta = useRef({ cx, cy, rl, labels: labelMeta });
  meta.current = { cx, cy, rl, labels: labelMeta };

  /** Ref-compared rather than effect-on-mount, so a remount mid-session (the phone panes
   *  unmount freely) cannot replay a spin that already happened. */
  const kickSeen = useRef(kick);
  useEffect(() => {
    if (kick === kickSeen.current) return;
    kickSeen.current = kick;
    boostRef.current += 360;
  }, [kick]);

  useEffect(() => {
    if (!spin || !wantsMotion()) return;
    let raf = 0;
    let last: number | null = null;
    let a = 0;
    let v = SPIN_IDLE;
    const tick = (now: number) => {
      // Clamped so the first frame after a background-tab pause is a step, not a leap.
      const dt = last == null ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      const target = hoverRef.current ? SPIN_HOVER : SPIN_IDLE;
      v += (target - v) * (1 - Math.exp(-dt / SPIN_TAU));
      if (boostRef.current > 0) {
        const step = Math.min(
          boostRef.current,
          boostRef.current * (1 - Math.exp(-dt / KICK_TAU)) + KICK_FLOOR * dt,
        );
        a += step;
        boostRef.current = boostRef.current - step < 0.5 ? 0 : boostRef.current - step;
      } else {
        a += v * dt;
      }
      a %= 360;
      const m = meta.current;
      rotRef.current?.setAttribute("transform", `rotate(${a} ${m.cx} ${m.cy})`);
      gradRef.current?.setAttribute(
        "gradientTransform",
        `rotate(${-a} ${m.cx} ${m.cy})`,
      );
      for (const L of m.labels) {
        const el = labelRefs.current.get(L.key);
        if (!el) continue;
        const world = ((L.baseDeg + a - 90) * Math.PI) / 180;
        const local = ((L.baseDeg - 90) * Math.PI) / 180;
        const d = labelDist(m.rl, L.w, world);
        el.setAttribute(
          "transform",
          `translate(${m.cx + d * Math.cos(local)} ${m.cy + d * Math.sin(local)}) rotate(${-a})`,
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin]);

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: boxW, maxWidth: "100%" }}
      // Hover slows the spin — the ring's own feedback, now that the background highlight
      // is gone. On the ring's box rather than the whole header row, so pointing at the
      // TEXT does not read as pointing at the chart.
      onPointerEnter={spin ? () => (hoverRef.current = true) : undefined}
      onPointerLeave={spin ? () => (hoverRef.current = false) : undefined}
    >
      {/* First in DOM order so it paints beneath the arcs. It is centred on the BOX rather
          than inset from it, because a labelled box is the ring plus 60px a side and an inset
          bloom would be an ellipse the width of the label columns. The SVG centres the ring in
          that same box, so a centred square of the ring's own size lands exactly on it. */}
      {glow && <PillarBloom size={size} hue={hue} />}
      <svg
        // POSITIONED, so DOM order decides paint order and the bloom lands underneath — the
        // same fix the single ring documents. A static SVG paints in step 7 and the absolutely
        // positioned bloom in step 8, i.e. the lamp over the ring rather than under it.
        className="relative"
        // Scales as one object in a narrow column: the arcs, the gaps and the type all shrink
        // together, so the chart stays itself rather than reflowing into a different chart.
        width="100%"
        viewBox={`${-padX} ${-padY} ${boxW} ${boxH}`}
        aria-hidden
      >
        <LitTrack id={trackId} size={size} gradRef={gradRef} />
        {/* EVERYTHING that belongs to the data rotates as one group — arcs, laps and
            labels — so a turning ring is a turning object rather than paint sliding under
            fixed furniture. The gradient it is stroked with counter-rotates (see LitTrack),
            so the lamp stays at twelve o'clock while the object turns beneath it. */}
        <g ref={rotRef}>
          {slices.map((s, i) => (
            <g key={s.key}>
              {/* The slice's own track. Drawn unless the slice is a bare spacer, so an
                  empty segment reads as a segment that is empty rather than an absence —
                  and a spacer reads as nothing, which is what it is. */}
              {!s.bare && (
                <path
                  d={arcPath(s.start, s.start + s.span, r)}
                  fill="none"
                  stroke={trackStroke(size, trackId)}
                  strokeWidth={stroke}
                  strokeLinecap="butt"
                  strokeDasharray={
                    s.ghost
                      ? `${Math.max(2, stroke)} ${Math.max(3, stroke * 1.6)}`
                      : undefined
                  }
                />
              )}
              {/* Mounted UNCONDITIONALLY, and drawn across the whole slice with the fill
                  expressed as a dash offset rather than as a shorter path.

                  Three donuts used to pop into existence when /api/rings landed while the
                  adherence ring beside them travelled — the gap was that a shorter path is a
                  different `d`, and `d` is not animatable. pathLength normalises the slice to
                  1 whatever its real length, so the offset is just `1 - fill` and the same
                  .motion-arc that carries the hero's arc carries these.

                  Safe because only TRACKS are ever dashed, for ghosts. The fill path never is,
                  which is the exact conflict the path-based geometry was written to avoid. */}
              <path
                d={arcPath(s.start, s.start + s.span, r)}
                fill="none"
                // A slice's OWN colour when it has one — a skill's chosen hue — else one
                // step off the pillar hue: same family, distinct members. The DATA is
                // still the arc's length and fill; the colour only says which one this is.
                stroke={s.color ?? segmentShade(hue, i)}
                strokeWidth={stroke}
                // BUTT, never round: round caps add half a stroke width at each end, which
                // would make the smallest non-zero fills read as half again their true value
                // AND spill into the neighbouring slice.
                strokeLinecap="butt"
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={s.span > 0 ? 1 - s.fillSpan / s.span : 1}
                className="motion-arc"
              />
            </g>
          ))}

          {/* THE MID BAND — the second full ring, between the donut and the thin lap.
              Social's birch events, Portfolio's parked skills: adjacent to the core
              commitment but not it, which is what the smaller stroke at the larger radius
              says without a legend. Same slice machinery as the donut, so a weight means
              one thing everywhere. */}
          {midSlices.map((s, i) => (
            <g key={`mid-${s.key}`}>
              {!s.bare && (
                <path
                  d={arcPath(s.start, s.start + s.span, rMid)}
                  fill="none"
                  stroke={trackStroke(size, trackId)}
                  strokeWidth={midStroke}
                  strokeLinecap="butt"
                  strokeDasharray={
                    s.ghost
                      ? `${Math.max(2, midStroke)} ${Math.max(3, midStroke * 1.6)}`
                      : undefined
                  }
                />
              )}
              <path
                d={arcPath(s.start, s.start + s.span, rMid)}
                fill="none"
                stroke={s.color ?? segmentShade(hue, i + 1)}
                strokeWidth={midStroke}
                strokeLinecap="butt"
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={s.span > 0 ? 1 - s.fillSpan / s.span : 1}
                className="motion-arc"
              />
            </g>
          ))}

          {/* The outer laps: thinner, and set outside the donut with a gap, so they read as
              an extra around the pillar rather than a part of it — which is exactly their
              standing in the maths, where their weight is zero. Full base hue: a lap is an
              extra, not a slice, so it does not join the shade family. */}
          {laps.map((s) => (
            <g key={`lap-${s.key}`}>
              <path
                d={arcPath(s.start, s.start + s.span, rLap)}
                fill="none"
                stroke={trackStroke(size, trackId)}
                strokeWidth={lapStroke}
                strokeLinecap="butt"
              />
              {s.fillSpan > 0 && (
                <path
                  d={arcPath(s.start, s.start + s.fillSpan, rLap)}
                  fill="none"
                  stroke={hue}
                  strokeWidth={lapStroke}
                  strokeLinecap="butt"
                />
              )}
            </g>
          ))}

          {/* The names, riding their own arcs. Inside the rotating group so they travel
              with their segments; each <g> is counter-rotated per frame so the TEXT stays
              upright the whole way round. The resting transform below is the same maths at
              angle zero, so a ring that never spins is simply a ring paused here. */}
          {labelMeta.map((L) => {
            const local = ((L.baseDeg - 90) * Math.PI) / 180;
            const d = labelDist(rl, L.w, local);
            const x = cx + d * Math.cos(local);
            const y = cy + d * Math.sin(local);
            return (
              <g
                key={`t-${L.key}`}
                ref={(el) => {
                  if (el) labelRefs.current.set(L.key, el);
                  else labelRefs.current.delete(L.key);
                }}
                transform={`translate(${x} ${y})`}
              >
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={LABEL_SIZE}
                  // Muted for a ghost: the label of a metric with no source is a statement
                  // about the app, and it should not carry the same weight as a live one.
                  style={{
                    fill: L.ghost ? "var(--color-muted)" : "var(--color-ink)",
                  }}
                >
                  {L.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

/** One adhered event, as the drill-downs and the band builders both receive it. */
export type EventItem = { date: string; title: string };

/**
 * THE SOCIAL RING'S THREE BANDS, from the fortnight's adhered events.
 *
 * Inner (main): the weekly-occurring kind — graphite — one SLOT per event against the
 * owner's six-a-fortnight minimum, empty slots drawn as track because the target is real.
 * Mid: birch, the one-off kind, in the same one-sixth unit but with BARE remainder — they
 * have no quota, so nothing may draw one. Outer thin: outreach against its two.
 *
 * `null` events mean the calendar could not be read: the band goes ghost, never zero —
 * the same rule the old single slice kept.
 */
export function socialBands(
  graphite: EventItem[] | null,
  birch: EventItem[] | null,
  outreach: { count: number; required: number },
  eventsRequired: number,
): { segments: RingSegment[]; mid: RingSegment[]; outer: RingSegment[] } {
  const segments: RingSegment[] =
    graphite == null
      ? [{ key: "events", label: "Events", fill: null, weight: 1, ghost: true }]
      : Array.from(
          { length: Math.max(eventsRequired, graphite.length) },
          (_, i): RingSegment => ({
            key: `ev${i}`,
            // One name for the band, on its first slot — six copies would be noise.
            label: i === 0 ? "Events" : undefined,
            fill: i < graphite.length ? 1 : 0,
            weight: 1,
            ghost: false,
          }),
        );

  const mid: RingSegment[] =
    birch == null || birch.length === 0
      ? []
      : [
          ...birch.map(
            (_, i): RingSegment => ({
              key: `bi${i}`,
              label: i === 0 ? "Birch" : undefined,
              fill: 1,
              weight: 1,
              ghost: false,
            }),
          ),
          ...(birch.length < eventsRequired
            ? [
                {
                  key: "bi-rest",
                  fill: 0,
                  weight: eventsRequired - birch.length,
                  ghost: false,
                  bare: true,
                } satisfies RingSegment,
              ]
            : []),
        ];

  const outer: RingSegment[] = Array.from(
    { length: outreach.required },
    (_, i): RingSegment => ({
      key: `out${i}`,
      label: i === 0 ? "Outreach" : undefined,
      fill: i < outreach.count ? 1 : 0,
      weight: 1,
      ghost: false,
    }),
  );

  return { segments, mid, outer };
}

/**
 * THE PORTFOLIO RING'S BANDS, one segment per SKILL worked this fortnight.
 *
 * Inner (main): the ACTIVE skills — each skill's arc is its sessions in the window, in the
 * skill's own colour, against the four-a-fortnight minimum; the shortfall is drawn as
 * track because the target is real. Mid: the PARKED skills — still done, not imperative —
 * in the same one-session unit with BARE remainder, because parked work has no quota.
 *
 * `null` means /api/rings has not landed: one plain empty slice, the same "not loaded is
 * not zero" statement the old single-metric donut made.
 */
export function portfolioBands(
  skills: SkillSlice[] | null,
  required: number,
): { segments: RingSegment[]; mid: RingSegment[] } {
  if (skills == null)
    return {
      segments: [
        { key: "pending", label: "Skills", fill: null, weight: 1, ghost: false },
      ],
      mid: [],
    };

  const active = skills.filter((s) => s.state !== "parked");
  const parked = skills.filter((s) => s.state === "parked");

  const skillSeg = (s: SkillSlice): RingSegment => ({
    key: `sk${s.id}`,
    label: s.name,
    fill: 1,
    weight: s.sessions,
    ghost: false,
    color: s.color ?? skillDefaultHex(s.id),
  });

  const activeTotal = active.reduce((n, s) => n + s.sessions, 0);
  const segments: RingSegment[] =
    active.length === 0
      ? [{ key: "skills", label: "Skills", fill: 0, weight: 1, ghost: false }]
      : [
          ...active.map(skillSeg),
          ...(activeTotal < required
            ? [
                {
                  key: "sk-rest",
                  fill: 0,
                  weight: required - activeTotal,
                  ghost: false,
                } satisfies RingSegment,
              ]
            : []),
        ];

  const parkedTotal = parked.reduce((n, s) => n + s.sessions, 0);
  const mid: RingSegment[] =
    parked.length === 0
      ? []
      : [
          ...parked.map(skillSeg),
          ...(parkedTotal < required
            ? [
                {
                  key: "pk-rest",
                  fill: 0,
                  weight: required - parkedTotal,
                  ghost: false,
                  bare: true,
                } satisfies RingSegment,
              ]
            : []),
        ];

  return { segments, mid };
}

/**
 * ONE constructor for a pillar's bands, shared by the Today column and the record page —
 * two surfaces drawing the same three rings must not each hold their own copy of what a
 * pillar's bands are.
 */
export function bandsForPillar(
  pk: PillarKey,
  ring: PillarRingView | null,
  data: {
    social: EventItem[] | null;
    birch: EventItem[] | null;
    skills: SkillSlice[] | null;
  },
  pillarName: string,
): { segments: RingSegment[]; mid: RingSegment[]; outer: RingSegment[] } {
  const asSegment = (m: MetricRing): RingSegment => ({
    key: m.key,
    label: m.label,
    fill: m.fill,
    weight: m.weight,
    ghost: m.state === "ghost",
  });

  if (pk === "social_capital") {
    const om = ring?.metrics.find((m) => m.key === "outreach");
    return socialBands(
      data.social,
      data.birch,
      { count: om?.count ?? 0, required: om?.required ?? 2 },
      METRICS.find((m) => m.key === "social_events")?.required ?? 6,
    );
  }
  if (pk === "portfolio") {
    const b = portfolioBands(
      data.skills,
      METRICS.find((m) => m.key === "skills")?.required ?? 4,
    );
    return { ...b, outer: [] };
  }
  // Physical: the metric donut it always was, misc riding the thin lap. Before the fetch
  // lands there is one plain empty slice rather than a dashed one: dashes mean "no source
  // exists", and "not loaded yet" is a different statement.
  return {
    segments: ring
      ? ring.metrics.filter((m) => !m.lap).map(asSegment)
      : [{ key: "pending", label: pillarName, fill: null, weight: 1, ghost: false }],
    mid: [],
    outer: ring ? ring.metrics.filter((m) => m.lap).map(asSegment) : [],
  };
}
