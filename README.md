# Personal Dashboard

A private, single-user **daily-guide** web app with an AI coach — a daily operating
system, not a metrics dashboard. The hero screen is **Today**; everything else
(goal bars, area levels) is one tap deeper.

This repo currently implements **Phase 1** (the skeleton), running locally on a
libSQL file. No cloud setup required.

## What works now

**There is no to-do list.** Open unchecked lists create cognitive load, so the app
records what you *did*, and forward commitments live only as calendar time blocks.

- **Today** — a three-column desktop app shell (calendar + digest · the day · coach),
  collapsing below 1024px to a single stack. Three **pillar rings** and the **streak**.
- **Did-list** — log what you've already done, tagged to a pillar. That tag is what
  earns XP and closes the ring.
- **Daily non-negotiables** — the one deliberate exception, and the only checkboxes
  left. Six habits across all three pillars, plus Steps (waiting on the health feed).
  At most one may be flagged for call escalation — enforced by a partial unique index.
- **Food** — meal logging via Open Food Facts (free, no API key, barcode supported),
  with a manual path when there's no calorie data. Calories are optional by design:
  the tracked behaviour is consistency of logging, not hitting a number. Pays XP once
  a day, however much you log.
- **Goals & levels** (`/goals`) — per-pillar XP/levels and goal progress bars.
- **The Claude coach** — streams its reply and shows what it's doing ("checking your
  calendar") while it works. Acts on your board via tool-use.
- **The motivation engine** — one action lights the streak, the pillar XP and the goal
  bar together, idempotently and reversibly, all inside a transaction.

## Importing a gym backlog

```bash
node scripts/import-gym.mjs export.txt            # dry run — prints, writes nothing
node scripts/import-gym.mjs export.txt --write    # import (idempotent; safe to re-run)
node scripts/import-gym.mjs export.txt --write --xp
```

Each Discord message becomes one did-list entry holding the session's raw text.
`--xp` is **off** by default: running two years of history through the normal XP rule
would jump every level overnight and misrepresent today's board.

## Quick start

```bash
npm install                 # already done
cp .env.example .env.local  # then add your ANTHROPIC_API_KEY to enable the coach
npm run db:migrate          # creates ./data/dashboard.db (also self-heals on first run)
npm run dev                 # http://localhost:3000
```

- The app runs fully **without** an API key — goals, tasks, rings, streak, and XP all work. The coach just replies with a setup hint until you add `ANTHROPIC_API_KEY`.
- `npm run db:reset` wipes the local DB and reseeds (3 pillars + 4 always-on habits).

## How it's wired

```
src/
  lib/
    db/
      schema.sql      # the 9 Phase-1 tables (+ CHECKs / indexes)
      client.ts       # getDb(): one client, FK pragma enabled + asserted, self-heals schema/seed
    dates.ts          # Australia/Melbourne date helpers
    engine.ts         # THE RULES (transactional): XP, rings, streak+grace, goal progress
    queries.ts        # read models (getTodayData, listGoals, …) + goal CRUD
    pillars.ts        # client-safe pillar colours/labels
    coach/
      tools.ts        # the 10 Claude tool definitions + in-process executor
      coach.ts        # manual Anthropic tool-use loop (claude-opus-4-8, adaptive thinking)
  app/
    page.tsx          # Today (server) → <Today/>
    goals/page.tsx    # Goals & levels
    api/…             # REST routes the UI calls (today, tasks, goals, habits/log, coach)
  components/         # Today, Rings, CoachChat, Goals
docs/
  phase1-design.md    # the reviewed schema + tool contract (source of truth)
scripts/migrate.mjs   # idempotent migration + seed
```

The rules that the model must **not** be trusted to get right (XP scarcity, ring
closing, streak grace, goal-bar advancement) all live in `engine.ts` and run in
transactions. `pillars.xp` is always recomputed as `SUM(xp_log.amount)`, so it can
never drift.

## Deploy later

Phase 1 is local-only on purpose. To deploy: point `DATABASE_URL` at a Turso URL
(`libsql://…`) with `TURSO_AUTH_TOKEN`, and host on Fly.io. Nothing else changes —
`@libsql/client` is the same API for the local file and Turso.

## Roadmap (deferred phases)

2. Google Calendar (OAuth, read+write) · 3. Health webhook (iOS Shortcuts) ·
4. Telegram + cron (brief / review / nudges) · 5. Adaptive coaching (nightly profile) ·
6. Twilio escalation calls · 7. Daily digest · 8. Handwriting journal + Claude vision ·
plus the **skill-rotation board**, deferred from Phase 1.
