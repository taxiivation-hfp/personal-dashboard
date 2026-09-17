# Social in the pillar column

Parked verbatim from `src/components/PillarSections.tsx` at commit `848d94e` by the owner's ruling
of 2026-09-18 (see README.md). Each block below is an exact slice of that file; the heading gives
its original line range.

The column showed three pillars and opened one at a time. It shows TWO now, side by side, and the
Social third is what paid for the layout change: two rings fit across the Recent window where three
had to stack.

## `src/components/PillarSections.tsx:69-75` — the local name and order maps

Both maps are gone rather than merely shortened: display names now come from `PILLAR_NAME` in
`src/lib/rings.ts` and the order from `PILLAR_ORDER` beside it, so a screen cannot disagree with
the record about what a pillar is called.

```tsx
const PILLAR_NAME: Record<PillarKey, string> = {
  social_capital: "Social",
  physical: "Physical",
  portfolio: "Portfolio",
};

const ORDER: PillarKey[] = ["social_capital", "physical", "portfolio"];
```

## `src/components/PillarSections.tsx:253-259` — the two event-list props

Their only writer was `Today.tsx`'s `loadRings` (parked in `Today.tsx.md`), and their only readers
were the Social ring's bands and the Events drill-down below.

```tsx
  /** The fortnight's ADHERED graphite events — the Social ring's inner band and the
   *  Events drill-down. null while loading or when Google could not be reached — those
   *  are different statements from an empty fortnight, and the ring goes ghost. */
  socialEvents: EventItem[] | null;
  /** The adhered ONE-OFF social events — the Social ring's mid band. Same graphite as
   *  the standing ones; what separates them is that these do not repeat. */
  oneOffEvents: EventItem[] | null;
```

## `src/components/PillarSections.tsx:928-934` — what opened a drill-down

The surviving Health rows drill on `workoutKind` alone. `social_events` was the one metric whose
fortnight was a list of things the app did not own — calendar entries, with no document to open —
which is why the list below hands every event `id: null`.

```tsx
                      // Hoisted out of the JSX: TypeScript drops a property narrowing the
                      // moment it crosses into a callback, and the onClick below is one.
                      const kind = m.workoutKind;
                      // Which rows open into their fortnight: the three session kinds and
                      // the calendar's events. Outreach and skills are ticks and minutes —
                      // there is no document behind them to show.
                      const drills = Boolean(kind) || m.key === "social_events";
```

## `src/components/PillarSections.tsx:951-985` — the `fortnight` builder, both halves

Only the event half is parked; the session half (`kind ? …`) survives in the live file, unchanged,
as the Strength and Cardio drill-down. It is quoted whole here because the two halves were one
conditional expression and the event branch is unreadable cut out of it.

```tsx
                      const fortnight:
                        | { key: string; date: string; title: string; id: number | null }[]
                        | null =
                        !drilled
                          ? null
                          : kind
                            ? gymLog == null
                              ? null
                              : gymLog
                                  .filter(
                                    (s) =>
                                      s.kind === kind &&
                                      s.date >= windowFrom &&
                                      s.date <= date,
                                  )
                                  .map((s) => ({
                                    key: `s${s.id}`,
                                    date: s.date,
                                    title:
                                      sessionTitle(s) || "untitled session",
                                    id: s.id,
                                  }))
                            : socialEvents == null
                              ? null
                              : [
                                  ...socialEvents,
                                  ...(oneOffEvents ?? []),
                                ]
                                  .sort((a, b) => b.date.localeCompare(a.date))
                                  .map((e, i) => ({
                                    key: `e${i}`,
                                    date: e.date,
                                    title: e.title,
                                    id: null,
                                  }));
```
