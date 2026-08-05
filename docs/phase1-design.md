# Phase 1 — Schema & Tool Definitions (FINAL, post-review)

Single-user daily-guide app. Phase 1 runs locally on a **libSQL file**
(`@libsql/client`, `url: "file:./data/dashboard.db"`). Swap to Turso later = one-line URL/authToken change.

Conventions:
- IDs: `INTEGER PRIMARY KEY`. Dates: TEXT `'YYYY-MM-DD'` (local **Australia/Melbourne**, app-computed).
- Times: TEXT `'HH:MM'`. Booleans: INTEGER 0/1. Enums: TEXT + `CHECK`.
- Timestamps: TEXT **true ISO-8601 UTC**, `DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))`. Always append `Z` before `new Date(...)`.
- **FK enforcement is OFF by default** — a single `getClient()` runs `PRAGMA foreign_keys = ON` on every connection and asserts it reads back `1` at startup.

---

## Tables — Phase 1 (active)

### Core

```sql
CREATE TABLE pillars (
  id          INTEGER PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,             -- 'social_capital' | 'physical' | 'portfolio'
  name        TEXT NOT NULL,
  priority    TEXT NOT NULL CHECK (priority IN ('high','low')),
  sort_order  INTEGER NOT NULL,
  xp          INTEGER NOT NULL DEFAULT 0,       -- pillars.xp == SUM(xp_log.amount); level = levelForXp(xp) in code
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE goals (
  id           INTEGER PRIMARY KEY,
  pillar_id    INTEGER NOT NULL REFERENCES pillars(id),
  title        TEXT NOT NULL,
  target       TEXT,                            -- human description of "done"
  target_count INTEGER,                         -- nullable: if set, progress auto-derives from completed aligned tasks
  progress     REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','done','paused','dropped')),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  completed_at TEXT
);
CREATE INDEX idx_goals_pillar_status ON goals(pillar_id, status);

CREATE TABLE tasks (
  id             INTEGER PRIMARY KEY,
  date           TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  title          TEXT NOT NULL,
  pillar_id      INTEGER REFERENCES pillars(id),
  goal_id        INTEGER REFERENCES goals(id),
  time_start     TEXT,                          -- 'HH:MM'
  time_end       TEXT,                          -- 'HH:MM' (server enforces time_end > time_start)
  done           INTEGER NOT NULL DEFAULT 0,
  done_at        TEXT,
  non_negotiable INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  source         TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','coach','brief')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_tasks_date ON tasks(date);
CREATE INDEX idx_tasks_goal ON tasks(goal_id);
-- Phase 2 will add: calendar_event_id TEXT, calendar_etag TEXT (clean ALTER ADD COLUMN)
```

### Heartbeat (streak + three rings + XP)

```sql
-- Always-on body habits (all under the Physical pillar). The "ring" is the pillar (see rules);
-- target_value + value (below) keep things data-driven so Phase-3 health writes the same rows.
CREATE TABLE habits (
  id           INTEGER PRIMARY KEY,
  pillar_id    INTEGER REFERENCES pillars(id),
  name         TEXT NOT NULL,
  target_value REAL NOT NULL DEFAULT 1,         -- "met" when entry.value >= target_value (Steps=8000)
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','health')),
  cadence      TEXT NOT NULL DEFAULT 'daily',
  active       INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE habit_entries (
  id         INTEGER PRIMARY KEY,
  habit_id   INTEGER NOT NULL REFERENCES habits(id),
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  value      REAL NOT NULL DEFAULT 1,           -- 1 for binary; steps/calories for numeric (Phase 3)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (habit_id, date)                        -- upsert one row per habit per day
);

CREATE TABLE daily_log (
  date         TEXT PRIMARY KEY NOT NULL CHECK (date GLOB '????-??-??'),
  streak_count INTEGER NOT NULL DEFAULT 0,
  grace_used   INTEGER NOT NULL DEFAULT 0,      -- per-day boolean: was a grace token spent on this date
  rings_closed INTEGER NOT NULL DEFAULT 0,      -- 0..3 pillars engaged today (recomputed on complete_task/log_habit)
  day_felt     INTEGER CHECK (day_felt BETWEEN 1 AND 5),  -- evening review (Phase 4), nullable
  tracked      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE xp_log (
  id          INTEGER PRIMARY KEY,
  pillar_id   INTEGER NOT NULL REFERENCES pillars(id),
  amount      INTEGER NOT NULL,
  reason      TEXT NOT NULL,                    -- 'task_completed' | 'habit_logged'
  source_type TEXT NOT NULL,                    -- 'task' | 'habit'
  source_id   INTEGER NOT NULL,
  date        TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- All four columns NOT NULL: this is what makes the unique index a real idempotency key.
  -- `date` is in the key so a DAILY habit gets one award PER DAY (not once ever).
  UNIQUE (source_type, source_id, reason, date)
);
```

### Coach chat + meta

```sql
CREATE TABLE coach_messages (
  id          INTEGER PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,                    -- JSON: Anthropic ContentBlock[] (replays verbatim)
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY NOT NULL,              -- 'timezone', 'passcode_hash', ...
  value TEXT
);
```

### Seed (run via `client.batch()` / `executeMultiple`, pillars before habits)

```sql
INSERT INTO pillars (key, name, priority, sort_order) VALUES
  ('social_capital','Social Capital & Career','high',1),
  ('physical','Physical Embodiment','high',2),
  ('portfolio','Portfolio Expansion','low',3);

-- Always-on body habits live under the Physical pillar (whose ring they help close). Steps target 8000 (Phase-3 auto-arrival).
INSERT INTO habits (pillar_id, name, target_value, sort_order) VALUES
  ((SELECT id FROM pillars WHERE key='physical'),'Train',1,1),
  ((SELECT id FROM pillars WHERE key='physical'),'Eat well',1,2),
  ((SELECT id FROM pillars WHERE key='physical'),'Sleep',1,3),
  ((SELECT id FROM pillars WHERE key='physical'),'Steps',8000,4);

INSERT INTO app_meta (key,value) VALUES ('timezone','Australia/Melbourne');
```

---

## Server-side rules (enforced in app code — never trusted to the model)

- **levelForXp(xp):** rising cumulative thresholds (100, 250, 450, 700, …). Single source of truth in code.
- **Award pillar = the *goal's* pillar** (`goals.pillar_id`), never `tasks.pillar_id` (they can differ).
- **complete_task (one tx, idempotent, reversible):**
  - `done=true`: set `done=1, done_at`; if goal-aligned, `INSERT … RETURNING` into `xp_log` and, only when a new row is created, `UPDATE pillars SET xp = xp + amount`; then recompute the goal bar.
  - `done=false`: set `done=0, done_at=NULL`; delete that `xp_log` row, decrement `pillars.xp`, recompute the goal bar. Keeps `pillars.xp == SUM(xp_log.amount)`.
- **Goal bar (the third light):** if `goals.target_count` is set, `progress = min(1, completed_aligned_tasks / target_count)` recomputed on every complete_task — so a goal-aligned completion deterministically lights streak + XP + bar. If `target_count` is NULL it's a milestone goal: `progress` is set by `update_goal` (coach/user judgment).
- **Rings = pillars (3).** A pillar's ring **closes for a day when there's ≥1 qualifying activity in it**: a completed task with that `pillar_id`, OR a logged habit whose `pillar_id` matches. Recomputed on every complete_task / log_habit into `daily_log.rings_closed` (0..3). (Engagement closes a ring even for non-goal-aligned tasks; XP is the separate, stricter signal.)
- **log_habit (one tx, idempotent per day):** upsert `habit_entries(habit_id,date,value)`; set `daily_log.tracked=1`; recompute the habit's pillar ring; award awareness XP via `xp_log` keyed `(habit,id,'habit_logged',date)`.
- **Scarcity:** `xp_log` is written **only** by complete_task (goal-aligned) and log_habit. Never for a trivial unaligned task. The unique key makes every award idempotent.
- **Streak + grace (nightly / on first open):** a day is **not a miss** if ≥1 ring closed. A miss **dents** (holds, doesn't increment) and consumes one grace token (1 token / 7 days); only running out of grace steps the streak down — it never resets to 0.
- **Defaults applied in code** when the model omits a field: `complete_task.done`→true, booleans→false. `time_end > time_start` validated server-side.

---

## Claude tool definitions (`messages.create({ tools })`, strict OFF — server validates)

`pillar` is always the enum **key**. `id`/`goal_id` are integers from a read tool — descriptions tell the model to never guess.

### Read

```jsonc
{
  "name": "get_today",
  "description": "Read the full picture for a day and CALL THIS FIRST at the start of any coaching turn. Returns: { date, tasks:[{id,title,pillar,goal_id,time_start,time_end,done,non_negotiable}], rings:[{pillar,closed}], streak:{count,grace_remaining}, pillars:[{key,name,priority,xp,level}], goals:[{id,pillar,title,target,progress,status}] }. Grounds you in the real day (and which pillar is lagging) before you propose or change anything.",
  "input_schema": {
    "type": "object", "additionalProperties": false,
    "properties": { "date": { "type": "string", "format": "date", "description": "YYYY-MM-DD; defaults to today" } },
    "required": []
  }
}
```

```jsonc
{
  "name": "list_goals",
  "description": "List goals, optionally filtered by pillar/status. Call before any create/update that needs a goal_id you don't already have — never guess an id.",
  "input_schema": {
    "type": "object", "additionalProperties": false,
    "properties": {
      "pillar": { "type": "string", "enum": ["social_capital","physical","portfolio"] },
      "status": { "type": "string", "enum": ["active","done","paused","dropped"] }
    },
    "required": []
  }
}
```

```jsonc
{
  "name": "list_tasks",
  "description": "List tasks in a date range, optionally filtered by pillar/completion. Call before reschedule/complete to get real task ids, or to spot what's slipping — never guess an id.",
  "input_schema": {
    "type": "object", "additionalProperties": false,
    "properties": {
      "from_date": { "type": "string", "format": "date" },
      "to_date":   { "type": "string", "format": "date" },
      "pillar":    { "type": "string", "enum": ["social_capital","physical","portfolio"] },
      "done":      { "type": "boolean" }
    },
    "required": []
  }
}
```

### Write

```jsonc
{
  "name": "create_task",
  "description": "Add a task to a day. Set goal_id when it moves a goal (that is what earns XP — keep the day focused, don't pad with trivial boxes). time_start/time_end to time-block it. non_negotiable only for the 1–2 truly unmissable items.",
  "input_schema": {
    "type": "object", "additionalProperties": false,
    "properties": {
      "date":           { "type": "string", "format": "date" },
      "title":          { "type": "string" },
      "pillar":         { "type": "string", "enum": ["social_capital","physical","portfolio"] },
      "goal_id":        { "type": "integer", "description": "from list_goals/get_today; omit if not goal-aligned — never guess" },
      "time_start":     { "type": "string", "description": "HH:MM" },
      "time_end":       { "type": "string", "description": "HH:MM" },
      "non_negotiable": { "type": "boolean" },
      "notes":          { "type": "string" }
    },
    "required": ["date","title"]
  }
}
```

```jsonc
{
  "name": "update_task",
  "description": "Edit a task. Provide ONLY fields you want to change; omitted = unchanged. To CLEAR a field use its clear_* flag (omitting it never clears). Reschedule = pass a new date. Do NOT mark done here — use complete_task.",
  "input_schema": {
    "type": "object", "additionalProperties": false,
    "properties": {
      "id":               { "type": "integer", "description": "real task id from a read tool — never guess" },
      "title":            { "type": "string" },
      "date":             { "type": "string", "format": "date" },
      "pillar":           { "type": "string", "enum": ["social_capital","physical","portfolio"] },
      "goal_id":          { "type": "integer", "description": "relink to this goal" },
      "clear_goal":       { "type": "boolean", "description": "true to unlink the goal" },
      "time_start":       { "type": "string", "description": "HH:MM" },
      "time_end":         { "type": "string", "description": "HH:MM" },
      "clear_time_block": { "type": "boolean", "description": "true to remove the time block" },
      "non_negotiable":   { "type": "boolean" },
      "notes":            { "type": "string" },
      "clear_notes":      { "type": "boolean" }
    },
    "required": ["id"]
  }
}
```

```jsonc
{
  "name": "complete_task",
  "description": "Mark a task done (or un-done). Completing a goal-aligned task fires streak → pillar XP → goal bar. Reflect what actually happened; do not inflate.",
  "input_schema": {
    "type": "object", "additionalProperties": false,
    "properties": {
      "id":   { "type": "integer", "description": "real task id — never guess" },
      "done": { "type": "boolean", "description": "defaults true if omitted" }
    },
    "required": ["id"]
  }
}
```

```jsonc
{
  "name": "delete_task",
  "description": "Permanently delete a task. Use for genuinely-cancelled items, not to reschedule (update_task) or skip (leave undone).",
  "input_schema": {
    "type": "object", "additionalProperties": false,
    "properties": { "id": { "type": "integer", "description": "real task id — never guess" } },
    "required": ["id"]
  }
}
```

```jsonc
{
  "name": "create_goal",
  "description": "Create a goal under a pillar. Give a human target; set target_count when 'done' = N completed aligned tasks (then the bar auto-fills as those tasks complete). Keep goals few and real.",
  "input_schema": {
    "type": "object", "additionalProperties": false,
    "properties": {
      "pillar":       { "type": "string", "enum": ["social_capital","physical","portfolio"] },
      "title":        { "type": "string" },
      "target":       { "type": "string", "description": "what 'done' looks like" },
      "target_count": { "type": "integer", "description": "optional: # of aligned-task completions = 100%" }
    },
    "required": ["pillar","title"]
  }
}
```

```jsonc
{
  "name": "update_goal",
  "description": "Update a goal's title, target, status, or (milestone goals only) progress 0..1. For count-based goals the bar is server-computed from completed tasks — don't hand-set progress there. Set status='done' when achieved.",
  "input_schema": {
    "type": "object", "additionalProperties": false,
    "properties": {
      "id":       { "type": "integer", "description": "real goal id — never guess" },
      "title":    { "type": "string" },
      "target":   { "type": "string" },
      "progress": { "type": "number", "description": "0.0..1.0 (milestone goals only)" },
      "status":   { "type": "string", "enum": ["active","done","paused","dropped"] }
    },
    "required": ["id"]
  }
}
```

```jsonc
{
  "name": "log_habit",
  "description": "Log an always-on habit for a day (Train / Eat well / Sleep / Steps). Closes its ring, advances the streak, and earns awareness XP. Value defaults to 1 (done) for binary habits; pass a number for Steps. Idempotent per habit per day.",
  "input_schema": {
    "type": "object", "additionalProperties": false,
    "properties": {
      "habit": { "type": "string", "enum": ["Train","Eat well","Sleep","Steps"], "description": "habit name" },
      "date":  { "type": "string", "format": "date", "description": "defaults to today" },
      "value": { "type": "number", "description": "defaults 1; for Steps pass the count" }
    },
    "required": ["habit"]
  }
}
```

---

## Deferred to later phases (NOT in the Phase-1 migration)

- **skills (rotation board) + list_skills / set_skill_state** — needs a stall-detector activity source (skill_id on tasks) and a server-enforced over-activation cap; bundle with the rotation mechanic in a later phase.
- `google_oauth_tokens`, `calendar_events` (P2) · `health_logs` (P3) · `nudges` (P4/5) · `coaching_profile` (P5) · `digest_items` (P7) · `journal_entries` (P8)

---

## Decisions (confirmed)

1. **Rings = one per pillar** (Social Capital / Physical / Portfolio) — a ring closes on any engagement in that area that day.
2. **Skill-rotation board deferred** to a later phase; the heartbeat (rings/streak/XP) stays in Phase 1.
