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
  size,
  stroke,
  tone,
  children,
}: {
  fill: number | null;
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
          stroke="var(--color-panel-2)"
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
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
      )}
    </div>
  );
}
