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
        `URL (plus TURSO_AUTH_TOKEN) before deploying.`
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

  const schema = readFileSync(resolve(process.cwd(), "src/lib/db/schema.sql"), "utf8");
  await c.executeMultiple(schema);

  // Idempotent column adds (SQLite ALTER errors if the column exists).
  const has = async (table: string, col: string): Promise<boolean> => {
    const r = await c.execute(`PRAGMA table_info(${table})`);
    return r.rows.some((x) => String((x as Record<string, unknown>).name) === col);
  };

  if (!(await has("tasks", "calendar_event_id"))) {
    await c.execute("ALTER TABLE tasks ADD COLUMN calendar_event_id TEXT");
  }
  if (!(await has("gym_sessions", "kind"))) {
    await c.execute("ALTER TABLE gym_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'strength'");
  }
  if (!(await has("journal_entries", "kind"))) {
    await c.execute("ALTER TABLE journal_entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'drawing'");
  }
  if (!(await has("journal_entries", "body"))) {
    await c.execute("ALTER TABLE journal_entries ADD COLUMN body TEXT");
  }
  if (!(await has("pillars", "color"))) {
    await c.execute("ALTER TABLE pillars ADD COLUMN color TEXT");
  }
  if (!(await has("habits", "input"))) {
    await c.execute(
      "ALTER TABLE habits ADD COLUMN input TEXT NOT NULL DEFAULT 'check' CHECK (input IN ('check','number'))"
    );
  }
  if (!(await has("habits", "unit"))) {
    await c.execute("ALTER TABLE habits ADD COLUMN unit TEXT");
  }

  // Only after the back-fills — see the note in schema.sql.
  //
  // SESSIONS, not days. The unique index is DROPPED here rather than merely left unused,
  // and that is load-bearing: this function runs on EVERY app boot, so leaving the old
  // CREATE in place would silently re-add the constraint after the migration and the
  // second workout of a kind would start failing with UNIQUE constraint violations.
  // engine.saveWorkout is addressed by row id and has no ON CONFLICT to fall back on.
  await c.execute("DROP INDEX IF EXISTS idx_gym_sessions_date_kind");
  await c.execute("DROP INDEX IF EXISTS idx_gym_sessions_date");
  await c.execute("CREATE INDEX IF NOT EXISTS idx_gym_sessions_date ON gym_sessions(date)");

  const { rows } = await c.execute("SELECT COUNT(*) AS n FROM pillars");
  if (Number((rows[0] as Record<string, unknown>).n) === 0) {
    await c.batch(
      [
        `INSERT INTO pillars (key,name,priority,sort_order) VALUES
           ('social_capital','Social Capital & Career','high',1),
           ('physical','Physical Embodiment','high',2),
           ('portfolio','Portfolio Expansion','low',3)`,
        // The non-negotiables v2 set. MUST stay in sync with the HABITS_V2 block in
        // scripts/migrate.mjs — a fresh database (e.g. a brand-new Turso instance)
        // is seeded from HERE, not from the migration script.
        `INSERT INTO habits (pillar_id,name,target_value,source,sort_order) VALUES
           ((SELECT id FROM pillars WHERE key='portfolio'),'Journal',1,'manual',1),
           ((SELECT id FROM pillars WHERE key='physical'),'Tidy room',1,'manual',2),
           ((SELECT id FROM pillars WHERE key='portfolio'),'Read 10 pages',1,'manual',3),
           ((SELECT id FROM pillars WHERE key='physical'),'Sleep by set time',1,'manual',4),
           ((SELECT id FROM pillars WHERE key='portfolio'),'Mandarin 15 min',1,'manual',5),
           ((SELECT id FROM pillars WHERE key='social_capital'),'One outreach message',1,'manual',6),
           ((SELECT id FROM pillars WHERE key='physical'),'Steps',8000,'health',7)`,
        // Marks v2 as already applied so migrate.mjs doesn't re-run its reshape.
        `INSERT INTO app_meta (key,value) VALUES ('timezone','Australia/Melbourne'),('habits_v2','1')`,
      ],
      "write"
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
