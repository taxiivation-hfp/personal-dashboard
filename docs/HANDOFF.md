# Handoff — Personal Dashboard

**Date:** 2026-08-05 · **Status:** MVP built locally, compiles clean, not yet deployed, not yet visually verified.

Read `CLAUDE.md` first — it is the constitution. This document is the *state of the build*, not the product philosophy. The one-line version: the app measures **adherence, not accomplishment**; output is deliberately never scored; honest logging outranks every other design goal.

---

## 1. Where it stands

The pivot away from the old accomplishment/XP app is **complete**. The gamification layer is gone from the code path, the three-state block model is the centre of the app, and the whole Today screen has been rebuilt around it.

Verified: `tsc --noEmit` exit 0, `next build` exit 0. Behavioural claims about the calendar column were checked with a pure-function test, not by eye.

### Built

| Area | State |
|---|---|
| **Three-state blocks** (adhered / drifted / skipped) | Built. Marks persist to `block_marks`, one row per (date, event_id). "Drifted" opens an optional reason field that never blocks the mark. |
| **Adherence maths** | Built in `src/lib/adherence.ts`. Denominator = blocks whose time has passed. Returns `null`, not `0`, when nothing is due yet — so an untouched morning doesn't read as failure. |
| **Hero stat + 7-day strip** | Built. Largest number on the screen. Strip is centred on today (today in the middle), upcoming days drawn but empty rather than zero. |
| **Three-column layout** | Built. Left = calendar, middle = the day's work, right = goals + skills. Source order is middle → left → right, which *is* the mobile stack, so the phone needs no reordering. Each column scrolls independently on desktop. |
| **Calendar column** | Built. 9 days centred on today: past above, today in the vertical middle, upcoming below. Each block shows its allocated span on the right as `10am–12pm` — no durations, no relative times. |
| **Non-negotiables** | Built. Plain binary checklist, day-of-week aware via `habits.days_mask` (bit0 = Mon … bit6 = Sun; 127 = every day). Editable at `/habits`. |
| **Goals + subgoals** | Built, read-only in UI as specified. Goal progress is *derived* from the sum of completed subgoal weights — never stored. Weights sum to 100%. Seeded in the data layer. |
| **Skills** | Built, read-only in UI. Time logged **is** the number — no levels, no thresholds, no progression. Parked skills stay visible. |
| **Journal** | Built. Pen-pressure canvas on a lined page, saves the **image only**. No vision transcription, no theme extraction. |
| **Calories** | Built. One manual daily total. No food database, no barcode, no API. |
| **Coach note** | Built. One short observation a day on Haiku, prompted hard against praise *and* scolding — praise for good numbers is what makes bad numbers feel shameful. |
| **Auth** | Built. HMAC session cookie, Edge-safe, escalating lockout (1m → 2m → 4m, capped at 1h) plus a 400ms per-failure delay. |
| **Data migration** | Done and verified. Goals, habit history, gym sessions and Google tokens all preserved; row counts matched after. Backup at `data/backups/dashboard.db.20260803-140723.bak`. |

---

## 2. Live file map

**These are the files that make up the current app** — everything reachable from `src/app/page.tsx`. Roughly 40 files, and that is the entire surface. If a file isn't listed here, §3 explains why.

### Entry points

```
src/app/page.tsx              Today — the only real screen. Server-fetches day view + goals + skills.
src/app/layout.tsx            Root shell, fonts.
src/app/habits/page.tsx       /habits — the one deeper screen. Edit non-negotiables.
src/app/login/page.tsx        Passcode gate.
src/app/globals.css           The whole theme. Light beige tokens, two font weights, contrast verified.
src/proxy.ts                  Session check on every route (Next 16's renamed middleware).
```

### Components

```
src/components/Today.tsx            The three-column shell + middle column. Hero stat, strip,
                                    non-negotiables. `colScroll` at the top owns per-column scrolling.
src/components/CalendarColumn.tsx   LEFT column. 9 days centred on today, per-day adherence, block spans.
src/components/GoalsSkills.tsx      RIGHT column. Goals with subgoal progress, skills with hours logged.
src/components/BlockList.tsx        The three-state marker. The most important component in the app.
src/components/CoachNote.tsx        The one daily observation.
src/components/JournalPanel.tsx     Journal entry list + open/save.
src/components/JournalCanvas.tsx    Pen-pressure drawing surface, DPR-scaled, ruled page.
src/components/CalorieInput.tsx     Single daily number.
src/components/HabitEditor.tsx      Used by /habits only.
```

### Library

```
src/lib/adherence.ts     The committed maths. buildBlocks + adherenceFor. Pure, testable, no DB.
src/lib/engine.ts        All writes. markBlock, setHabit, habit CRUD, journal, calories, skill time, streak.
src/lib/queries.ts       All reads. getDayView, habitsForDate, listGoals, listSkills.
src/lib/google.ts        Calendar OAuth + event fetch over raw REST.
src/lib/dates.ts         ISO date helpers. Imported by 15 files — the most-used module in the repo.
src/lib/auth.ts          HMAC sessions, lockout, redirect safety.
src/lib/db/client.ts     libSQL client + first-run seed.
src/lib/db/schema.sql    Schema. (Still declares some dead tables — see §3.)
```

### API routes

```
/api/today               Day view refresh after any mutation.
/api/adherence           The strip AND the calendar column. Supports ?center= and ?to=.
/api/blocks              Mark / unmark a block.
/api/habits              Habit CRUD.       /api/habits/log   Tick a non-negotiable.
/api/journal             List + create.    /api/journal/[id], /api/journal/[id]/image
/api/calories            Set daily total.
/api/coach/note          Generate the daily observation.
/api/google/connect|callback|disconnect|status
/api/auth/login|logout
/api/up                  Health check, the one route proxy.ts lets through unauthenticated.
```

### Support

```
scripts/migrate.mjs      Schema migration + v2 seed.
scripts/import-gym.mjs   One-off Discord gym-log import.
CLAUDE.md                Product constitution. Read before changing anything.
docs/deploy.md           Fly.io + Turso steps (unused — not deployed).
docs/phone-access.md     Getting the app on the iPhone.
Dockerfile, fly.toml     Deploy config, staged but never run.
```

---

## 3. Not in use — pre-pivot leftovers

Nothing below is imported by anything reachable from `page.tsx`. It's kept as backup and is safe to ignore entirely. **Do not extend or "fix" these files** — several encode the old accomplishment model and will quietly drag it back in.

### Orphaned source files

| File | Why it's dead |
|---|---|
| `src/components/Rings.tsx` | The old pillar progress rings. Points-based. Replaced by the hero adherence stat. |
| `src/lib/pillars.ts` | Only imported by `Rings.tsx`. Also carries the **old dark-theme hex colours**, which contradict the current light beige palette. |
| `src/components/CoachBrief.tsx` | The old morning brief. Replaced by `CoachNote.tsx`. |
| `src/components/CoachChat.tsx` | Full conversational coach. Superseded by the one-observation-a-day model; the coach is meant to be minimal now. |
| `src/lib/coach/coach.ts`, `tools.ts`, `labels.ts` | The tool-use loop, streaming, and tool labels behind `CoachChat`. ~500 lines, all unreachable. |
| `src/app/api/coach/route.ts` | Serves `CoachChat` only. (`/api/coach/note` is live and separate.) |
| `src/components/CalendarToday.tsx` | Old single-day calendar widget. Replaced by `CalendarColumn.tsx`. |
| `src/app/api/calendar/route.ts` | Serves `CalendarToday` only. |
| `src/app/api/goals/*`, `src/app/api/skills/*` | No client calls them — goals and skills render server-side through `page.tsx`. Kept because they're the seeding path if you ever want to write goals without touching SQL. |
| `scripts/db-copy.mjs`, `verify-turso.mjs`, `preflight.mjs` | Turso migration tooling. Only relevant if you deploy. |
| `docs/phase1-design.md` | Describes the pre-pivot app. Historical only. |

### Dead tables in the live DB

Still present, still populated, read by nothing:

```
tasks         6 rows    the old to-do/did list
xp_log        4 rows    the gamification layer
daily_log     4 rows    old per-day rollup
digest_items  11 rows   the cut daily digest
digest_runs   1 row
meals         0 rows    cut when food logging was removed
health_logs   0 rows    step tracking, deferred
```

`pillars` (3 rows) is the exception — still live, but as **categorisation only**, with no scoring attached.

`schema.sql` still declares all of the above. Leaving it that way is deliberate for now: it keeps a fresh DB byte-compatible with the migrated one. Worth cleaning up before the Turso copy, not before.

---

## 4. What's next

**Do these in order.**

1. **Look at it.** The three-column layout, the calendar column, and the strip have *never been seen running*. Three passes of work are verified as compiling and logically correct, and zero passes are verified as looking right. This is the single largest risk in the project and it takes ten minutes to close.
2. **Use it for a week.** `block_marks` has **2 rows**. Every adherence number, every strip bar, and the coach's entire pattern-spotting ability are running on effectively no data. Nothing else should be built until real days are in there — the coach in particular cannot be evaluated on 2 marks.
3. **Delete the dead weight** (§3) once you're confident nothing in it is wanted. Roughly 1,000 lines of unreachable source and 7 dead tables. Do this *after* step 2, not before — if the coach turns out to need more than one note a day, `coach/` is where that lives.
4. **Deploy** — Fly.io + Turso, per `docs/deploy.md`. Everything is staged. Deliberately deferred until the local MVP proved itself, which is what steps 1–2 decide.
5. **Then, and only then**, the deferred features: step tracking via Cloudflare Tunnel, the daily digest, Telegram, Twilio. All were cut on purpose. Re-add one at a time and only if the week of real use makes the case for it.

---

## 5. Known gaps

- **Never visually verified.** Auth gate is on and the browser renderer stopped responding on the last two attempts. If the layout looks wrong on first load, that's the gap — not a regression.
- **Not a git repository.** There's no version history for any of this work, and no way to commit this document. Worth `git init`-ing before the next substantial change.
- **`cloudflared` is not installed** — needed for phone access over the tunnel. It's an executable download, so it needs your go-ahead.
- **Goals and skills are seed-only.** No editing UI, by decision. Changing them means editing the data layer.
- **The coach is unproven.** The prompt is written correctly against the honest-logging rule, but it has never had enough drift data to produce a real pattern observation.
