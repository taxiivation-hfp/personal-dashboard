# Partial adherence — a worked fraction on a drifted block

**Date:** 2026-08-13
**Status:** approved, ready to implement

## The ask

Marking a block **Drifted** should offer a slider, 0–100%, for how much of it was actually
worked.

## Why it fits, and what it changes

Adherence's block share is already a statement about HOURS — *blocked hours worked ÷
blocked hours in the day* — but the only fractions it can express today are 0 and 1. An
afternoon where the first forty minutes went as planned and the rest did not is recorded as
if nothing happened, and the figure understates a day that was genuinely half-lived.

The change worth stating plainly, because it moves a rule in CLAUDE.md: **drift starts
adding.** Until now "drift is not punished, it just does not add"; now it adds exactly the
part of it you worked. That strengthens the climbing-figure argument rather than weakening
it — the number still only ever goes up, and it now goes up for hours that really happened.
What drift still does not do is pay for the part you drifted.

## Owner's rulings

1. **The fraction is HOURS, and hours count wherever hours are counted** — the adherence
   ring, the productivity score, and the Portfolio project-hours lap. The Social ring is
   untouched: it counts *events*, and half a night out is not a thing.
2. **The slider appears beside the reason, on every drift.** Tap Drifted → the mark saves
   instantly at 0% → the afterthought row opens with the slider above the reason line. Both
   controls optional, `skip` dismisses the row. A drift is still completable in one tap.
3. **100% converts the mark to Adhered.** At 100 the arithmetic is already identical to
   adhered; leaving it labelled "Drifted" would have the record arguing with itself and the
   coach counting a drift against a block worked in full.
4. **Architecture A** — a fraction on the mark plus one shared rule module, over five
   hand-written copies of the same state table.

Decided in passing: the slider steps in **5%**, and the readout prints both the percentage
and the real figure (`40%` · `48 min of 2h`), because this app always prints the real number
under the shape.

## 1 · Data model

### `block_marks.worked_fraction REAL`

```sql
worked_fraction REAL CHECK (worked_fraction IS NULL
                            OR (worked_fraction >= 0 AND worked_fraction <= 1))
```

Added through the idempotent `has()` / `ALTER TABLE ADD COLUMN` pattern already in
`db/client.ts`, and declared in `schema.sql` so a fresh database stays byte-compatible with
a migrated one. **No `migrate.mjs` block and no backup step** — adding a nullable column
cannot lose a row.

**NULL, not `DEFAULT 0`.** For a drift the two are arithmetically identical, so this is
purely about truth: NULL means *nobody was asked*, 0 means *you said none of it*. Every
drift already in the table is the former, and defaulting them to 0 puts words in the
owner's mouth retroactively.

**Named `worked_`, not `adhered_`.** "Adhered" is a *state* here; an `adhered_fraction`
column on a row whose `state` is `'drifted'` is the record contradicting itself. "Worked" is
already the app's own word for this quantity.

### `src/lib/worked.ts` — new, import-free

```ts
export type BlockState = "adhered" | "drifted" | "skipped" | "dismissed";

export function workedFraction(state, stored): number {
  if (state === "adhered") return 1;
  if (state !== "drifted") return 0;   // skipped, dismissed, unmarked
  return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 0;
}
```

One definition, five consumers. It becomes the home of `BlockState`, currently declared
verbatim three times (`adherence.ts`, `productivity.ts`, `engine.ts`); all three import it
instead.

`productivity.ts` goes from zero imports to one import of a zero-import module. The property
that matters — runs under `node --test` with no setup — survives, exactly as `adherence.ts`
importing `./dates.ts` already proves. Its header comment is rewritten to say so rather than
left to become false.

The `COUNTED_STATES` argument moves into `worked.ts` **in full**, with a one-line pointer
left where it was. That comment is one of the better arguments in the codebase and its
reasoning survives the change intact: a drift still pays nothing for the part you drifted.

### Writing it

`engine.markBlock` gains `worked_fraction`, which **inherits the reason's rule on the line
below it** — it only ever belongs to a drift, and is nulled on any other state, so a
fraction can never survive onto an "adhered" mark.

**The 100% conversion lives in `engine.ts`**, per CLAUDE.md's rule that anything the model
must not be trusted to get right belongs there inside the write. `markBlock` normalises
`drifted @ 1.0` → `adhered`, which clears the reason as a *consequence* of the existing rule
rather than as a second special case. `/api/blocks` returns the **resulting** state, and the
client closes its row on that answer rather than deciding for itself.

## 2 · The maths — five readers, one rule

| Reader | Change |
|---|---|
| `adherence.ts` | `adheredHours` → `hours × workedFraction(...)`. `totalHours` unchanged. |
| `productivity.ts` | `COUNTED_STATES.includes(state)` → `const w = workedFraction(...); if (w <= 0) continue;` and `minutes × w`. |
| `queries.ts` | `adheredEventIds` → `eventWorkIn(db, from, to): Map<id, {state, worked}>` — one query, both ring consumers. |
| `/api/rings` | Project hours `× worked`. Social stays `state === 'adhered'` strictly. |
| `/api/productivity` | `ignoredReason` gains the fraction. |

**The counts do not change.** `adhered` / `drifted` / `skipped` / `unmarked` still tally by
state — a partial drift is still a drift on the record and still a drift to the coach.
Only the HOURS are fractional.

**`Adherence.adheredHours` is renamed `workedHours`.** It now includes hours from blocks
that are not adhered, so the old name becomes false at exactly the moment someone trusts it.
One call site (`Today.tsx`).

**Productivity's segment `minutes` become WORKED minutes**, so the workings read
`48 min × 1.0 = 80 pts` and cannot disagree with the bar they exist to explain. Worked
minutes are accumulated exactly and rounded once, at the segment.

**The "didn't count" list keeps meaning *minutes that earned nothing*.** A partial block
appears there for its **forfeited portion only** — `minutes = 120 × 0.6 = 72`, reason
`"drifted — the other 60% went elsewhere"`. A fully drifted block is unchanged, in the same
words; an adhered one is still absent. The colour and duration checks stay **ahead** of the
partial branch in the order, since an unlisted colour earns nothing whatever the slider says.

**The coach needs no wiring.** `getDayView` returns `buildBlocks(...)` wholesale, so once
`Block` carries `workedFraction` the coach sees it. `loadMarks` picks up the column;
`recent_blocks`' SELECT gains it.

## 3 · The control

Inside the existing afterthought row in `BlockList`, above the reason line:

```
09:00   Deep work: Basil                    undo
11:00
        [ Drifted ]

        how much of it did you work?
        ────────●──────────────────  40%
        48 min of 2h

        What happened instead? (optional)
        ________________________  [ Save ]  skip
```

- **A native `<input type="range">`**, step 5, styled in `globals.css` beside the
  number-field rules. Native because it is the one control here that must feel like a
  physical drag on a phone, and nothing hand-rolled tracks a thumb as well.
- **The filled track is `--color-accent`.** The app's single accent, and the same amber as
  the ring this fraction feeds. The empty track is `--color-line-strong`. No new hue, no
  glow, no shadow.
- **Neutral copy.** *how much of it did you work?* — a question about time, not about
  whether you should have. No red, no "only".
- **The readout prints the real figure**: `40%` beside the track, `48 min of 2h` under it.
  When the block has no known duration the minutes line is omitted rather than guessed.
- **Saving is on release, not on drag.** Local state follows the thumb; the POST fires on
  `pointerup` / `keyup` / `blur`, plus on the reason's Save. A range input fires `change` on
  every pixel and one write per pixel is a write storm.
- **Tapping the Drifted chip reopens the row**, prefilled. A slider you cannot correct is
  worse than no slider — the same argument the weight reading already won.
- **Read-back keeps the chips identical in size.** The percentage is muted text *beside* the
  chip, in front of the reason, not inside it: `[Drifted]  40% worked · got pulled into a
  meeting`.
- **The calendar column is untouched.** Its dot still says "drifted", which is still true; a
  third dot form would be a severity ramp for six pixels.

## 4 · Tests

`worked.test.ts` pins the rule once, exhaustively: every state, plus `null` / `undefined` /
`NaN` / out-of-range clamping. `adherence.test.ts` and `productivity.test.ts` then only test
their own arithmetic instead of each re-asserting the state table.

New cases:

- a partial drift adds hours in proportion, and a drift at 0 still adds nothing (the
  existing "drift and skip do not subtract" test must keep passing verbatim)
- a partial drift cannot exceed the block it is part of
- productivity pays a partial block at its colour's rate on the worked minutes only
- an unlisted colour still scores nothing at any fraction
- the segment's `minutes` are the worked minutes, not the scheduled ones

## 5 · Not in scope

- No fraction on `skipped` — skipped means it did not happen.
- No fraction on `adhered` — that is what drifted is for, and an adhered block adjustable
  downward would be two controls for one fact.
- No change to the Social ring, the streak, goals or the journal.
- No new chart, no history of fractions over time. The record is the day.
