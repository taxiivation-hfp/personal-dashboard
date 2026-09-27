# Demo mode — placeholder history for showing the app, and an exact way back

`scripts/demo-mode.mjs` fills the last 30 days with a believable "consistent user" so the dashboard
can be shown in an interview, and takes it all back afterwards. It works from **any machine** that
has the live credentials: the undo record lives in the production database itself
(`app_meta` key `demo_mode`), so you can switch it on at home and off from a laptop.

## Setup (once per machine)

The script reads `.env.seed` first, then `.env.local` (real environment variables win), the same as
`scripts/seed-roadmap.mjs`. It needs:

| Variable | What |
|---|---|
| `DATABASE_URL` | the production Turso URL (`libsql://…`) — it refuses a `file:` URL |
| `TURSO_AUTH_TOKEN` | its token |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the app's OAuth client — only `on` needs them, to read the calendar |

Keep the live URL in `.env.seed` if this machine's `.env.local` points `next dev` at a local file.
Every command prints `live = <host>` first — check it is the production database before trusting an
"OFF".
Run everything from the project root. Local working files go to `data/demo/` (git-ignored):
`backups/`, `history/`, rehearsal copies, and a copy of the manifest.

## Before an interview — the morning of (it seeds up to *yesterday*)

```
node --no-warnings scripts/demo-mode.mjs status
node --no-warnings scripts/demo-mode.mjs on --target live             # dry run: reads, prints, writes nothing
node --no-warnings scripts/demo-mode.mjs on --target live --commit    # backup, then write
```

The dry run prints today's real figures, then the figures you would get. `--commit` backs up
production to `data/demo/backups/` on this machine, writes the undo record into the database, applies
the changes, and re-reads the database to print what the site now shows.

**Then make today look lived-in yourself** — demo mode never touches today. Tick Weight, Vitamins,
Calendar, Tidy room, log a meal, mark blocks that have happened. `/stats` → "adherence, last 7 days"
includes today, so an untouched today at 0% drags it into the 70s. On `/stats`, stay on "30 days".

## After the interview — from any machine

```
node --no-warnings scripts/demo-mode.mjs off --target live
node --no-warnings scripts/demo-mode.mjs status       # live: OFF
```

`off` reads the undo record from the database, deletes only rows demo mode added and restores only
values it changed — and only where they still hold exactly what demo mode wrote. Anything you logged
or edited since is left alone and listed. If it is interrupted, run it again: each batch of undos
commits together with "these are undone", so nothing is undone twice.

Two machines at once are safe: `off` first marks the session as closing, and every `on` batch
commits only while the record is still its own and not closing — otherwise the whole batch rolls
back. So an `on` left running (or stalled) elsewhere cannot write anything `off` does not know about.

`on` refuses while the database says demo mode is on. `status` warns when a session was seeded for an
earlier day — switch it `off` and `on` again for a fresh demo.

## Try it without touching production

`--target rehearsal` copies production to `data/demo/rehearsal.db` and works on that;
`off --target rehearsal` also proves the undo by comparing every table with an untouched copy.
While production is itself in demo mode, rehearse from a backup instead:

```
node --no-warnings scripts/demo-mode.mjs on --target rehearsal --from data/demo/backups/live-<time>.db --commit
node --no-warnings scripts/demo-mode.mjs off --target rehearsal
```

## What `on` changes (last 30 days, never today)

- **Non-negotiables**: Weight (a line drawn through the real readings), and Calendar, Vitamins and
  Tidy room as unbroken runs of different lengths; Read and Outreach on most days; ASC.ND on most
  days, matching its calendar block. **Journal is never ticked** — in the app a page is what ticks it.
- **Calories**: every day reaches the 2,000 log-streak line, around 80% of the fortnight goal. Real
  entries stay; only missing meals are added.
- **Steps**: the phone's real counts stay; only a day it never reported gets a number.
- **Blocks**: the REAL Google Calendar's events on past days are marked — mostly adhered, some drifted
  (project blocks never get a reason, so they stay out of the written log), a few skipped. Real
  adhered/drifted marks are kept; past *skipped* marks are re-marked (restored by `off`). ASC.ND and
  gym blocks agree with the habit and the gym log. Multi-day events (over 12h) are dismissed.
- **Gym**: nothing is invented. Real strength sessions from the last 6 weeks are re-spaced evenly —
  only ever LATER, same order, same notes — and only if that does not lower the fortnight's count.
  The most recent real cardio session is kept inside the fortnight.
- **Career**: only SQL, Algorithms and AWS stay (`KEEP_GOALS`; it refuses if one is missing). Every
  other goal not already dropped is set to *dropped* — hidden from the dashboard, drill-down, /goals
  and the timeline — and restored by `off`. Counted goals ("18 of 50") keep their real counts; only
  their start date moves so the pace reads right. Subtask goals get a subtask or two ticked, and a
  starter list only if they have none. Progress uses the app's own `goalProgress`.
- It aims for adherence ~86% over 14 finished days (none below ~68%), Career ~70%, calories ~80%,
  and Health ~70% — though real training can put Health higher, and the script never hides it.
  The knobs are at the top of the script (`TARGET`, `P`, `RUN_DAYS`, `KEEP_GOALS`, `DAYS_BACK`).

## Safety

- The Google tokens are only read. A refreshed access token stays in memory; if refreshing fails the
  script stops (the app's own refresh path would revoke the grant).
- Every `on --commit` writes a full backup (all tables except the Google tokens) to
  `data/demo/backups/` on the machine that ran it. Restoring from it by hand would also roll back
  anything real logged since — prefer `off`. **Never use `scripts/db-copy.mjs` for this**: it wipes
  every table it knows, the Google tokens included, before copying.
- The site reads at most 250 calendar events per range, oldest first, so `/stats` "3 months" /
  "a year" can drop the most recent days' blocks. The dry run prints the event count.
