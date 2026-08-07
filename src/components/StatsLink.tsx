"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The way through to /stats, sitting under the three pillar rings.
 *
 * It PREVIEWS rather than merely pointing. A row that said "Stats →" would be a link taking
 * up the height of a chart; showing the fortnight it leads to earns that height, and a
 * fourteen-day sparkline is small enough that it cannot be mistaken for the hero.
 *
 * WHAT IT DRAWS IS ADHERENCE, not productivity. The stats page opens on adherence, so the
 * preview is the first thing you will see when you arrive — a preview of something else
 * would be a promise the destination does not keep.
 *
 * No number is printed. This is a shape, not a reading: the figures live one tap away, and
 * a percentage here would make a quiet link into a fourth measurement on a screen that
 * already has three.
 */

/** Two weeks — the same window the rings above it use, so the row is one fortnight. */
const DAYS = 14;

type StripDay = { date: string; pct: number };

export default function StatsLink({ date }: { date: string }) {
  const [days, setDays] = useState<StripDay[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/adherence?days=${DAYS}&to=${date}`)
      .then((r) => r.json())
      .then((d) => alive && !d.error && setDays(d.days ?? []))
      .catch(() => alive && setDays([]));
    return () => {
      alive = false;
    };
  }, [date]);

  return (
    <Link
      href="/stats"
      className="group -mx-2 mt-2 flex shrink-0 items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-[var(--color-panel)]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-small font-semibold">The record</span>
        <span className="mt-0.5 block text-micro text-[var(--color-muted)]">
          adherence, hours, weight, calories
        </span>
      </span>

      {/* A row of hairlines rather than a chart: the same bar shape the week strip uses, at
          a size where only the silhouette survives. Each rises on a stagger — the one piece
          of sequenced motion in the app, allowed here because this is the one element whose
          job is to be noticed.

          A CSS ANIMATION, never a state flip. The first version set the bars to scaleY(0)
          and flipped them on in a requestAnimationFrame, which does not fire in a hidden tab
          — so the row shipped blank to anyone who opened the app in a background tab, and to
          any headless renderer. The resting state is now the VISIBLE one and the animation is
          pure decoration on top: if it never runs, the bars are simply there. */}
      <span
        aria-hidden
        className="flex h-7 shrink-0 items-end gap-[2px]"
        style={{ width: DAYS * 5 }}
      >
        {(days ?? []).map((d, i) => (
          <span
            key={d.date}
            className="motion-spark block w-[3px] origin-bottom rounded-[1px]"
            style={{
              height: `${Math.max(d.pct, 4)}%`,
              background:
                i === (days?.length ?? 0) - 1
                  ? "var(--color-accent)"
                  : "var(--color-line-strong)",
              // 18ms apart: fourteen bars land inside 250ms, so the whole gesture is over
              // before it can become something you wait for.
              animationDelay: `${i * 18}ms`,
            }}
          />
        ))}
      </span>

      {/* Travels on hover, and only on hover — a pointer is the one input that can say
          "considering this" without committing. Nothing here moves on a phone. */}
      <span
        aria-hidden
        className="motion-slide shrink-0 text-micro text-[var(--color-muted)] group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
