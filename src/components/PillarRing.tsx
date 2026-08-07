"use client";

import type { ReactNode } from "react";
import type { PillarKey } from "@/lib/queries";

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
  children?: ReactNode;
}) {
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
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          // --color-line-strong, not --color-panel-2: the recessed surface token is
          // #efe9de against a #f2ede4 page, which is so close that an EMPTY ring reads as
          // nothing at all rather than as "a ring that isn't filled". An unfilled ring
          // must still be legible — that is the whole "neglected, not failed" signal.
          stroke="var(--color-line-strong)"
          strokeWidth={stroke}
          strokeDasharray={
            dashed
              ? `${Math.max(2, stroke)} ${Math.max(3, stroke * 1.6)}`
              : undefined
          }
        />
        {!ghost && dash > 0 && (
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
};

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
  const laps = outer.map((s, i) => {
    const span = (1 - GAP * outer.length) / Math.max(1, outer.length);
    const start = i * (span + GAP);
    const fillSpan = s.fill == null ? 0 : Math.min(1, Math.max(0, s.fill)) * span;
    return { ...s, start, span, fillSpan };
  });

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {slices.map((s) => (
          <g key={s.key}>
            {/* The slice's own track. Always drawn, so an empty segment reads as a segment
                that is empty rather than as an absence. */}
            <path
              d={arcPath(s.start, s.start + s.span, r)}
              fill="none"
              stroke="var(--color-line-strong)"
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={
                s.ghost
                  ? `${Math.max(2, stroke)} ${Math.max(3, stroke * 1.6)}`
                  : undefined
              }
            />
            {s.fillSpan > 0 && (
              <path
                d={arcPath(s.start, s.start + s.fillSpan, r)}
                fill="none"
                stroke={hue}
                strokeWidth={stroke}
                // BUTT, never round: round caps add half a stroke width at each end, which
                // would make the smallest non-zero fills read as half again their true
                // value AND spill into the neighbouring slice.
                strokeLinecap="butt"
              />
            )}
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
              stroke="var(--color-line-strong)"
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
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
