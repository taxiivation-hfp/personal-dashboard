-- Phase 1 schema. Idempotent (IF NOT EXISTS); seed runs separately only when empty.
-- Rings = one per pillar. XP/streak/rings enforced in app code (see lib/engine.ts).

CREATE TABLE IF NOT EXISTS pillars (
  id          INTEGER PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  priority    TEXT NOT NULL CHECK (priority IN ('high','low')),
  sort_order  INTEGER NOT NULL,
  xp          INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id           INTEGER PRIMARY KEY,
  pillar_id    INTEGER NOT NULL REFERENCES pillars(id),
  title        TEXT NOT NULL,
  target       TEXT,
  target_count INTEGER,
  progress     REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','paused','dropped')),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_goals_pillar_status ON goals(pillar_id, status);

CREATE TABLE IF NOT EXISTS tasks (
  id             INTEGER PRIMARY KEY,
  date           TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  title          TEXT NOT NULL,
  pillar_id      INTEGER REFERENCES pillars(id),
  goal_id        INTEGER REFERENCES goals(id),
  time_start     TEXT,
  time_end       TEXT,
  done           INTEGER NOT NULL DEFAULT 0,
  done_at        TEXT,
  non_negotiable INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  source         TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','coach','brief')),
  -- What this row IS, as opposed to where it came from (that's `source`).
  -- 'task' = a scheduled item; 'did' = a did-list entry, born complete; 'gym' = a
  -- did-entry holding a raw workout log. Deliberately no CHECK constraint: adding a
  -- kind later must stay a one-line change, not a table rebuild.
  kind           TEXT NOT NULL DEFAULT 'task',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id);

CREATE TABLE IF NOT EXISTS habits (
  id           INTEGER PRIMARY KEY,
  pillar_id    INTEGER REFERENCES pillars(id),
  name         TEXT NOT NULL,
  target_value REAL NOT NULL DEFAULT 1,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','health')),
  cadence      TEXT NOT NULL DEFAULT 'daily',
  active       INTEGER NOT NULL DEFAULT 1,
  -- Day-of-week schedule as a bitmask: bit0=Mon .. bit6=Sun. 127 = every day.
  -- A mask rather than a schedule table specifically so existing habit_entries keep
  -- pointing at the same habit_id — renaming or rescheduling never orphans history.
  days_mask    INTEGER NOT NULL DEFAULT 127,
  -- Stable identity that survives a rename. The engine used to look habits up by
  -- literal name, which breaks the moment the owner is allowed to edit them.
  system_key   TEXT,
  -- Flags the one habit that may escalate to a phone call. Enforced as at-most-one
  -- by a partial unique index (created in migrate.mjs, after the column back-fill):
  -- escalating everything is what makes the calls ignorable.
  escalate     INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS habit_entries (
  id         INTEGER PRIMARY KEY,
  habit_id   INTEGER NOT NULL REFERENCES habits(id),
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  value      REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (habit_id, date)
);

CREATE TABLE IF NOT EXISTS daily_log (
  date         TEXT PRIMARY KEY NOT NULL CHECK (date GLOB '????-??-??'),
  streak_count INTEGER NOT NULL DEFAULT 0,
  grace_used   INTEGER NOT NULL DEFAULT 0,
  rings_closed INTEGER NOT NULL DEFAULT 0,
  day_felt     INTEGER CHECK (day_felt BETWEEN 1 AND 5),
  tracked      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS xp_log (
  id          INTEGER PRIMARY KEY,
  pillar_id   INTEGER NOT NULL REFERENCES pillars(id),
  amount      INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id   INTEGER NOT NULL,
  date        TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (source_type, source_id, reason, date)
);

CREATE TABLE IF NOT EXISTS coach_messages (
  id          INTEGER PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT
);

-- Subgoals. A goal's progress is the SUM OF COMPLETED SUBGOAL WEIGHTS — nothing is
-- inferred from activity, and no count of finished items feeds it. Weights are
-- fractions of the parent and are intended to sum to 1.0.
CREATE TABLE IF NOT EXISTS subgoals (
  id         INTEGER PRIMARY KEY,
  goal_id    INTEGER NOT NULL REFERENCES goals(id),
  title      TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 1),
  done       INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_subgoals_goal ON subgoals(goal_id, sort_order);

-- Time logged against a skill.
--
-- The total of these minutes IS the skill's "XP" — it is a MEASUREMENT of time
-- invested, not a reward. There are deliberately no levels, no thresholds and no
-- milestones anywhere: the number only ever says how long you spent, which is a fact
-- rather than a score. Kept as a log rather than a running total so the history stays
-- honest and a mistaken entry can be removed.
CREATE TABLE IF NOT EXISTS skill_time (
  id         INTEGER PRIMARY KEY,
  skill_id   INTEGER NOT NULL REFERENCES skills(id),
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  minutes    INTEGER NOT NULL CHECK (minutes > 0),
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_skill_time_skill ON skill_time(skill_id, date);

-- THE CENTRAL MODEL: three-state marks against calendar time blocks.
--
-- The question is "did I do what I said I'd do?", never "how much did I get done?".
-- So a block is not done/not-done — it is adhered, drifted or skipped, and working a
-- block badly is the same event as working it brilliantly.
--
-- Rows are keyed to a Google Calendar event id (instance-specific for recurring
-- events). title/time_start/time_end are SNAPSHOTTED on purpose: if the event is later
-- edited or deleted, the mark must still say what it was a mark ABOUT.
--
-- 'dismissed' is how "this isn't a block" is remembered — a birthday or an invite you
-- never chose shouldn't sit in an adherence rate. Dismissed rows are excluded from
-- every calculation.
CREATE TABLE IF NOT EXISTS block_marks (
  id          INTEGER PRIMARY KEY,
  date        TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  event_id    TEXT NOT NULL,
  title       TEXT,
  time_start  TEXT,
  time_end    TEXT,
  state       TEXT NOT NULL CHECK (state IN ('adhered','drifted','skipped','dismissed')),
  -- Optional, always. Never required, never blocking. Stored so the coach can spot
  -- patterns ("Mandarin drifts on weeknights") rather than to justify anything.
  reason      TEXT,
  marked_at   TEXT NOT NULL,
  UNIQUE (date, event_id)
);
CREATE INDEX IF NOT EXISTS idx_block_marks_date ON block_marks(date);

-- The skill-rotation board: the "not all at once" mechanic.
--
-- Three states, and the point of the whole thing is that PARKED skills stay visible.
-- The jack-of-all-trades failure mode is five things half-done, so parked skills sit on
-- the board greyed out — never out of sight, never demanding attention.
--
-- The 1-2 active cap is enforced in engine.setSkillState(), not here: SQLite can express
-- "at most one row" with a partial unique index but not "at most two", and a cap the UI
-- merely respects is a cap that the coach's tools would eventually walk straight past.
CREATE TABLE IF NOT EXISTS skills (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  pillar_id  INTEGER REFERENCES pillars(id),
  state      TEXT NOT NULL DEFAULT 'parked' CHECK (state IN ('always_on','active','parked')),
  progress   REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  note       TEXT,
  -- Drives the "stalled ~2 weeks" prompt to rotate. NULL = never worked on.
  last_touched TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_skills_state ON skills(state, sort_order);

-- Phase 7: the daily digest.
-- Candidates are kept whether or not they made the cut (`surfaced`), because "what did
-- it reject and why" is the only way to tell a well-tuned filter from a broken one.
CREATE TABLE IF NOT EXISTS digest_items (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  lane       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'lane' CHECK (kind IN ('lane','bucket')),
  title      TEXT NOT NULL,
  url        TEXT,
  source     TEXT,
  why        TEXT,
  surfaced   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_digest_date ON digest_items(date, surfaced);

-- One row per day recording that the digest RAN, so "nothing worth your time today"
-- is distinguishable from "it never ran" — which the UI must never conflate.
CREATE TABLE IF NOT EXISTS digest_runs (
  date        TEXT PRIMARY KEY NOT NULL CHECK (date GLOB '????-??-??'),
  candidates  INTEGER NOT NULL DEFAULT 0,
  surfaced    INTEGER NOT NULL DEFAULT 0,
  note        TEXT,
  ran_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Phase 8: the handwriting journal.
-- `image` holds the ACTUAL handwriting as a PNG data URL — the point of the feature is
-- that you wrote it by hand, so the strokes are the artefact and the transcript is a
-- derived convenience. `transcript` is Claude's best-effort read and is allowed to be
-- imperfect; the coach only needs the gist.
CREATE TABLE IF NOT EXISTS journal_entries (
  id          INTEGER PRIMARY KEY,
  date        TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  image       TEXT NOT NULL,
  width       INTEGER,
  height      INTEGER,
  transcript  TEXT,
  themes      TEXT,          -- JSON array of short strings
  mood        TEXT,
  analyzed_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date);

-- Phase 3: health data pushed from the phone (iOS Shortcuts -> POST /api/health).
-- One row per day, UPSERT on date, so re-posting the same day is idempotent and a
-- later push simply revises the numbers rather than duplicating them.
CREATE TABLE IF NOT EXISTS health_logs (
  date          TEXT PRIMARY KEY NOT NULL CHECK (date GLOB '????-??-??'),
  steps         INTEGER,
  calories      INTEGER,
  sleep_minutes INTEGER,
  resting_hr    INTEGER,
  source        TEXT NOT NULL DEFAULT 'ios_shortcuts',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Nutrition. kcal is deliberately NULLABLE: the rule is to reward consistency and
-- awareness of logging, not hitting exact numbers, and Open Food Facts genuinely
-- lacks energy data for many real products. A meal with no number still counts.
CREATE TABLE IF NOT EXISTS meals (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  name       TEXT NOT NULL,
  brand      TEXT,
  kcal       REAL,
  protein_g  REAL,
  qty_g      REAL,
  off_code   TEXT,
  source     TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','off')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);

-- Phase 2: Google OAuth tokens (single-user → one row, id=1).
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  scope         TEXT,
  token_type    TEXT,
  expiry        INTEGER NOT NULL,   -- epoch ms
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
