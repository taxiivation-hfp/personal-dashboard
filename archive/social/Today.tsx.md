# Social on the dashboard

Parked verbatim from `src/components/Today.tsx` at commit `848d94e` by the owner's ruling of 2026-09-18 (see README.md).
Each block below is an exact slice of that file; the heading gives its original line range.

The two event lists were state Today.tsx held only to hand down to `PillarSections` — the Social
ring's two bands and the Events drill-down. Nothing else on the screen read them, so they went
with the props that consumed them (see `PillarSections.tsx.md`).

## `src/components/Today.tsx:254-263` — the two event lists

```ts
  /** The fortnight's ADHERED graphite events — the Social ring's inner band and its
   *  drill-down. null until /api/rings lands or when the calendar could not be reached. */
  const [socialEvents, setSocialEvents] = useState<
    { date: string; title: string }[] | null
  >(null);
  /** The adhered ONE-OFF social events — the Social ring's mid band. Same graphite as
   *  the standing ones; what separates them is that these do not repeat. */
  const [oneOffEvents, setOneOffEvents] = useState<
    { date: string; title: string }[] | null
  >(null);
```

## `src/components/Today.tsx:509-512` — their reads inside `loadRings`

The `?? null` is the ghost rule reaching the screen: `/api/rings` left these UNDEFINED when Google
could not be reached, so the drill-down said "unavailable" instead of reporting a fortnight with no
events in it.

```ts
        // undefined on a calendar failure, and passed through as such — the Events
        // drill-down says "unavailable" rather than showing an empty fortnight.
        setSocialEvents(s.socialEventList ?? null);
        setOneOffEvents(s.oneOffEventList ?? null);
```
