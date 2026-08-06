# Handoff — Personal Dashboard

**Date:** 2026-08-06 (round three) · **Status:** MVP built locally, **visually verified in the browser**, not yet deployed. Goals/skills/rings complete, plus a second round: adherence v2, workout types, journal text, phone tabs and editable pillar colours. The app is a git repository.

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
| **Goals + subgoals** | Built and **fully editable**. Subgoals tick inline on Today; `/goals` handles create/rename/delete/weights. Progress is *derived* from completed subgoal weights (`src/lib/goals.ts`), never stored. `weight = 0` means AUTO — an equal share of what the explicit overrides leave. Quarantined: feeds nothing else. |
| **Skills** | Built. The live number is a **rolling 14-day window**; lifetime is secondary. `+15/+30/+60` quick-add and undo log time inline — before this there was no way to log at all. Still no levels, no thresholds, no progression. Parked skills stay visible and their sessions count. |
| **Journal** | Built. Pen-pressure canvas on a lined page, saves the **image only**. No vision transcription, no theme extraction. |
| **Calories** | Built. One manual daily total. No food database, no barcode, no API. |
| **Coach note** | Built. One short observation a day on Haiku, prompted hard against praise *and* scolding — praise for good numbers is what makes bad numbers feel shameful. |
| **Auth** | Built. HMAC session cookie, Edge-safe, escalating lockout (1m → 2m → 4m, capped at 1h) plus a 400ms per-failure delay. |
| **Adherence v2** | Built. Non-negotiables count toward the rate, weighted equally with blocks, due at an evening cutoff (`app_meta['habit_cutoff']`, default 21:00). `adherence_habits_since` keeps history blocks-only so past days are not rewritten. |
| **Workout types** | Built. Strength 8/14 · Cardio 2/14 · Misc **tracked but not scored**. `gym_sessions` is unique on (date, kind). Physical is a weighted mean, 0.8/0.2. |
| **Overdrive** | Built, **visual only** — a second translucent lap past the threshold that never enters the pillar mean. A test asserts no amount of strength fills Physical alone. |
| **Journal text** | Built. `kind` + `body`; a text page stores `image=''`. Both kinds share one ruled A4 (1:1.414) sheet. Deleting asks first. |
| **Phone tabs** | Built. Three tabs below `lg` with a bottom bar and swipe, opening on the day's work. Only the active pane mounts. |
| **Workout documents** | Built. Each kind opens its own free-text note; saving is logging. Imported Discord sessions carry a title and are not deletable from the UI. |
| **Daily weight** | Built. `habits.input='number'` + `unit`; value in `habit_entries.value`, counts toward adherence like any tick. |
| **Design system** | Built. Motion/duration/z-index tokens and an 8-step type spine in `globals.css`; `PRODUCT.md` carries the register and scene for design tooling. |
| **Pillar colours** | Built. `/colours`, curated palette only; the engine refuses anything outside it. Applies to rings, goals, skills, workout chips and non-negotiables. |
| **Pillar rings** | Built. Three sufficiency rings over a rolling 14 days, capped — see CLAUDE.md. Adherence is drawn as a large amber ring with the number inside; pillar rings are small, hued and thin, with the real count printed below. Physical carries gym (live) and steps (dashed ghost, no source). |
| **Data migration** | Done and verified twice. Goals, habit history, gym sessions and Google tokens all preserved; row counts matched after each. Backups at `data/backups/dashboard.db.20260803-140723.bak` and `…20260805-133149.bak`. |
| **Tests** | `npm test` — `node --test` on Node 24, zero dependencies. 30 tests over `rings.ts`, `goals.ts`, `dates.ts`. |

---

## 2. Live file map

**These are the files that make up the current app** — everything reachable from `src/app/page.tsx`. Roughly 40 files, and that is the entire surface. If a file isn't listed here, §3 explains why.

### Entry points

```
src/app/page.tsx              Today — the only real screen. Server-fetches day view + goals + skills.
src/app/layout.tsx            Root shell, fonts.
src/app/habits/page.tsx       /habits — edit non-negotiables.
src/app/goals/page.tsx        /goals — edit goals, subgoals and weight overrides.
src/app/colours/page.tsx      /colours — pick pillar hues from the curated palette.
src/app/login/page.tsx        Passcode gate.
src/app/globals.css           The whole theme. Light beige tokens, two font weights, contrast verified.
src/proxy.ts                  Session check on every route (Next 16's renamed middleware).
```

### Components

```
src/components/Today.tsx            The three-column shell + middle column. Hero stat, strip,
                                    non-negotiables. `colScroll` at the top owns per-column scrolling.
src/components/CalendarColumn.tsx   LEFT column. 9 days centred on today, per-day adherence, block spans.
src/components/PillarSections.tsx   RIGHT column. Three pillar sections, each ring-led, with that
                                    pillar's goals and skills beneath. Replaced GoalsSkills.tsx.
src/components/PillarRing.tsx      One SVG ring, both species. Guards fill===null before any arc
                                    maths. Draws overdrive as a second translucent lap.
src/components/PhoneTabs.tsx       Bottom tab bar + swipe. Renders nothing above `lg`.
src/components/WorkoutLog.tsx      One workout document per (date, kind).
src/components/JournalText.tsx     Typed page, sharing the canvas's ruled geometry.
src/components/ColourEditor.tsx    Used by /colours only.
src/components/GoalEditor.tsx       Used by /goals only.
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
src/lib/rings.ts         Ring registry, weighted pillar means, capped fill + overdrive, and
                         the curated pillar palette. ZERO IMPORTS so `node --test` runs it.
                         Owns PillarKey and WorkoutKind; queries.ts re-exports PillarKey.
src/lib/adherence.ts     Also owns habitsDueOn + the habit tally. Imports ./dates.ts with an
                         EXPLICIT extension so node --test can resolve it — keep it that way.
src/lib/goals.ts         Subgoal weight derivation. Zero imports. 8 tests.
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
/api/rings               Ring counts + fills + gymToday. Anchored to the viewed date.
/api/goals, /api/goals/[id]        Goal CRUD.        LIVE — no longer dead.
/api/subgoals, /api/subgoals/[id]  Subgoal CRUD.
/api/skills/[id]/time    Log time (POST) / undo (DELETE).
/api/gym                 Toggle a workout kind for a date.
/api/pillars             Read pillars / set a pillar colour.
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
| `src/lib/pillars.ts` | Only imported by `Rings.tsx`. Also carries the **old dark-theme hex colours**, which contradict the current light beige palette. NOT used by the new rings — `src/lib/rings.ts` is a separate, unrelated module. Do not confuse the two. |
| `src/components/CoachBrief.tsx` | The old morning brief. Replaced by `CoachNote.tsx`. |
| `src/components/CoachChat.tsx` | Full conversational coach. Superseded by the one-observation-a-day model; the coach is meant to be minimal now. |
| `src/lib/coach/coach.ts`, `tools.ts`, `labels.ts` | The tool-use loop, streaming, and tool labels behind `CoachChat`. ~500 lines, all unreachable. |
| `src/app/api/coach/route.ts` | Serves `CoachChat` only. (`/api/coach/note` is live and separate.) |
| `src/components/CalendarToday.tsx` | Old single-day calendar widget. Replaced by `CalendarColumn.tsx`. |
| `src/app/api/calendar/route.ts` | Serves `CalendarToday` only. |

| `scripts/db-copy.mjs`, `verify-turso.mjs`, `preflight.mjs` | Turso migration tooling. Only relevant if you deploy. |
| `docs/phase1-design.md` | Describes the pre-pivot app. Historical only. |

### Dead tables in the live DB

Still present, still populated, read by nothing:

```
tasks         6 rows    the old to-do/did list. Its 3 kind='gym' rows were COPIED into
                        gym_sessions by the rings_v1 migration; the originals stay here.
xp_log        4 rows    the gamification layer
daily_log     4 rows    old per-day rollup
digest_items  11 rows   the cut daily digest
digest_runs   1 row
meals         0 rows    cut when food logging was removed
health_logs   0 rows    step tracking, deferred
```

`pillars` (3 rows) is the exception — still live, as **categorisation only**, and it now also
groups the right column into its three ring-led sections. No scoring is attached.

`gym_sessions` (3 rows) is new and live: one row per gym DAY, unique on date, feeding the
Physical ring.

`schema.sql` still declares all of the above. Leaving it that way is deliberate for now: it keeps a fresh DB byte-compatible with the migrated one. Worth cleaning up before the Turso copy, not before.

---

## 4. What's next

**Do these in order.**

1. ~~**Look at it.**~~ **Done.** Rendered and checked in the browser on 2026-08-05: three-column layout, calendar column, strip, adherence ring, all three pillar rings and their states, `/goals`. No console or server errors. The ring track colour was fixed as a result (see git history). **Still unchecked on the actual iPhone** — the layout was verified structurally at 390px, not on the device.
2. **Use it for a week.** `block_marks` has **2 rows**. Every adherence number, every strip bar, every ring and the coach's entire pattern-spotting ability are running on effectively no data. Nothing else should be built until real days are in there. The ring thresholds in particular (`skills` at 4 sessions/14d especially) were set from intent, not evidence, and are meant to be retuned once there is some.
3. **Delete the dead weight** (§3) once you're confident nothing in it is wanted. Roughly 1,000 lines of unreachable source and 7 dead tables. Do this *after* step 2, not before — if the coach turns out to need more than one note a day, `coach/` is where that lives.
4. **Deploy** — Fly.io + Turso, per `docs/deploy.md`. Everything is staged. Deliberately deferred until the local MVP proved itself, which is what steps 1–2 decide.
5. **Then, and only then**, the deferred features: step tracking via Cloudflare Tunnel, the daily digest, Telegram, Twilio. All were cut on purpose. Re-add one at a time and only if the week of real use makes the case for it.

---

## 5. Known gaps

- **Not verified on the phone.** Verified in a desktop browser and structurally at 390px width, but never on the actual iPhone. The tab bar, swipe and safe-area padding in particular have only been reasoned about, not felt.
- **Google Calendar is currently rejecting the token** (401 despite a present refresh token and an unexpired access token — most likely revoked, or a Testing-mode consent screen expiring it). Reconnect at `/api/google/connect`. The app now degrades instead of dying: a calendar auth failure renders the day without blocks rather than blanking the screen.
- **Habit schedule is not versioned.** `active` and `days_mask` are read as they are now, so editing a habit reshapes adherence for days after `adherence_habits_since`. Accepted: the start stamp bounds it, and a history table for one user is not worth it.
- **`cloudflared` is not installed** — needed for phone access over the tunnel. It's an executable download, so it needs your go-ahead.
- **The coach is unproven.** The prompt is written correctly against the honest-logging rule, but it has never had enough drift data to produce a real pattern observation.
