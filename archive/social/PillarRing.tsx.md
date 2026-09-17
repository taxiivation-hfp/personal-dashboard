# Social in the pillar ring

Parked verbatim from `src/components/PillarRing.tsx` at commit `848d94e` by the owner's ruling of
2026-09-18 (see README.md). Each block below is an exact slice of that file; the heading gives its
original line range.

Two things go together here and the reason is worth stating once. Social's ring was the only one
that needed a SECOND BAND — six event slots on the donut and the events past six on a mid band —
so removing Social also removed the only consumer of the multi-band geometry. `SegmentedRing` is
one thickness and one radius now (spec §1: "No outer laps, no mid band, no overdrive drawing"),
and the mid band is parked here rather than left standing with nothing riding it.

## `src/components/PillarRing.tsx:105-110` — the `social_capital` tone

```tsx
const TONE: Record<PillarKey | "accent", string> = {
  accent: "var(--color-accent)",
  social_capital: "var(--color-social)",
  physical: "var(--color-physical)",
  portfolio: "var(--color-portfolio)",
};
```

## `src/components/PillarRing.tsx:434-447` — the `social_capital` hex, and Portfolio's old Iris

`--color-social` is deleted from `globals.css` by this pass; `--color-portfolio` moves from Iris
`#67609b` to Plum `#7d5a72` (spec §1). The must-move-together warning in the docblock survives in
the live file.

```tsx
/**
 * The DEFAULT pillar hues as hex, because `segmentShade` has to do arithmetic on a colour
 * and `var(--color-social)` is not a number.
 *
 * MUST move with the tokens in globals.css. There is no way to resolve a CSS variable
 * during render that also works server-side — the same constraint that forced
 * --color-accent-rgb to exist beside --color-accent, and this carries the same warning.
 */
export const TONE_HEX: Record<PillarKey | "accent", string> = {
  accent: "#9a6a2e",
  social_capital: "#8c7434",
  physical: "#467c6c",
  portfolio: "#67609b",
};
```

## `src/components/PillarRing.tsx:560-572` — `SegmentedRing`'s `mid` band prop

```tsx
  segments: RingSegment[];
  /**
   * A SECOND full band between the donut and the thin outer lap — medium stroke, its own
   * segments. Social wears the events past its sixth here. The three radii read outward as
   * the standing they encode: the core commitment innermost, the adjacent-but-lesser band
   * around it, the thin extra outermost.
   *
   * A band OUTSIDE the donut is not a bigger target than the donut, and Social's use of it
   * depends on that: what rides here is drawn thinner, which is this file's way of saying
   * "lesser" without a legend. Anything given a shortfall to draw on this band would be
   * making a second quota out of a ring that is meant to read as an aside.
   */
  mid?: RingSegment[];
```

## `src/components/PillarRing.tsx:949-981` — the mid band's rendering

```tsx
          {/* THE MID BAND — the second full ring, between the donut and the thin lap.
              Social's events past its sixth: adjacent to the core commitment but not it,
              which is what the smaller stroke at the larger radius says without a legend.
              Same slice machinery as the donut, so a weight means one thing everywhere. */}
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
```

## `src/components/PillarRing.tsx:1052-1053` — `EventItem`

```tsx
/** One adhered event, as the drill-downs and the band builders both receive it. */
export type EventItem = { date: string; title: string };
```

## `src/components/PillarRing.tsx:1055-1155` — `socialBands`

```tsx
/**
 * THE SOCIAL RING'S BANDS, from the fortnight's adhered events.
 *
 * Inner (main): SIX SLOTS, exactly, one per event against the owner's six-a-fortnight
 * minimum, empty slots drawn as track because the target is real. Mid: the events BEYOND
 * six, always full. Outer thin: outreach against its two.
 *
 * The inner band no longer splits on recurrence, and it no longer GROWS. Both changes
 * follow the same ruling `/api/rings` already made when it stopped scoring the metric on
 * recurring events alone: most of a social life is one-offs, so a band that only the
 * standing kind could fill was a band designed to sit unfilled — the exact shape that keeps
 * the gym off the non-negotiables. Every adhered graphite event now takes a slot, in the
 * order the lists arrive; which of them repeats is still a real fact and is still what the
 * drill-down's two lists are built from, it simply stopped deciding what the ring says.
 *
 * `Math.max(eventsRequired, …)` used to size the inner band, so a busy fortnight quietly
 * added slots and the ring stayed at exactly six-sixths' worth of colour however much
 * happened. That made the threshold invisible: eleven events drew the same full circle as
 * six, in eleven thinner arcs. Six slots, always — the circle IS the minimum, and what the
 * circle looks like when it is met never changes.
 *
 * `null` events mean the calendar could not be read: the band goes ghost, never zero — the
 * same rule the old single slice kept. EITHER list being null ghosts it, because the total
 * is what the band draws and a total missing half its input is not a total. The route
 * writes both or neither, so this only ever fires as a whole.
 */
export function socialBands(
  graphite: EventItem[] | null,
  oneOff: EventItem[] | null,
  outreach: { count: number; required: number },
  eventsRequired: number,
): { segments: RingSegment[]; mid: RingSegment[]; outer: RingSegment[] } {
  // One tally. The two lists arrive split by recurrence because the drill-down reads them
  // that way; the ring does not care, and joining them here is what keeps the ring and the
  // caption beneath it — which prints the same combined count — from disagreeing.
  const events =
    graphite == null || oneOff == null ? null : graphite.length + oneOff.length;

  const segments: RingSegment[] =
    events == null
      ? [{ key: "events", label: "Events", fill: null, weight: 1, ghost: true }]
      : Array.from(
          { length: eventsRequired },
          (_, i): RingSegment => ({
            key: `ev${i}`,
            // One name for the band, on its first slot — six copies would be noise.
            label: i === 0 ? "Events" : undefined,
            fill: i < events ? 1 : 0,
            weight: 1,
            ghost: false,
          }),
        );

  /**
   * THE EXTRAS BAND — one slice per event past the sixth, and it is FULL BY CONSTRUCTION.
   *
   * Every slice is `fill: 1` and there is no remainder, bare or otherwise, so the band has
   * no empty track anywhere on it. That is the entire safeguard: a band with nothing unfilled
   * on it cannot be read as a thing to fill, cannot be got closer to, and cannot become a
   * second target sitting outside the first. It appears at seven events and it looks the same
   * at twenty; only the number of divisions changes, which is the one fact it exists to
   * carry — that there were several, not merely "some". The inner six remains the only band
   * in this pillar with a shortfall drawn on it, and therefore the only one that reads as a
   * quota.
   *
   * It shares the circle rather than keeping the inner band's one-sixth unit, deliberately.
   * A unit-sized extras band would be a partially drawn ring, i.e. a progress bar, and would
   * put a seventh event on the same scale as the six — the very comparison the cap exists to
   * refuse. Absent entirely below seven: a band saying "no extras" is a target announcing
   * itself before anything has happened.
   *
   * This is the band the one-off events used to ride, and it is vacated rather than shared:
   * recurrence no longer draws anything of its own, so nothing is displaced.
   */
  const extras = events == null ? 0 : Math.max(0, events - eventsRequired);
  const mid: RingSegment[] = Array.from(
    { length: extras },
    (_, i): RingSegment => ({
      key: `ex${i}`,
      // Named once, and named flatly. "Extra" is what these are — not a bonus, not a
      // surplus, not a streak; the app has no word for doing well and must not learn one.
      label: i === 0 ? "Extra" : undefined,
      fill: 1,
      weight: 1,
      ghost: false,
    }),
  );

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
```

## `src/components/PillarRing.tsx:1256-1264` — `bandsForPillar`'s `social_capital` branch

`bandsForPillar` itself is gone: with two pillars left, Health's arcs come from `buildHealthRing`
and Career's from `buildCareerRing`, both in `src/lib`, and a screen passes `ring.arcs` straight to
`SegmentedRing`. There is no longer anything for a per-pillar band constructor to decide.

```tsx
  if (pk === "social_capital") {
    const om = ring?.metrics.find((m) => m.key === "outreach");
    return socialBands(
      data.social,
      data.oneOff,
      { count: om?.count ?? 0, required: om?.required ?? 2 },
      METRICS.find((m) => m.key === "social_events")?.required ?? 6,
    );
  }
```
