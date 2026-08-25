import { createClient, type Client } from "@libsql/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Server-only DB access. One client per process (reused across hot reloads in dev).
// FK enforcement is OFF by default in SQLite/libSQL — we enable + assert it once,
// and self-heal the schema/seed so a fresh clone "just runs".

const url = process.env.DATABASE_URL || "file:./data/dashboard.db";

// FAIL FAST on first DB access. A container filesystem is ephemeral: if this ever runs
// in production against a file: URL, every write lands on disk that is destroyed on the
// next machine restart — silently, with no error, until the day the board is empty and
// the Google tokens are gone.
//
// Checked here rather than at module scope on purpose: `next build` sets
// NODE_ENV=production while collecting page data, so a module-level throw would break
// every local production build. This still fires on the very first real request.
function assertProductionDatabase(): void {
  if (process.env.NODE_ENV === "production" && url.startsWith("file:")) {
    throw new Error(
      `DATABASE_URL is "${url}" in production. A file-backed database on an ephemeral ` +
        `container filesystem loses ALL data on restart. Set DATABASE_URL to a libsql:// ` +
        `URL (plus TURSO_AUTH_TOKEN) before deploying.`,
    );
  }
}

type G = typeof globalThis & { __db?: Client; __dbReady?: Promise<Client> };
const g = globalThis as G;

function makeClient(): Client {
  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

async function ensure(c: Client): Promise<Client> {
  await c.execute("PRAGMA foreign_keys = ON");
  const fk = await c.execute("PRAGMA foreign_keys");
  if (Number((fk.rows[0] as Record<string, unknown>)?.foreign_keys) !== 1) {
    throw new Error("Could not enable foreign_keys pragma");
  }

  const schema = readFileSync(
    resolve(process.cwd(), "src/lib/db/schema.sql"),
    "utf8",
  );
  await c.executeMultiple(schema);

  // Idempotent column adds (SQLite ALTER errors if the column exists).
  const has = async (table: string, col: string): Promise<boolean> => {
    const r = await c.execute(`PRAGMA table_info(${table})`);
    return r.rows.some(
      (x) => String((x as Record<string, unknown>).name) === col,
    );
  };

  if (!(await has("tasks", "calendar_event_id"))) {
    await c.execute("ALTER TABLE tasks ADD COLUMN calendar_event_id TEXT");
  }
  if (!(await has("gym_sessions", "kind"))) {
    await c.execute(
      "ALTER TABLE gym_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'strength'",
    );
  }
  if (!(await has("journal_entries", "kind"))) {
    await c.execute(
      "ALTER TABLE journal_entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'drawing'",
    );
  }
  if (!(await has("journal_entries", "body"))) {
    await c.execute("ALTER TABLE journal_entries ADD COLUMN body TEXT");
  }
  if (!(await has("pillars", "color"))) {
    await c.execute("ALTER TABLE pillars ADD COLUMN color TEXT");
  }
  if (!(await has("habits", "input"))) {
    await c.execute(
      "ALTER TABLE habits ADD COLUMN input TEXT NOT NULL DEFAULT 'check' CHECK (input IN ('check','number'))",
    );
  }
  if (!(await has("habits", "unit"))) {
    await c.execute("ALTER TABLE habits ADD COLUMN unit TEXT");
  }
  // The document behind a non-negotiable — outreach, today. A nullable ADD COLUMN cannot
  // lose a row, so like worked_fraction below it needs no migrate.mjs block and no backup:
  // every tick already made stays a tick with nothing written.
  if (!(await has("habit_entries", "note"))) {
    await c.execute("ALTER TABLE habit_entries ADD COLUMN note TEXT");
  }
  // How much of a drifted block was worked. Nullable with no default, so every drift
  // already on record stays "nobody was asked" rather than being back-filled with a zero
  // the owner never typed. A nullable ADD COLUMN cannot lose a row, which is why this
  // needs no migrate.mjs block and no backup step.
  if (!(await has("block_marks", "worked_fraction"))) {
    await c.execute(
      `ALTER TABLE block_marks ADD COLUMN worked_fraction REAL
         CHECK (worked_fraction IS NULL
                OR (worked_fraction >= 0 AND worked_fraction <= 1))`,
    );
  }

  /**
   * skill_time.minutes goes NULLABLE — skills log SESSIONS now, not hours.
   *
   * SQLite cannot alter a column's nullability, so this is the standard rebuild: new table,
   * copy every row, drop, rename. It runs inside one transaction via batch(), so a failure
   * halfway leaves the original table exactly as it was.
   *
   * IDEMPOTENT BY INSPECTION, not by a latch: it fires only when PRAGMA table_info still
   * reports minutes as NOT NULL. That matters because ensure() runs on EVERY boot — the
   * same trap the gym index comment below describes — and a rebuild that ran unconditionally
   * would rewrite the whole table on every cold start.
   *
   * The column is KEPT rather than dropped. Every hour logged under the old model is real
   * data and "preserve data; migrate, never drop" outranks a tidy schema. Nothing writes it
   * from here on, so NULL comes to mean "a session, logged the current way".
   *
   * No FK anywhere points AT skill_time, so dropping it cannot orphan another table's rows;
   * its own FK to skills(id) is re-declared and every copied row already satisfies it.
   */
  const skillMinutesNotNull = async (): Promise<boolean> => {
    const r = await c.execute("PRAGMA table_info(skill_time)");
    return r.rows.some((x) => {
      const col = x as Record<string, unknown>;
      return String(col.name) === "minutes" && Number(col.notnull) === 1;
    });
  };
  if (await skillMinutesNotNull()) {
    await c.batch(
      [
        `CREATE TABLE skill_time_rebuild (
           id         INTEGER PRIMARY KEY,
           skill_id   INTEGER NOT NULL REFERENCES skills(id),
           date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
           minutes    INTEGER CHECK (minutes IS NULL OR minutes > 0),
           note       TEXT,
           created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
         )`,
        // Columns named explicitly: a bare INSERT ... SELECT * would silently mis-map if
        // the source table's order ever differed from the declaration above.
        `INSERT INTO skill_time_rebuild (id, skill_id, date, minutes, note, created_at)
           SELECT id, skill_id, date, minutes, note, created_at FROM skill_time`,
        "DROP TABLE skill_time",
        "ALTER TABLE skill_time_rebuild RENAME TO skill_time",
        "CREATE INDEX IF NOT EXISTS idx_skill_time_skill ON skill_time(skill_id, date)",
      ],
      "write",
    );
  }

  // chapters arrived after the last migration latch, so ensure() creates it here as well
  // as in schema.sql — a database that never runs db:migrate still gets it, which is every
  // deployed one (the schema is applied on boot, and CREATE TABLE IF NOT EXISTS is a no-op
  // on an existing database but not on a new table).
  await c.execute(`CREATE TABLE IF NOT EXISTS chapters (
    month      TEXT PRIMARY KEY NOT NULL CHECK (month GLOB '????-??'),
    name       TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`);

  // day_titles arrived after the last migration latch, so ensure() creates it here as
  // well as in schema.sql — a dev DB that never runs db:migrate still gets it.
  await c.execute(`CREATE TABLE IF NOT EXISTS day_titles (
    date       TEXT PRIMARY KEY NOT NULL CHECK (date GLOB '????-??-??'),
    title      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`);

  // Only after the back-fills — see the note in schema.sql.
  //
  // SESSIONS, not days. The unique index is DROPPED here rather than merely left unused,
  // and that is load-bearing: this function runs on EVERY app boot, so leaving the old
  // CREATE in place would silently re-add the constraint after the migration and the
  // second workout of a kind would start failing with UNIQUE constraint violations.
  // engine.saveWorkout is addressed by row id and has no ON CONFLICT to fall back on.
  await c.execute("DROP INDEX IF EXISTS idx_gym_sessions_date_kind");
  await c.execute("DROP INDEX IF EXISTS idx_gym_sessions_date");
  await c.execute(
    "CREATE INDEX IF NOT EXISTS idx_gym_sessions_date ON gym_sessions(date)",
  );

  const { rows } = await c.execute("SELECT COUNT(*) AS n FROM pillars");
  if (Number((rows[0] as Record<string, unknown>).n) === 0) {
    await c.batch(
      [
        `INSERT INTO pillars (key,name,priority,sort_order) VALUES
           ('social_capital','Social Capital & Career','high',1),
           ('physical','Physical Embodiment','high',2),
           ('portfolio','Portfolio Expansion','low',3)`,
        // The non-negotiables at their FINAL migrated state, system_key included. MUST
        // stay in sync with scripts/migrate.mjs (HABITS_V2 + the system_key stamps +
        // the round3 Weight insert) — a fresh database (e.g. a brand-new Turso
        // instance) is seeded from HERE, not from the migration script.
        //
        // system_key is load-bearing, not decoration: the Journal row opens the drawing
        // dialog ONLY as system_key='journal', outreach feeds the Social ring, weight is
        // the number field. This seed used to omit the column, and the first deployed
        // Turso instance was born from it — every system row silently disarmed, the
        // Journal row a plain tickbox. Steps is seeded already-retired (active=0), the
        // state migrate.mjs leaves it in: steps live in health_logs, not the checklist.
        `INSERT INTO habits (pillar_id,name,target_value,source,sort_order,active,system_key,input,unit) VALUES
           ((SELECT id FROM pillars WHERE key='portfolio'),'Journal',1,'manual',1,1,'journal','check',NULL),
           ((SELECT id FROM pillars WHERE key='physical'),'Tidy room',1,'manual',2,1,NULL,'check',NULL),
           ((SELECT id FROM pillars WHERE key='portfolio'),'Read 10 pages',1,'manual',3,1,'reading','check',NULL),
           ((SELECT id FROM pillars WHERE key='physical'),'Sleep by set time',1,'manual',4,1,NULL,'check',NULL),
           ((SELECT id FROM pillars WHERE key='portfolio'),'Mandarin 15 min',1,'manual',5,1,NULL,'check',NULL),
           ((SELECT id FROM pillars WHERE key='social_capital'),'One outreach message',1,'manual',6,1,'outreach','check',NULL),
           ((SELECT id FROM pillars WHERE key='physical'),'Steps',8000,'health',7,0,'steps','check',NULL),
           ((SELECT id FROM pillars WHERE key='physical'),'Weight',1,'manual',8,1,'weight','number','kg')`,
        // Marks v2 as already applied so migrate.mjs doesn't re-run its reshape.
        `INSERT INTO app_meta (key,value) VALUES ('timezone','Australia/Melbourne'),('habits_v2','1')`,
      ],
      "write",
    );
  }

  // System keys, HEALED. A database seeded before the seed above carried system_key —
  // the live Turso instance is one — has a Journal row that cannot open the drawing
  // dialog, an outreach row the Social ring cannot find, and no Weight row at all,
  // while everything else works. Stamps NULLs by canonical name only and latches, so a
  // deliberate rename or reassignment is never overruled on a later boot. Mirrors the
  // adherence_v1 / rings_v1 / round3_v1 blocks in scripts/migrate.mjs, which never run
  // in production. On a database migrate.mjs HAS shaped, every statement is a no-op.
  const keyed = await c.execute(
    "SELECT 1 FROM app_meta WHERE key='system_keys_v1'",
  );
  if (!keyed.rows.length) {
    await c.execute(
      "UPDATE habits SET system_key='journal' WHERE name='Journal' AND system_key IS NULL",
    );
    await c.execute(
      "UPDATE habits SET system_key='steps' WHERE name='Steps' AND system_key IS NULL",
    );
    await c.execute(
      "UPDATE habits SET system_key='outreach' WHERE name='One outreach message' AND system_key IS NULL",
    );
    // Step tracking was cut as a HABIT (the checklist's Steps row reads health_logs);
    // deactivated, never deleted, exactly as migrate.mjs treats it — history survives.
    await c.execute("UPDATE habits SET active=0 WHERE system_key='steps'");
    // Daily weight, exactly as round3_v1 inserts it — keyed so it survives a rename.
    await c.execute(`INSERT INTO habits (pillar_id,name,target_value,source,cadence,active,days_mask,system_key,input,unit,sort_order)
       SELECT (SELECT id FROM pillars WHERE key='physical'),'Weight',1,'manual','daily',1,127,'weight','number','kg',
              (SELECT COALESCE(MAX(sort_order),0)+1 FROM habits)
       WHERE NOT EXISTS (SELECT 1 FROM habits WHERE system_key='weight')`);
    // Two habits can never claim the same key; the many NULLs stay unconstrained.
    await c.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_habits_system_key ON habits(system_key) WHERE system_key IS NOT NULL",
    );
    await c.execute(
      "INSERT INTO app_meta (key,value) VALUES ('system_keys_v1','1')",
    );
  }

  // READING BECAME A LOGGER — the owner's ruling, 2026-08-21: the reading row opens a
  // document (pages read + what it left you with), the same surface outreach writes on.
  // That needs a stable identity, and name-matching is exactly what system_key exists to
  // replace — so the key is stamped once, by canonical name, and LATCHED: a later rename
  // or a deliberate un-keying is never overruled on the next boot. Mirrors the
  // system_keys_v1 block above; on a database where the row was renamed first, the stamp
  // simply misses and the row stays a plain tick, which is the honest fallback.
  const readingKeyed = await c.execute(
    "SELECT 1 FROM app_meta WHERE key='system_keys_v2'",
  );
  if (!readingKeyed.rows.length) {
    // AT MOST ONE ROW, the ACTIVE one — and this is load-bearing, not tidy. Unlike the
    // v1 stamps, this runs on databases where idx_habits_system_key (UNIQUE) already
    // exists, and deleteHabit is soft: a retired 'Read 10 pages' plus a re-created one
    // are both name-matched with NULL keys, and a bare UPDATE stamping both would abort
    // on the index — ensure() throws, the latch is never written, and EVERY boot fails
    // the same way. Restricting to the single active row also keeps the fallback honest:
    // a renamed or retired row simply stays a plain tick.
    await c.execute(
      `UPDATE habits SET system_key='reading'
        WHERE id = (SELECT id FROM habits
                     WHERE name='Read 10 pages' AND system_key IS NULL AND active=1
                     ORDER BY id LIMIT 1)`,
    );
    await c.execute(
      "INSERT INTO app_meta (key,value) VALUES ('system_keys_v2','1')",
    );
  }

  // THREE NEW NON-NEGOTIABLES — the owner's ask, 2026-08-24/25. "Calendar" and "Vitamins"
  // are plain ticks; "ASC.ND" is a DOCUMENT habit (system_key 'ascnd'), the same logger
  // surface outreach and reading open — DOC_HABITS in Today.tsx and the written-log
  // queries both key on 'ascnd'. Latched like system_keys_v2 above: seeded once, so a
  // later rename, re-pillar or removal is never overruled on the next boot. Guards inside
  // the INSERTs make even the first run safe against rows the owner already created by
  // hand.
  const aug24 = await c.execute(
    "SELECT 1 FROM app_meta WHERE key='habits_aug24_v1'",
  );
  if (!aug24.rows.length) {
    await c.execute(`INSERT INTO habits (pillar_id,name,target_value,source,cadence,active,days_mask,system_key,input,unit,sort_order)
       SELECT NULL,'Calendar',1,'manual','daily',1,127,NULL,'check',NULL,
              (SELECT COALESCE(MAX(sort_order),0)+1 FROM habits)
       WHERE NOT EXISTS (SELECT 1 FROM habits WHERE name='Calendar' AND active=1)`);
    await c.execute(`INSERT INTO habits (pillar_id,name,target_value,source,cadence,active,days_mask,system_key,input,unit,sort_order)
       SELECT (SELECT id FROM pillars WHERE key='physical'),'Vitamins',1,'manual','daily',1,127,NULL,'check',NULL,
              (SELECT COALESCE(MAX(sort_order),0)+1 FROM habits)
       WHERE NOT EXISTS (SELECT 1 FROM habits WHERE name='Vitamins' AND active=1)`);
    await c.execute(`INSERT INTO habits (pillar_id,name,target_value,source,cadence,active,days_mask,system_key,input,unit,sort_order)
       SELECT (SELECT id FROM pillars WHERE key='portfolio'),'ASC.ND',1,'manual','daily',1,127,'ascnd','check',NULL,
              (SELECT COALESCE(MAX(sort_order),0)+1 FROM habits)
       WHERE NOT EXISTS (SELECT 1 FROM habits WHERE system_key='ascnd')`);
    await c.execute(
      "INSERT INTO app_meta (key,value) VALUES ('habits_aug24_v1','1')",
    );
  }

  // Every skill belongs to Portfolio — the owner's ruling. See the skills_portfolio_v1
  // block in scripts/migrate.mjs for the reasoning; this is its mirror, so a dev database
  // that never runs db:migrate lands in the same place.
  //
  // LATCHED, not unconditional, unlike the index drop above it. That drop enforces an
  // invariant the code depends on; this is a one-time move of existing rows, and running
  // it on every boot would quietly overrule any future decision to file a skill elsewhere.
  //
  // Placed AFTER the pillars seed: on a brand-new database the subquery would otherwise
  // resolve to NULL and file every skill under no pillar at all.
  const latched = await c.execute(
    "SELECT 1 FROM app_meta WHERE key='skills_portfolio_v1'",
  );
  if (!latched.rows.length) {
    await c.execute(`UPDATE skills
         SET pillar_id = (SELECT id FROM pillars WHERE key='portfolio'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE pillar_id IS NOT (SELECT id FROM pillars WHERE key='portfolio')`);
    await c.execute(
      "INSERT INTO app_meta (key,value) VALUES ('skills_portfolio_v1','1')",
    );
  }

  return c;
}

/** Get the ready DB client (schema ensured, FK on). Use everywhere server-side. */
export function getDb(): Promise<Client> {
  assertProductionDatabase();
  if (!g.__db) g.__db = makeClient();
  if (!g.__dbReady) {
    // On a failed init (e.g. transient FS error), clear the cached promise so the next
    // request retries instead of being stuck on a permanently-rejected promise.
    g.__dbReady = ensure(g.__db).catch((e) => {
      g.__dbReady = undefined;
      throw e;
    });
  }
  return g.__dbReady;
}

export type { Client };
