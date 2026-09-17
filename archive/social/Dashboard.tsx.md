# Social on the record

Parked verbatim from `src/components/Dashboard.tsx` at commit `848d94e` by the owner's ruling of
2026-09-18 (see README.md). Each block below is an exact slice of that file; the heading gives its
original line range.

The record drew the same three rings the Today column did, from the same `/api/rings` payload —
so the Social half of it was the same three pieces of state, read in the same effect, plus the
`social_capital` row in this file's own copy of the pillar names.

## `src/components/Dashboard.tsx:79-84` — the local pillar name and order maps

The record kept its own copies rather than importing them. Both now come from `PILLAR_NAME` and
`PILLAR_ORDER` in `@/lib/rings`, which is the one place a pillar is named.

```tsx
const PILLAR_NAME: Record<PillarKey, string> = {
  social_capital: "Social",
  physical: "Physical",
  portfolio: "Portfolio",
};
const ORDER: PillarKey[] = ["social_capital", "physical", "portfolio"];
```

## `src/components/Dashboard.tsx:178-181` — the band data the fortnight rings drew from

`EventItem` came from `PillarRing.tsx` and `SkillSlice` from `@/lib/queries`; both lists fed
`bandsForPillar`, which built the Social donut's six event slots, its "Extra" mid band and
Portfolio's per-skill segments.

```tsx
  /** The band data the fortnight rings draw from — same feed the Today column reads. */
  const [socialEvents, setSocialEvents] = useState<EventItem[] | null>(null);
  const [oneOffEvents, setOneOffEvents] = useState<EventItem[] | null>(null);
  const [skills14, setSkills14] = useState<SkillSlice[] | null>(null);
```

## `src/components/Dashboard.tsx:205-207` — the three reads inside the `/api/rings` effect

`/api/rings` no longer returns any of these three fields — the whole route is parked in
`api-rings-route.ts.md`.

```tsx
        setSocialEvents(d.socialEventList ?? null);
        setOneOffEvents(d.oneOffEventList ?? null);
        setSkills14(d.skills14 ?? null);
```
