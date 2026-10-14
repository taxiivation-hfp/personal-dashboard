"use client";

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import type { PillarKey } from "@/lib/rings";

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
 *   adherence — 240px, amber, a fine 10px stroke, the numeral INSIDE
 *   pillar    — 200px closed / 240px opened, pillar-hued, segmented, its parts listed BELOW
 *   marker    — 18px, one per part row in an opened pillar's list
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
  physical: "var(--color-physical)",
  portfolio: "var(--color-portfolio)",
};

/** A tone's CSS token. The hues are fixed — there is no owner-chosen colour any more. */
export const toneColor = (tone: PillarKey | "accent"): string => TONE[tone];

/**
 * How much bigger than the ring the bloom's box is.
 *
 * 1.24 is solved, not chosen. `.pillar-bloom` peaks at the 76% stop of `closest-side`, so the
 * peak lands at `size * 1.24 / 2 * 0.76 = size * 0.471` — which is the stroke's own radius at
 * every size this file is asked for. The light comes off the ring rather than sitting behind
 * it, which is the whole difference between a lamp and an achievement glow.
 */
const BLOOM_BOX = 1.24;
/**
 * Below this a ring gets no bloom.
 *
 * The same argument that gates the lit track at 48px: an annular gradient across an 18px
 * marker ring is 4px of tint nobody can resolve, and five of them down a list is haze. The
 * bloom belongs to the donut a pillar is READ from, not to the row markers beside its facts.
 */
const BLOOM_MIN_SIZE = 48;

/** The lamp behind a pillar donut. Constant by construction — it takes a hue and a size and
 *  has no way to be told a value, which is what keeps The One Lamp Rule's second clause
 *  true here rather than merely intended. */
function PillarBloom({ size, hue }: { size: number; hue: string }) {
  if (size < BLOOM_MIN_SIZE) return null;
  return (
    <span
      aria-hidden
      className="pillar-bloom"
      style={
        {
          // A PERCENTAGE of the wrapper, not `size` in pixels. The wrapper is capped at
          // `maxWidth: 100%` so the donut shrinks in a column narrower than its nominal
          // size — and a lamp pinned to the nominal size would then stand proud of the
          // ring it belongs to and spill onto its neighbour. Sized this way the light and
          // the ring can never come apart. `aspect-ratio` rather than a second percentage:
          // height % on an absolutely positioned box resolves against the wrapper's
          // HEIGHT, which is the SVG's rendered height and would circle back on itself.
          width: `${BLOOM_BOX * 100}%`,
          aspectRatio: "1",
          "--bloom-hue": hue,
        } as CSSProperties
      }
    />
  );
}

/** 0..1, and never NaN. One helper for both rings so a clamp can never be written twice. */
const clamp01 = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

export default function Ring({
  fill,
  size,
  stroke,
  tone,
  color = null,
  dashed = false,
  bloom = false,
  children,
}: {
  fill: number | null;
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
   * Draw the lamp's bloom behind this ring. The 240px adherence hero, and nothing else.
   *
   * A BOOLEAN, deliberately — it can be on or off and can never be given a value. A bloom
   * that brightened with the figure would turn marking a block into a reward, which is the
   * one thing the light layer may not do. See The One Lamp Rule in globals.css.
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
  const dash = ghost ? 0 : c * clamp01(fill);

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
            stroke={color ?? toneColor(tone)}
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
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * ROTATION. Idle, the two pillar donuts turn — one lap a minute, slow enough to read as
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
 * The pillar hues as hex, because `segmentShade` has to do arithmetic on a colour and
 * `var(--color-portfolio)` is not a number.
 *
 * MUST move with the tokens in globals.css. There is no way to resolve a CSS variable
 * during render that also works server-side — the same constraint that forced
 * --color-accent-rgb to exist beside --color-accent, and this carries the same warning.
 * `portfolio` is CAREER's Plum (spec §1); the key stays `portfolio` because renaming a live
 * database key is churn, and the NAME comes from PILLAR_NAME in rings.ts.
 */
export const TONE_HEX: Record<PillarKey | "accent", string> = {
  accent: "#9a6a2e",
  physical: "#467c6c",
  portfolio: "#7d5a72",
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
 * spends it; +7L is measured as the most the weakest hue can give up and stay above the
 * floor. Subtle by design: distinct at a glance, nothing near a rainbow.
 *
 * FIVE steps, which is exactly Health's five parts — Career's arcs cycle back to step 0 at
 * the sixth goal, and that is correct: a sixth goal is not a sixth kind of thing.
 */
const SHADE_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-8, 6],
  [7, -9],
  [-14, 10],
  [4, -5],
];

/** The i-th segment's stroke, derived from the pillar hue. Falls back to the hue untouched
 *  when it is not parseable hex — a wrong colour would be worse than a flat ring.
 *
 *  EXPORTED because the part list beneath the ring wears the same colours: a legend that
 *  computes its own shades is a legend that eventually disagrees with the chart. */
export function segmentShade(hue: string, i: number): string {
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

/** Gap between slices, in fractions of the circle. Small — the slices should read as one
 *  ring divided, not as separate arcs floating near each other. */
const GAP = 0.012;

/**
 * A pillar as ONE segmented donut of ONE thickness — the owner's ruling, spec §1.
 *
 * Each arc is a part of the pillar: its arc LENGTH is its weight (the weights of one ring
 * sum to 1, which `buildHealthRing` and `buildCareerRing` both guarantee) and the lit
 * fraction of it is that part's fill. The amount of colour around the whole donut IS the
 * pillar's figure. One glance, one shape, no arithmetic.
 *
 * WHAT WENT, and why it is not coming back: the mid band, the thin outer lap, the overdrive
 * second lap and the arc-riding labels. The mid band and the lap existed for Social and for
 * Portfolio's project hours, both of which the pivot removes; overdrive drew past a
 * threshold that Career does not have; and the labels were solving "which arc is which" for
 * a ring whose parts are now printed in a list directly under it, in the same shades. Three
 * radii and a fan-out relaxation loop were a lot of geometry to say what five lines of text
 * say better.
 *
 * The box is exactly `size × size` — no label pad. That is what lets a 200px ring sit in a
 * 150px column: `width: size, maxWidth: 100%` on the wrapper and `width="100%"` on the SVG
 * scale the whole object down as one thing rather than clipping it, so the chart stays
 * itself on a 1280px laptop instead of reflowing into a different chart.
 */
export function SegmentedRing({
  arcs,
  ghost = false,
  size,
  stroke,
  tone,
  spin = false,
  kick = 0,
  glow = false,
  children,
}: {
  /**
   * One arc each, in order. `ArcView[]` from rings.ts satisfies this exactly — pass
   * `ring.arcs` straight through. Weights sum to 1; `fill` null is a dashed ghost arc.
   */
  arcs: { key: string; weight: number; fill: number | null }[];
  /**
   * The WHOLE ring is a ghost: one dashed full-circle track, no arcs, no fill. Career with
   * no counted goal (spec §1: an empty dashed ghost labelled "no goals", never "0%").
   *
   * A flag rather than an inference from an empty `arcs`, because the two states it would
   * conflate are different statements: "no goal has a deadline" is a fact about the board,
   * and "the fetch has not landed" is a fact about the app. Dashes mean the first.
   */
  ghost?: boolean;
  size: number;
  stroke: number;
  tone: PillarKey;
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
   * Draw the pillar's own lamp behind the donut.
   *
   * A BOOLEAN, exactly as the hero's `bloom` is, and for the same reason: it can be on or off
   * and can never be given a value. A bloom that tracked the fill would say a full ring is a
   * win; a bloom that is identical at 0/8 and 11/8 says only that there is a ring here.
   */
  glow?: boolean;
  children?: ReactNode;
}) {
  const cx = size / 2;
  const cy = size / 2;
  // HEX, not the var() token, because `segmentShade` does arithmetic on it — see TONE_HEX
  // and its must-move-together warning.
  const hue = TONE_HEX[tone];
  const trackId = `lit-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // ONE THICKNESS, ONE RADIUS. Nothing is inset for a band any more, so the donut is drawn
  // at the full box and the stroke is centred on it.
  const r = (size - stroke) / 2;

  /**
   * A point on a ring of radius `rad`. Angles run from twelve o'clock, clockwise.
   *
   * ROUNDED TO THREE PLACES, and that is a correctness fix rather than tidiness. The raw
   * doubles differ in their last bit between Node and the browser's V8 — the server wrote
   * `34.32548372373708` where the client computed `34.325483723737094` — so React saw the
   * two `d` attributes as different text and threw a hydration mismatch, discarding the
   * server's SVG and repainting the whole ring on arrival. It only ever fired once a
   * pillar actually HAD arcs to draw, which is why it slept until the career roadmap put
   * nine dated goals in the Career ring.
   *
   * Three places is ~a thousandth of a pixel on a 200px ring: below what any display can
   * show, and far above what the mismatch needed.
   */
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const at = (turn: number, rad: number) => {
    const a = turn * 2 * Math.PI - Math.PI / 2;
    return [round(cx + rad * Math.cos(a)), round(cy + rad * Math.sin(a))] as const;
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
   * The slices, laid round the circle in order.
   *
   * The weights are taken AS GIVEN — they sum to 1 by the ring builders' construction, and
   * re-normalising them here would be a second opinion about a pillar's shape held in the
   * component that draws it. The gap comes off the END of each slice so arcs never touch,
   * and a null fill never enters the arithmetic: the same guard the single ring uses.
   */
  let cursor = 0;
  const slices = ghost
    ? []
    : arcs.map((a) => {
        const share = Math.max(0, a.weight);
        const start = cursor;
        cursor += share;
        const span = Math.max(0, share - GAP);
        return {
          key: a.key,
          start,
          span,
          dashed: a.fill == null,
          fillSpan: a.fill == null ? 0 : clamp01(a.fill) * span,
        };
      });

  /**
   * THE ROTATION LOOP. Direct DOM writes from one rAF, never React state — a re-render per
   * frame would rebuild every path on two rings at 60fps for a decoration.
   *
   * Two writes per frame per ring: the group's rotation and the gradient's counter-rotation
   * (the lamp stays at twelve — see LitTrack). The centre is republished into `meta` on
   * every render, so a resize changes the geometry under the loop without restarting it.
   */
  const rotRef = useRef<SVGGElement | null>(null);
  const gradRef = useRef<SVGLinearGradientElement | null>(null);
  const hoverRef = useRef(false);
  const boostRef = useRef(0);
  const meta = useRef({ cx, cy });
  meta.current = { cx, cy };

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
        boostRef.current =
          boostRef.current - step < 0.5 ? 0 : boostRef.current - step;
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
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin]);

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, maxWidth: "100%" }}
      // Hover slows the spin — the ring's own feedback, now that the background highlight
      // is gone. On the ring's box rather than the whole header row, so pointing at the
      // TEXT does not read as pointing at the chart.
      onPointerEnter={spin ? () => (hoverRef.current = true) : undefined}
      onPointerLeave={spin ? () => (hoverRef.current = false) : undefined}
    >
      {/* First in DOM order so it paints beneath the arcs. The box is the ring's own size
          now that the label pad is gone, so a centred square of that size lands exactly on
          the donut. */}
      {glow && <PillarBloom size={size} hue={hue} />}
      <svg
        // POSITIONED, so DOM order decides paint order and the bloom lands underneath — the
        // same fix the single ring documents. A static SVG paints in step 7 and the absolutely
        // positioned bloom in step 8, i.e. the lamp over the ring rather than under it.
        className="relative"
        // Scales as one object in a narrow column: the arcs and the gaps shrink together,
        // so the chart stays itself rather than reflowing into a different chart.
        width="100%"
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <LitTrack id={trackId} size={size} gradRef={gradRef} />
        {/* EVERYTHING that belongs to the data rotates as one group, so a turning ring is a
            turning object rather than paint sliding under fixed furniture. The gradient it
            is stroked with counter-rotates (see LitTrack), so the lamp stays at twelve
            o'clock while the object turns beneath it. */}
        <g ref={rotRef}>
          {/* THE WHOLE RING IS A GHOST: one dashed full-circle track and nothing else.
              Career with no counted goal — "no goals" is a statement about the board, and
              dashes are already this app's word for "there is no source here". */}
          {ghost && (
            <path
              d={arcPath(0, 0.9999, r)}
              fill="none"
              stroke={trackStroke(size, trackId)}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${Math.max(2, stroke)} ${Math.max(3, stroke * 1.6)}`}
            />
          )}

          {/* NOT LOADED YET is not NO SOURCE: a plain empty circle, never dashes. The
              fetch landing turns this into arcs; a dashed ring would have said the wire
              was missing and then quietly contradicted itself a moment later. */}
          {!ghost && arcs.length === 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={trackStroke(size, trackId)}
              strokeWidth={stroke}
            />
          )}

          {slices.map((s, i) => (
            <g key={s.key}>
              {/* The slice's own track, so an empty part reads as a part that is empty
                  rather than as an absence. Dashed only when that part has no source. */}
              <path
                d={arcPath(s.start, s.start + s.span, r)}
                fill="none"
                stroke={trackStroke(size, trackId)}
                strokeWidth={stroke}
                strokeLinecap="butt"
                strokeDasharray={
                  s.dashed
                    ? `${Math.max(2, stroke)} ${Math.max(3, stroke * 1.6)}`
                    : undefined
                }
              />
              {/* Mounted UNCONDITIONALLY, and drawn across the whole slice with the fill
                  expressed as a dash offset rather than as a shorter path.

                  The donuts used to pop into existence when /api/rings landed while the
                  adherence ring beside them travelled — the gap was that a shorter path is a
                  different `d`, and `d` is not animatable. pathLength normalises the slice to
                  1 whatever its real length, so the offset is just `1 - fill` and the same
                  .motion-arc that carries the hero's arc carries these.

                  Safe because only TRACKS are ever dashed, for ghosts. The fill path never is,
                  which is the exact conflict the path-based geometry was written to avoid. */}
              <path
                d={arcPath(s.start, s.start + s.span, r)}
                fill="none"
                // One step off the pillar hue per part: same family, distinct members. The
                // DATA is still the arc's length and fill; the colour only says which one
                // this is, and the part list beside it takes the same step at the same
                // index so the legend and the donut cannot disagree.
                stroke={segmentShade(hue, i)}
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
