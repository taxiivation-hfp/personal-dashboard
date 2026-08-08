"use client";

import { useId, type ReactNode } from "react";
import type { PillarKey } from "@/lib/queries";

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
function LitTrack({ id, size }: { id: string; size: number }) {
  return (
    <defs>
      <linearGradient
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

/** One slice of a pillar's donut. */
export type RingSegment = {
  key: string;
  label: string;
  /** 0..1, or null for a metric with no source. */
  fill: number | null;
  /** Share of the pillar's mean. Drives the slice's ARC LENGTH, so the ring shows what
   *  each metric is worth as well as how full it is. */
  weight: number;
  /** No writer for this source yet — drawn dashed and never filled. */
  ghost: boolean;
  /** The count, short enough to sit beside the arc: "3/8", or "—" for a ghost. */
  short?: string;
};

/**
 * How far outside the stroke the labels sit, and how much room the box gives them.
 *
 * The donut was the app's least legible object: two to four arcs, all the SAME HUE by rule,
 * with nothing saying which was which. A colour legend cannot fix that — there is only one
 * colour — so the only thing that can carry the mapping is POSITION, and the only honest way
 * to use position is to put the name at the arc.
 */
/**
 * How far the label sits off the stroke.
 *
 * 6, not 11. Every pixel here is paid for TWICE in the vertical budget — once above and once
 * below — and the column has three of these stacked in it. Pulling the labels in close also
 * reads better: a name floating a centimetre from its arc has to be traced back to it.
 */
const LABEL_GAP = 6;
/**
 * The box grows ASYMMETRICALLY, and that is the whole reason three pillars fit a laptop.
 *
 * Labels sit left and right of the ring, so they need horizontal room — but the first
 * version padded a SQUARE viewBox, spending the same 60px above and below where nothing is
 * drawn. On a 730px screen that wasted height turned a 148px ring into a 353px row and the
 * pillar column into a 1176px scroll inside a 607px window, which is exactly the shape the
 * column was rebuilt to escape.
 *
 * Vertical pad only has to clear the two-line label at twelve and six o'clock.
 */
const LABEL_PAD_X = 80;
/**
 * ONE LINE of text, so this only has to clear a single 11.5px cap height plus its offset.
 *
 * Putting the count on the same line as the name spends WIDTH instead, which a column this
 * shape has and its height has none of. 16 is what one 11.5px line plus its offset and its
 * descenders occupy below the ring, once LABEL_GAP stopped holding the label a centimetre
 * away from the arc it names. Getting this wrong clips the label at SIX O'CLOCK — a bug
 * visible on exactly one pillar, the one whose single arc lands at the bottom, and invisible
 * on the other two.
 *
 * EXPORTED, because PillarSections has to subtract it when it solves for the ring size. It
 * was written down in both files and that is precisely how two numbers drift apart.
 */
export const LABEL_PAD_Y = 20;
/** Below this a label would be bigger than the thing it labels. The 76px expanded donut and
 *  the 18px metric rings stay plain; everything above gets named.
 *
 *  KEEP THIS BELOW EVERY LABELLED CALLER. It silently switched the labels off twice while
 *  the collapsed ring was being resized to fit a real screen — the chart went back to being
 *  unreadable and nothing anywhere said why. */
const LABEL_MIN_SIZE = 72;

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
  outer = [],
  size,
  stroke,
  tone,
  color = null,
  children,
}: {
  segments: RingSegment[];
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
  children?: ReactNode;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const hue = toneColor(tone, color);
  const trackId = `lit-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // The outer lap is drawn INSIDE `size`, with the donut inset to make room, so a pillar
  // with a lap and one without still occupy the same box and the column stays aligned.
  // 45% of the stroke and a 6px gap, both up from 30% and 3px.
  //
  // The lap USED to be drawn at 0.55 opacity, which measured 1.93-2.14:1 against the pillar
  // window once the donut grew to 148px — under the 3:1 floor for a stroke, i.e. a mark you
  // could not reliably see. Translucency was the wrong lever: it was standing in for "this
  // is an extra", and thickness and radius already say that. So the lap is now FULL HUE and
  // simply thinner, which is legible at every size and still unmistakably not a slice.
  const lapStroke = outer.length ? Math.max(2, stroke * 0.45) : 0;
  const lapGap = outer.length ? 6 : 0;
  const rLap = (size - lapStroke) / 2;
  const r = (size - stroke) / 2 - lapStroke - lapGap;

  // Scored slices split whatever the unscored ones leave, in proportion to their weight.
  const unscored = segments.filter((s) => s.weight <= 0);
  const scored = segments.filter((s) => s.weight > 0);
  const totalWeight = scored.reduce((sum, s) => sum + s.weight, 0);
  const scoredShare = Math.max(0, 1 - unscored.length * UNSCORED_SHARE);

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

  let cursor = 0;
  const slices = segments.map((s) => {
    const share =
      s.weight > 0 && totalWeight > 0
        ? (s.weight / totalWeight) * scoredShare
        : UNSCORED_SHARE;
    const start = cursor;
    cursor += share;
    // The gap comes off the END of each slice so the arcs never touch.
    const span = Math.max(0, share - GAP);
    // null fill never enters the arithmetic — the same guard the single ring uses.
    const fillSpan = s.fill == null ? 0 : Math.min(1, Math.max(0, s.fill)) * span;
    return { ...s, start, span, fillSpan };
  });

  // Laps share the whole circle between them rather than being packed after the slices —
  // an outer ring that stopped a third of the way round would read as a fourth slice.
  /**
   * A label per slice, at the arc's own midpoint.
   *
   * Anchored by which side of the circle it is on — text growing left from a right-hand arc
   * would run back across the donut. The dead band around the vertical (|cos| < 0.35) is
   * centred instead, because a label at twelve o'clock has no side to grow from.
   */
  const labelled = size >= LABEL_MIN_SIZE;
  const rLabel = r + stroke / 2 + LABEL_GAP;
  const labels = !labelled
    ? []
    : slices.map((s) => {
        const turn = s.start + s.span / 2;
        const a = turn * 2 * Math.PI - Math.PI / 2;
        const [cosA, sinA] = [Math.cos(a), Math.sin(a)];
        return {
          key: s.key,
          label: s.label,
          short: s.short,
          ghost: s.ghost,
          x: cx + rLabel * cosA,
          y: cy + rLabel * sinA,
          anchor: (cosA > 0.35
            ? "start"
            : cosA < -0.35
              ? "end"
              : "middle") as "start" | "end" | "middle",
          // Above the midline the pair sits above the point; below it, below. Otherwise a
          // label at six o'clock would overlap the arc it belongs to.
          above: sinA < -0.35,
        };
      });

  const laps = outer.map((s, i) => {
    const span = (1 - GAP * outer.length) / Math.max(1, outer.length);
    const start = i * (span + GAP);
    const fillSpan = s.fill == null ? 0 : Math.min(1, Math.max(0, s.fill)) * span;
    return { ...s, start, span, fillSpan };
  });

  // The padded box. Geometry is unchanged — the viewBox simply starts negative, so every
  // cx/cy/r below still means what it meant before the labels existed.
  const padX = labelled ? LABEL_PAD_X : 0;
  const padY = labelled ? LABEL_PAD_Y : 0;
  const boxW = size + padX * 2;
  const boxH = size + padY * 2;

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: boxW, maxWidth: "100%" }}
    >
      <svg
        // Scales as one object in a narrow column: the arcs, the gaps and the type all shrink
        // together, so the chart stays itself rather than reflowing into a different chart.
        width="100%"
        viewBox={`${-padX} ${-padY} ${boxW} ${boxH}`}
        aria-hidden
      >
        <LitTrack id={trackId} size={size} />
        {slices.map((s) => (
          <g key={s.key}>
            {/* The slice's own track. Always drawn, so an empty segment reads as a segment
                that is empty rather than as an absence. */}
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
              stroke={hue}
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

        {/* The outer laps: thinner, and set outside the donut with a gap, so they read as an
            extra around the pillar rather than a part of it — which is exactly their standing
            in the maths, where their weight is zero. Full hue, because a stroke you cannot
            measure is a stroke that is not there. */}
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
        {/* The names, and the reason the donut is readable at all. Drawn LAST so they sit
            over the arcs at the few angles where a long label reaches back across one. */}
        {labels.map((l) => (
          <text
            key={`t-${l.key}`}
            x={l.x}
            y={l.y}
            dy={l.above ? -2 : 8}
            textAnchor={l.anchor}
            fontSize={11.5}
            style={{ fill: "var(--color-ink)" }}
          >
            {l.label}
            {l.short && (
              <tspan
                dx={4}
                fontSize={11}
                style={{
                  fill: "var(--color-muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {l.short}
              </tspan>
            )}
          </text>
        ))}
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
