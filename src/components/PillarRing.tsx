"use client";

import type { ReactNode } from "react";
import type { PillarKey } from "@/lib/queries";

/**
 * One ring. Two species use it, and they MUST stay visually distinct — otherwise today's
 * adherence reads as one more quota to fill, and the quota rings borrow adherence's
 * authority:
 *
 *   adherence — large, amber, thick stroke, number INSIDE
 *   pillar    — small, pillar-hued, thin stroke, fact line BELOW (never a percentage)
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

export default function Ring({
  fill,
  overdrive = null,
  size,
  stroke,
  tone,
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
  children?: ReactNode;
}) {
  // Guard clause, not a fallback expression: null must never enter the arithmetic.
  const ghost = fill == null;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = ghost ? 0 : c * Math.min(1, Math.max(0, fill));
  const over = ghost || overdrive == null ? 0 : c * Math.min(1, Math.max(0, overdrive));

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
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
          strokeDasharray={ghost ? `${Math.max(2, stroke)} ${Math.max(3, stroke * 1.6)}` : undefined}
        />
        {!ghost && dash > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={TONE[tone]}
            strokeWidth={stroke}
            // BUTT, never round: round caps add half a stroke width at each end, which
            // makes the smallest non-zero fills read as roughly half again their true
            // value. The ring would overstate exactly where honesty matters most.
            strokeLinecap="butt"
            strokeDasharray={`${dash} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray 400ms ease" }}
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
            stroke={TONE[tone]}
            strokeWidth={Math.max(1, stroke * 0.42)}
            strokeLinecap="butt"
            strokeDasharray={`${over} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ opacity: 0.45, transition: "stroke-dasharray 400ms ease" }}
          />
        )}
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
      )}
    </div>
  );
}
