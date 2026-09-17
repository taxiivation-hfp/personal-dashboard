# Social — parked, not deleted

**Parked by the owner's ruling of 2026-09-18** (the Health & Career pivot,
`docs/superpowers/specs/2026-09-18-health-career-pivot-design.md`, §1). The owner asked for
this code to be kept, not deleted. It lives here, outside `src/`, so nothing compiles it,
nothing imports it, and Tailwind does not scan it for classes (`@source not` in
`src/app/globals.css`; `archive` is also in `tsconfig.json`'s `exclude`).

## What Social was

The first of three pillar rings — Social / Physical / Portfolio — over a rolling 14-day
window. It filled from two sources:

- **Outreach** — the `outreach` non-negotiable (`habits.system_key='outreach'`), counted as
  distinct days ticked, 2 per fortnight, drawn as the ring's outer lap.
- **Events** — calendar events in **Graphite** (Google `colorId "8"`) that were marked
  ADHERED, 6 per fortnight. They were counted live from Google in `/api/rings` (never
  persisted), split into standing and one-off lists by `CalEvent.recurring`, and drawn as six
  donut slots plus an "Extra" mid band for events past six. On a calendar failure the count
  stayed undefined so the ring went ghost rather than reporting a false zero.

Productivity scored Graphite at nothing because "seeing people is a pillar".

## Why it was parked

Socialising "comes naturally in between blocks" and is no longer planned or tracked. The
app now has two pillars, **Health** (`physical`) and **Career** (`portfolio`). Graphite events
are ignored everywhere (block list, adherence hours, hours worked) by one rule in
`src/lib/adherence.ts` (`isBlockEvent`).

The data stays: the `pillars` row `social_capital` is kept because goals, habits and tasks
reference it, and every pillar listing filters it out. The Outreach habit moved to Career
and keeps its history.

## What is here

One file per source file, each block an exact slice of that file at commit `c86f000` with
its original line range:

| File | Came from |
|---|---|
| `rings.ts.md` | `src/lib/rings.ts` — the `social_capital` key, the outreach and social_events metrics, the `calendar_social` source, the Social caption |
| `rings.test.ts.md` | `src/lib/rings.test.ts` — the tests that pinned them |
| `api-rings-route.ts.md` | `src/app/api/rings/route.ts` — the whole route: graphite counting, the recurrence split, the event lists (and the Basil project-hours lap, which went with the same loop) |
| `queries.ts.md` | `src/lib/queries.ts` — `eventWorkIn`, the outreach fact, the external calendar counts in `getRingCounts` |
| `google.ts.md` | `src/lib/google.ts` — `CalEvent.recurring`, whose only reader was the Social ring |
| `productivity.ts.md`, `productivity.test.ts.md` | Graphite's "a pillar, so no points" rationale and its test |

The UI half of Social (`socialBands` and the mid band in `PillarRing.tsx`, the Events drill
in `PillarSections.tsx`, the event-list state in `Today.tsx` and `Dashboard.tsx`) is parked
here by whoever removes it from those components, on the same one-file-per-source pattern.
