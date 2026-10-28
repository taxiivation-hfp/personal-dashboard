-- Phase 1 schema. Idempotent (IF NOT EXISTS); seed runs separately only when empty.
-- Rings = one per pillar. XP/streak/rings enforced in app code (see lib/engine.ts).

CREATE TABLE IF NOT EXISTS pillars (
  id          INTEGER PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  priority    TEXT NOT NULL CHECK (priority IN ('high','low')),
  sort_order  INTEGER NOT NULL,
  -- Owner-chosen hue from a curated palette. NULL = the CSS default. Only PILLAR colours
  -- are editable: the amber accent, ink and the three block states stay fixed, because
  -- one accent is what keeps the page quiet.
  color       TEXT,
  xp          INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id           INTEGER PRIMARY KEY,
  pillar_id    INTEGER NOT NULL REFERENCES pillars(id),
  title        TEXT NOT NULL,
  target       TEXT,
  -- A COUNTED goal: `target_count` is how many there are, `done_count` how many are done,
  -- and progress is the fraction (src/lib/goals.ts). The owner's ruling, 2026-09-20 —
  -- a compression of a checklist, for a goal made of 150 interchangeable items. A count
  -- and subgoals are EXCLUSIVE: target_count NULL means progress comes from subgoals.
  target_count INTEGER CHECK (target_count IS NULL OR target_count > 0),
  done_count   INTEGER NOT NULL DEFAULT 0 CHECK (done_count >= 0),
  progress     REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','paused','dropped')),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  completed_at TEXT,
  -- The goal's optional DEADLINE, a local 'YYYY-MM-DD' — the Health & Career pivot,
  -- 2026-09-18. Only an ACTIVE goal WITH a deadline takes an arc of the Career ring, filled
  -- by whether it is on pace (src/lib/career.ts). An existing database gets this column
  -- from client.ts's ensure(); it is nullable, so no row is touched.
  deadline     TEXT CHECK (deadline IS NULL OR deadline GLOB '????-??-??')
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
  -- 'check' = a plain tick. 'number' = type a value (weight in kg). habit_entries.value
  -- holds it either way, so adherence and the rings need no special case: an entry exists
  -- or it does not.
  input        TEXT NOT NULL DEFAULT 'check' CHECK (input IN ('check','number')),
  unit         TEXT,
  -- Flags the one habit that may escalate to a phone call. Enforced as at-most-one
  -- by a partial unique index (created in migrate.mjs, after the column back-fill):
  -- escalating everything is what makes the calls ignorable.
  escalate     INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ONE DAY'S dressing of a non-negotiable — a different name, a different pillar — without
-- touching the default. The habits table stays the every-day truth; a row here says "on
-- this DATE, habit X reads as Y". The id is what history hangs off, so an override never
-- orphans a tick: habit_entries keep pointing at the same habit_id whatever it was called
-- that day. Rows are meaningful for any date but the UI only writes TOMORROW's — the
-- customising screen is for the day you are planning, not the one you are in.
CREATE TABLE IF NOT EXISTS habit_overrides (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  habit_id   INTEGER NOT NULL REFERENCES habits(id),
  -- Either may be NULL: override just the name, just the pillar, or both.
  name       TEXT,
  pillar_id  INTEGER REFERENCES pillars(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (date, habit_id)
);
CREATE INDEX IF NOT EXISTS idx_habit_overrides_date ON habit_overrides(date);

CREATE TABLE IF NOT EXISTS habit_entries (
  id         INTEGER PRIMARY KEY,
  habit_id   INTEGER NOT NULL REFERENCES habits(id),
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  value      REAL NOT NULL DEFAULT 1,
  -- What was written, for the non-negotiables that carry a document — ASC.ND, today.
  --
  -- ONE PER DAY, which is not a limitation but the shape of the thing: this table is
  -- UNIQUE (habit_id, date), so a second session on a Tuesday is the same Tuesday however
  -- many you did. Consistency in reaching the floor is what is being counted; volume past
  -- it is deliberately not.
  --
  -- Nullable with no default, so every tick ever made stays a tick with nothing written
  -- rather than being back-filled with an empty document nobody typed.
  note       TEXT,
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

-- THE MONTH'S CHAPTER — the editable half of "The Book of Nero: ...".
--
-- One row per month, keyed 'YYYY-MM'. A month rather than a day because that is the unit
-- the journal already divides itself into, and a chapter that changed mid-month would be a
-- chapter of nothing.
--
-- It is a NAME, not a number: the owner may write "Chapter 8", "August", or "The Thesis
-- Month", and none of those is derivable from the date. Deriving the number instead would
-- have meant the app choosing what the eighth month of a life is called.
--
-- IT FEEDS NOTHING — not adherence, not the rings, not the streak. Same isolation the day's
-- title has, and for the same reason: the moment naming a month becomes something you can
-- succeed or fail at, it stops being a name.
CREATE TABLE IF NOT EXISTS chapters (
  month      TEXT PRIMARY KEY NOT NULL CHECK (month GLOB '????-??'),
  name       TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT
);

-- THE TIMELINE'S THREE EDITABLE THINGS — the owner's ask, 2026-09-03. The months and the
-- term/break grouping are DERIVED (src/lib/timeline.ts); what is stored is only what the
-- owner wrote over the defaults, all three on the chapters model: empty deletes the row,
-- so "unwritten" has exactly one representation, and none of it feeds anything.

-- A month's small note under its circle.
CREATE TABLE IF NOT EXISTS timeline_notes (
  month      TEXT PRIMARY KEY NOT NULL CHECK (month GLOB '????-??'),
  text       TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- A group's name, keyed by the group's CANONICAL start month (TimelineGroup.key) — stable
-- while the rolling edge clips and regrows the bracket it names.
CREATE TABLE IF NOT EXISTS timeline_groups (
  start      TEXT PRIMARY KEY NOT NULL CHECK (start GLOB '????-??'),
  name       TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- THE FLOATING WINDOWS over the line — the owner's revision, 2026-09-03. Two kinds in
-- one table: a GOAL window (kind='goal', goal_id set — one of the board's own goals,
-- placed here by choice; the row stores WHICH and WHERE, never a second copy of the
-- goal) and a TEXT window (kind='text' — a few words with a tint from the curated
-- WINDOW_TINTS in timeline.ts, keyed by name so retuning a hex moves every note).
-- Positions are the world's own pixels: x from a fixed origin at Jul 2025, so nothing
-- shifts as months roll in on the right; y from the world's top (WORLD_H is fixed).
-- A goal appears on the timeline ONLY while it has a row here — adding a window is
-- the choice, removing one forgets only the placement. Nothing here feeds anything.
CREATE TABLE IF NOT EXISTS timeline_windows (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('goal','text')),
  goal_id    INTEGER REFERENCES goals(id),
  text       TEXT NOT NULL DEFAULT '',
  color      TEXT,
  x          REAL NOT NULL,
  y          REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
-- One window per goal. A partial index because SQLite's UNIQUE would let every NULL
-- through anyway, and saying so is clearer than relying on it.
CREATE UNIQUE INDEX IF NOT EXISTS timeline_windows_goal
  ON timeline_windows(goal_id) WHERE goal_id IS NOT NULL;
-- (2026-10-29) timeline_windows.month — which month's board a text note is pinned to — is
-- added by client.ts (ALTER, with a one-off back-fill from the note's old x), since SQLite
-- cannot ADD COLUMN IF NOT EXISTS.

-- (2026-10-29) A sticky note shows on a chosen SET of months, or on all of them.
-- timeline_windows.all_months is added by client.ts (ALTER) beside the back-fill that gives
-- every month-pinned note its one note_months row; timeline_windows.month stays as the
-- legacy single home, never dropped.
CREATE TABLE IF NOT EXISTS note_months (
  window_id INTEGER NOT NULL REFERENCES timeline_windows(id),
  month     TEXT NOT NULL CHECK (month GLOB '????-??'),
  PRIMARY KEY (window_id, month)
);

-- Where each card sits on a month's board (2026-10-29). item is 'goal:<id>' or 'note:<id>';
-- no row means "auto-layout". Positions are board px; nothing here feeds anything.
CREATE TABLE IF NOT EXISTS month_board (
  month      TEXT NOT NULL CHECK (month GLOB '????-??'),
  item       TEXT NOT NULL,
  x          REAL NOT NULL,
  y          REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (month, item)
);

-- SUPERSEDED by timeline_windows, the same day it was written: it held only a goal's
-- position, and every goal was placed whether or not the owner wanted it there. Kept
-- (never dropped — preserve data) and read ONCE on boot by client.ts, which carries
-- any row it finds into timeline_windows as a goal window. Nothing writes it now.
CREATE TABLE IF NOT EXISTS timeline_positions (
  goal_id    INTEGER PRIMARY KEY REFERENCES goals(id),
  x          REAL NOT NULL,
  y          REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Subgoals. A goal's progress is the SUM OF COMPLETED SUBGOAL WEIGHTS — nothing is
-- inferred from activity, and no count of finished items feeds it. Weights are
-- fractions of the parent and are intended to sum to 1.0.
--
-- `due` and `done_on` — the owner's ruling, 2026-10-15 (src/lib/subtasks.ts). A dated
-- subtask floats on the hero rails from a week before its date and is LATE past it, which
-- empties its goal's slice of the Career ring. `done_on` is the LOCAL day it was ticked,
-- for the same reason day_tasks records one: a past day's record must not change because
-- of a tick made since. An existing database gets both from client.ts's ensure().
CREATE TABLE IF NOT EXISTS subgoals (
  id         INTEGER PRIMARY KEY,
  goal_id    INTEGER NOT NULL REFERENCES goals(id),
  title      TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 1),
  done       INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  due        TEXT CHECK (due IS NULL OR due GLOB '????-??-??'),
  done_on    TEXT CHECK (done_on IS NULL OR done_on GLOB '????-??-??')
);
CREATE INDEX IF NOT EXISTS idx_subgoals_goal ON subgoals(goal_id, sort_order);

-- Time logged against a skill.
--
-- The total of these minutes IS the skill's "XP" — it is a MEASUREMENT of time
-- invested, not a reward. There are deliberately no levels, no thresholds and no
-- milestones anywhere: the number only ever says how long you spent, which is a fact
-- rather than a score. Kept as a log rather than a running total so the history stays
-- honest and a mistaken entry can be removed.
-- One SESSION of a skill. The table is still called skill_time for the reason renaming a
-- live table is never worth a tidier noun, but it no longer measures time: a skill session
-- is a text document, exactly as a workout is.
--
-- `minutes` is NULLABLE and nothing writes it any more. Every hour ever logged is still
-- here — the column was kept rather than dropped, because "preserve data" outranks a clean
-- schema and those hours were real. NULL means "a session happened", which is the whole
-- unit now; a number means "and it was logged under the old hours model".
--
-- An existing database gets this widened in client.ts's ensure(), which rebuilds the table
-- when it finds minutes still NOT NULL. SQLite cannot ALTER a column's nullability.
CREATE TABLE IF NOT EXISTS skill_time (
  id         INTEGER PRIMARY KEY,
  skill_id   INTEGER NOT NULL REFERENCES skills(id),
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  minutes    INTEGER CHECK (minutes IS NULL OR minutes > 0),
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
  -- HOW MUCH OF A DRIFTED BLOCK WAS ACTUALLY WORKED, 0..1. Belongs to a drift and to
  -- nothing else — engine.markBlock nulls it on every other state, exactly as it does the
  -- reason, so a fraction can never survive onto an 'adhered' mark.
  --
  -- NULLABLE, and never DEFAULT 0. For a drift the two are arithmetically identical, so
  -- this is purely about truth: NULL means nobody was asked, 0 means you said none of it.
  -- Every drift written before the slider existed is the former, and a default would have
  -- put words in the owner's mouth retroactively.
  --
  -- 1 is unreachable here in practice: a drift worked in full IS an adherence, and the
  -- write rewrites it as one rather than storing a row that argues with itself.
  worked_fraction REAL CHECK (worked_fraction IS NULL
                              OR (worked_fraction >= 0 AND worked_fraction <= 1)),
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
  -- Owner-chosen hue from the curated palette, for this skill's segment on the Portfolio
  -- ring. NULL = a stable default cycled from the palette by id. Enforced in
  -- engine.setSkillColor, same as pillars.color; never a free hex.
  color      TEXT,
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
  -- A TEXT entry stores image='' and body=<the words>. `image` is NOT NULL and this table
  -- holds real, irreplaceable handwriting, so dropping the constraint would mean a
  -- create-copy-drop-rename rebuild against exactly the data you least want to rebuild.
  -- DELIBERATE: `kind` is the discriminator everywhere. Never test for emptiness.
  kind        TEXT NOT NULL DEFAULT 'drawing' CHECK (kind IN ('drawing','text')),
  body        TEXT,
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

-- THE HANDWRITTEN PAGE IS A SCROLL OF SHEETS — the owner's ruling, 2026-08-25. See the
-- long comment at the top of src/lib/sheets.ts for the whole argument.
--
-- Sheet 0 stays in journal_entries.image/width/height, where every page always lived, so
-- every existing page is already a one-sheet scroll and NOTHING MIGRATES. Sheets 1.. are
-- rows here, one PNG each, keyed (entry_id, seq). A sheet per row rather than one growing
-- image is engineering, not design: Vercel caps a request body, a browser caps a canvas's
-- area, and only the sheets that were touched need to be written back.
--
-- CONTIGUOUS BY CONSTRUCTION. The total is 1 + COUNT(*) here, and engine.saveJournalSheet
-- refuses a seq past that — a gap would be a scroll with a sheet missing from the middle,
-- which no reader could draw honestly. The count is therefore the only thing a reader
-- needs to ask for; it never has to inspect which seqs exist.
--
-- ON DELETE CASCADE is a safety net, not the contract: deleteJournalEntry deletes these
-- rows explicitly inside its transaction, because a table that only stays consistent while
-- a pragma happens to be on is a table that will one day be found inconsistent.
CREATE TABLE IF NOT EXISTS journal_sheets (
  entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  seq      INTEGER NOT NULL CHECK (seq >= 1),
  image    TEXT NOT NULL,
  width    INTEGER,
  height   INTEGER,
  PRIMARY KEY (entry_id, seq)
);

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

-- What you INTEND the day to be, in your own words. One line, set ahead of time and
-- rewriteable — it is an intention, not a record, so changing it is normal rather than
-- revisionism. Deliberately unconnected to adherence, the rings and the score: naming a
-- day "thesis push" must never become something you can succeed or fail at.
CREATE TABLE IF NOT EXISTS day_titles (
  date       TEXT PRIMARY KEY NOT NULL CHECK (date GLOB '????-??-??'),
  title      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Calories through the day. A LOG, not a total: 400 in the morning and 800 later reads
-- 1200, and a mistyped entry is REMOVED rather than retyped. The total is derived on
-- read, so a stored total can never drift out of step with the entries that define it —
-- the same rule that already governs goal progress.
--
-- Deliberately NOT health_logs.calories. That table is the phone's idempotent per-day
-- snapshot, where re-posting a day must REVISE it; a table where one column accumulates
-- while its siblings overwrite is a trap for whoever eventually writes /api/health.
-- Deliberately not `meals` either — that was dropped by the adherence_v1 migration when a
-- single manual total replaced food logging, and its NOT NULL name would force a fake
-- value on every entry.
--
-- Still no food database, no barcode, no API: an entry is one number.
CREATE TABLE IF NOT EXISTS calorie_entries (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  kcal       INTEGER NOT NULL CHECK (kcal > 0),
  note       TEXT,
  -- No CHECK, deliberately: an iOS push later should be a one-line addition rather than a
  -- table rebuild. Same reasoning as tasks.kind.
  source     TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_calorie_entries_date ON calorie_entries(date);

-- DEAD. Nutrition from the pre-pivot app, dropped by the adherence_v1 migration and only
-- recreated here so a fresh DB stays byte-compatible with the migrated one. Nothing reads
-- or writes it. Calories live in calorie_entries above; do not revive this.
-- kcal is deliberately NULLABLE: the rule was to reward consistency and
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

-- Gym days. Deliberately NOT a non-negotiable: the owner trains "any 4 of 5 weekdays",
-- which is a FREQUENCY, and habits.days_mask can only express a fixed schedule. Putting
-- it on the checklist Mon-Fri against an intent of four would guarantee one unticked
-- non-negotiable every week BY DESIGN, and an item engineered to fail teaches distrust
-- of the whole list.
--
-- One row per SESSION. This used to be one row per (date, kind), enforced by a unique
-- index, on the reasoning that two visits in a day were the same event — as 15k steps is
-- the same as 7k. The owner reversed that: two lifts on a Tuesday are two things that
-- happened. The unique index is gone, every writer is addressed by row id, and the ring
-- counts rows (see Metric.perDayCapped in rings.ts).
--
-- title/done_at are carried over from the Discord gym import (tasks.kind='gym') rather
-- than dropped — that history is real and irreplaceable. done_at stays NAIVE LOCAL,
-- copied verbatim; re-interpreting it as UTC would shift every session by the Melbourne
-- offset.
CREATE TABLE IF NOT EXISTS gym_sessions (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  title      TEXT,
  done_at    TEXT,
  note       TEXT,
  -- Strength / cardio / misc. Misc (bouldering, calisthenic skills) is deliberately
  -- TRACKED BUT NOT SCORED — it has no threshold and no ring, and is excluded from the
  -- Physical average. A thing you log that is never a target.
  kind       TEXT NOT NULL DEFAULT 'strength' CHECK (kind IN ('strength','cardio','misc')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
-- NOTE: the index on gym_sessions is NOT declared here. This file runs before the
-- idempotent column back-fills, and CREATE TABLE IF NOT EXISTS silently skips an existing
-- table — so on an upgraded database an index would be created against a `kind` column
-- that does not exist yet. It is created after the ALTERs, in both db/client.ts and
-- scripts/migrate.mjs, which are also where the old UNIQUE index is dropped.

-- One-off tasks that carry themselves forward — deliberately NOT the `tasks` table above,
-- which is the pre-redesign board and now holds only the legacy gym history.
--
-- A task is a single thing decided for a single day ("book the physio"), where a habit is a
-- standing weekday rule. The distinction that matters here is `due` vs `done_on`:
--
--   due      the day it was FIRST for. Never rewritten. It is the task's origin, not a
--            cursor — the carry is derived from it on read (see src/lib/tasks.ts), so
--            there is no nightly job to run twice, miss a day, or fire early at 2am.
--   done_on  the day it was ticked, or NULL. Ticking is what fixes a task to a date, which
--            is what keeps a past day's record true when you read it back.
--
-- It feeds NOTHING — not adherence, not the rings, not the streak, not the coach. A
-- carrying backlog joining adherence's fixed 30-point denominator would make each
-- non-negotiable quietly worth less for reasons nothing you did today caused. See the
-- reasoning in src/lib/tasks.ts.
CREATE TABLE IF NOT EXISTS day_tasks (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  due        TEXT NOT NULL CHECK (due GLOB '????-??-??'),
  done_on    TEXT CHECK (done_on IS NULL OR done_on GLOB '????-??-??'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_day_tasks_due ON day_tasks(due);
CREATE INDEX IF NOT EXISTS idx_day_tasks_done_on ON day_tasks(done_on);

-- A NON-NEGOTIABLE FOR ONE DAY — "Tomorrow, specifically", the owner's ruling 2026-08-21.
--
-- Not a habit (no weekday rule — it exists on exactly one date) and not a day_task (it
-- never carries, and unlike a task it IS scored: it joins its day's habit tally, one more
-- item of the even HABIT_SHARE split, counted in queries.getDayView and /api/adherence).
--
-- `date` is the one day it applies. The engine refuses to create one for today or the
-- past — an item added to a day already being lived would grow that day's denominator
-- mid-day, and (done+floors)/items can FALL when items grows, which is the one thing the
-- climbing figure must never do. Added the evening before, it is part of the denominator
-- the morning knows, exactly like the standing list.
--
-- Unticked after its day, it is simply an unearned share — the day ended where it got to.
-- It stays tickable from that day's own screen (catching up), which is why `done` is a
-- flag on the row rather than a habit_entries row: there is no habit for an entry to
-- reference.
CREATE TABLE IF NOT EXISTS one_off_habits (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  title      TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_one_off_habits_date ON one_off_habits(date);
