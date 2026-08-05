// Idempotent migration + seed for the local libSQL file.
//   node scripts/migrate.mjs          -> create schema (if needed) + seed (if empty)
//   node scripts/migrate.mjs --reset  -> delete the db file first, then recreate
import { createClient } from "@libsql/client";
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Minimal .env.local loader (node doesn't auto-load it for plain scripts).
function loadEnv() {
  const p = resolve(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const url = process.env.DATABASE_URL || "file:./data/dashboard.db";
const reset = process.argv.includes("--reset");

if (url.startsWith("file:")) {
  const file = resolve(root, url.slice("file:".length));
  mkdirSync(dirname(file), { recursive: true });
  if (reset) {
    for (const f of [file, `${file}-wal`, `${file}-shm`]) if (existsSync(f)) rmSync(f);
    console.log("reset: removed", file);
  }
}

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

const schema = readFileSync(resolve(__dirname, "../src/lib/db/schema.sql"), "utf8");

async function main() {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(schema);

  // Additive column back-fills for databases created before a column existed.
  // CREATE TABLE IF NOT EXISTS won't add columns to an existing table, so each new
  // one needs an explicit guarded ALTER here.
  const taskCols = await client.execute("PRAGMA table_info(tasks)");
  const hasTaskCol = (name) => taskCols.rows.some((r) => String(r.name) === name);
  if (!hasTaskCol("calendar_event_id")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN calendar_event_id TEXT");
  }
  if (!hasTaskCol("kind")) {
    await client.execute("ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'task'");
    console.log("added tasks.kind");
  }

  const habitCols = await client.execute("PRAGMA table_info(habits)");
  if (!habitCols.rows.some((r) => String(r.name) === "escalate")) {
    await client.execute("ALTER TABLE habits ADD COLUMN escalate INTEGER NOT NULL DEFAULT 0");
    console.log("added habits.escalate");
  }
  // Created here rather than in schema.sql: on an existing database schema.sql runs
  // before the ALTER above, so an index over `escalate` would reference a column that
  // doesn't exist yet and abort the whole migration.
  await client.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_habits_one_escalation ON habits(escalate) WHERE escalate=1"
  );

  const { rows } = await client.execute("SELECT COUNT(*) AS n FROM pillars");
  if (Number(rows[0].n) === 0) {
    await client.batch(
      [
        `INSERT INTO pillars (key,name,priority,sort_order) VALUES
           ('social_capital','Social Capital & Career','high',1),
           ('physical','Physical Embodiment','high',2),
           ('portfolio','Portfolio Expansion','low',3)`,
        `INSERT INTO habits (pillar_id,name,target_value,sort_order) VALUES
           ((SELECT id FROM pillars WHERE key='physical'),'Train',1,1),
           ((SELECT id FROM pillars WHERE key='physical'),'Eat well',1,2),
           ((SELECT id FROM pillars WHERE key='physical'),'Sleep',1,3),
           ((SELECT id FROM pillars WHERE key='physical'),'Steps',8000,4)`,
        `INSERT INTO app_meta (key,value) VALUES ('timezone','Australia/Melbourne')`,
      ],
      "write"
    );
    console.log("seeded pillars + habits + meta");
  } else {
    console.log("seed skipped (pillars already present)");
  }

  // --- Non-negotiables v2 -------------------------------------------------
  // Six manual habits spanning all three pillars, plus Steps waiting on the health
  // feed. Runs ONCE (guarded by app_meta) so it can't clobber later hand-edits.
  // Nothing is deleted: retired habits are deactivated and Sleep is RENAMED rather
  // than replaced, so every existing habit_entries row keeps pointing somewhere real.
  const v2 = await client.execute("SELECT value FROM app_meta WHERE key='habits_v2'");
  if (!v2.rows.length) {
    const HABITS_V2 = [
      ["Journal", "portfolio", 1, "manual", 1],
      ["Tidy room", "physical", 1, "manual", 2],
      ["Read 10 pages", "portfolio", 1, "manual", 3],
      ["Sleep by set time", "physical", 1, "manual", 4],
      ["Mandarin 15 min", "portfolio", 1, "manual", 5],
      ["One outreach message", "social_capital", 1, "manual", 6],
      // source='health' => auto-checked once the Phase 3 feed exists; until then it
      // renders as pending rather than inviting a tap that would fabricate a count.
      ["Steps", "physical", 8000, "health", 7],
    ];

    await client.execute("UPDATE habits SET name='Sleep by set time' WHERE name='Sleep'");
    await client.execute("UPDATE habits SET active=0 WHERE name IN ('Train','Eat well')");

    for (const [name, pillar, target, source, order] of HABITS_V2) {
      await client.execute({
        sql: `INSERT INTO habits (pillar_id,name,target_value,source,sort_order,active)
              SELECT (SELECT id FROM pillars WHERE key=?), ?, ?, ?, ?, 1
              WHERE NOT EXISTS (SELECT 1 FROM habits WHERE name=?)`,
        args: [pillar, name, target, source, order, name],
      });
      await client.execute({
        sql: `UPDATE habits SET pillar_id=(SELECT id FROM pillars WHERE key=?),
              target_value=?, source=?, sort_order=?, active=1 WHERE name=?`,
        args: [pillar, target, source, order, name],
      });
    }
    await client.execute("INSERT INTO app_meta (key,value) VALUES ('habits_v2','1')");
    console.log("non-negotiables v2: 6 manual + Steps (health), retired Train / Eat well");
  }

  // --- Skill board seed -----------------------------------------------------
  // Seeded from the names in the owner's own build spec, so the board is real on first
  // sight rather than an empty shell. Runs once; rename or delete freely afterwards.
  const sk = await client.execute("SELECT value FROM app_meta WHERE key='skills_v1'");
  if (!sk.rows.length) {
    const SKILLS = [
      ["Mandarin", "portfolio", "active", 1],
      ["Ice skating", "physical", "active", 2],
      ["Badminton", "physical", "parked", 3],
      ["Singing", "portfolio", "parked", 4],
      ["Instruments", "portfolio", "parked", 5],
      ["Dancing", "physical", "parked", 6],
      ["Calisthenics", "physical", "parked", 7],
    ];
    for (const [name, pillar, state, order] of SKILLS) {
      await client.execute({
        sql: `INSERT INTO skills (name,pillar_id,state,sort_order)
              SELECT ?, (SELECT id FROM pillars WHERE key=?), ?, ?
              WHERE NOT EXISTS (SELECT 1 FROM skills WHERE name=?)`,
        args: [name, pillar, state, order, name],
      });
    }
    await client.execute("INSERT INTO app_meta (key,value) VALUES ('skills_v1','1')");
    console.log("seeded skill board: 2 active, 5 parked");
  }

  // === adherence_v1 =========================================================
  // The reframe from accomplishment to adherence. ADDITIVE ONLY. Runs once.
  //
  // Nothing containing a row is dropped and no column is ever dropped: retiring XP,
  // the digest and the rest happens in CODE, not in DDL. Dropping columns rewrites the
  // whole table, and journal_entries holds the only copy of the owner's handwriting —
  // rewriting it to reclaim four verifiably-empty columns is maximum downside for
  // nothing. The only destructive statements here touch a 0-row table and an index.
  const adh = await client.execute("SELECT value FROM app_meta WHERE key='adherence_v1'");
  if (!adh.rows.length) {
    const habitCols2 = await client.execute("PRAGMA table_info(habits)");
    const hasHabitCol = (n) => habitCols2.rows.some((r) => String(r.name) === n);
    if (!hasHabitCol("days_mask")) {
      await client.execute("ALTER TABLE habits ADD COLUMN days_mask INTEGER NOT NULL DEFAULT 127");
    }
    if (!hasHabitCol("system_key")) {
      await client.execute("ALTER TABLE habits ADD COLUMN system_key TEXT");
    }

    // Stable keys for the two habits the engine special-cases by name.
    await client.execute("UPDATE habits SET system_key='journal' WHERE name='Journal' AND system_key IS NULL");
    await client.execute("UPDATE habits SET system_key='steps' WHERE name='Steps' AND system_key IS NULL");

    // Step tracking is CUT. Deactivate rather than delete — same treatment already
    // given to Train / Eat well, so the row and any history survive.
    await client.execute("UPDATE habits SET active=0 WHERE name='Steps'");

    // The at-most-one-escalating-habit index existed only for Twilio calls, which are
    // cut. The column stays; only the index goes.
    await client.execute("DROP INDEX IF EXISTS idx_habits_one_escalation");

    // Open Food Facts logging is replaced by a single manual daily total.
    // Verified 0 rows before this was written — the only table dropped in the plan.
    const mealCount = await client.execute("SELECT COUNT(*) n FROM meals").catch(() => ({ rows: [{ n: 0 }] }));
    if (Number(mealCount.rows[0].n) === 0) {
      await client.execute("DROP TABLE IF EXISTS meals");
    } else {
      console.log(`!! meals has ${mealCount.rows[0].n} rows — NOT dropping it. Migrate that data first.`);
    }

    await client.execute("INSERT INTO app_meta (key,value) VALUES ('adherence_v1','1')");
    console.log("adherence_v1: habits.days_mask + system_key added, Steps deactivated, meals dropped (0 rows)");
  }

  // === subgoals + skill time (MVP seed) ====================================
  // Neither is editable in the UI this pass, so the data layer defines them.
  const sg = await client.execute("SELECT value FROM app_meta WHERE key='subgoals_v1'");
  if (!sg.rows.length) {
    const goals = await client.execute("SELECT id,title FROM goals ORDER BY id");
    // Weights are fractions of the parent and sum to 1.0 per goal.
    const SEED = {
      "Consistent Strength": [
        ["Train 3x/week for a month", 0.3],
        ["Hit a 100kg squat", 0.25],
        ["Hold a routine for 8 weeks", 0.25],
        ["Log every session for a month", 0.2],
      ],
      "Grow Network": [
        ["Reach out to 10 new people", 0.3],
        ["Attend 3 events", 0.25],
        ["Follow up with everyone met", 0.25],
        ["Keep one ongoing conversation", 0.2],
      ],
    };
    for (const g of goals.rows) {
      const items = SEED[String(g.title)];
      if (!items) continue;
      let i = 1;
      for (const [title, weight] of items) {
        await client.execute({
          sql: `INSERT INTO subgoals (goal_id,title,weight,sort_order)
                SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM subgoals WHERE goal_id=? AND title=?)`,
          args: [Number(g.id), title, weight, i++, Number(g.id), title],
        });
      }
    }
    await client.execute("INSERT INTO app_meta (key,value) VALUES ('subgoals_v1','1')");
    console.log("seeded subgoals for existing goals");
  }

  const st = await client.execute("SELECT value FROM app_meta WHERE key='skill_time_v1'");
  if (!st.rows.length) {
    // A little real time so the column isn't empty on first view. Parked skills get
    // entries too — the whole point is seeing everything you've put time into.
    const SEED = { Mandarin: 640, "Ice skating": 300, Badminton: 180, Singing: 95, Calisthenics: 220 };
    for (const [name, minutes] of Object.entries(SEED)) {
      const s = await client.execute({ sql: "SELECT id FROM skills WHERE name=?", args: [name] });
      if (!s.rows.length) continue;
      await client.execute({
        sql: `INSERT INTO skill_time (skill_id,date,minutes,note)
              SELECT ?,?,?,'seeded' WHERE NOT EXISTS (SELECT 1 FROM skill_time WHERE skill_id=?)`,
        args: [Number(s.rows[0].id), new Date().toISOString().slice(0, 10), minutes, Number(s.rows[0].id)],
      });
    }
    await client.execute("INSERT INTO app_meta (key,value) VALUES ('skill_time_v1','1')");
    console.log("seeded skill time");
  }

  // ---------------------------------------------------------------- rings v1
  // Wires the three pillar sufficiency rings to real sources.
  const rv = await client.execute("SELECT value FROM app_meta WHERE key='rings_v1'");
  if (!rv.rows.length) {
    // 1. The Social ring reads the outreach habit by SYSTEM_KEY, never by name — the
    //    owner can rename their non-negotiables, and a name lookup would break silently
    //    the moment they did. Habit 9 currently has system_key NULL.
    //    Matched by id AND name so a reordered database cannot mislabel the wrong row.
    await client.execute({
      sql: "UPDATE habits SET system_key='outreach', updated_at=? WHERE id=9 AND name='One outreach message' AND system_key IS NULL",
      args: [new Date().toISOString()],
    });
    // Partial index: two habits can never claim the same key, while the many NULLs stay
    // unconstrained. Same approach as the escalate flag (schema.sql).
    await client.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_habits_system_key ON habits(system_key) WHERE system_key IS NOT NULL"
    );

    // 2. Rescue the gym log from `tasks`, which nothing reads (HANDOFF §3). Copied, not
    //    moved — the tasks rows stay put. INSERT OR IGNORE because the unique index on
    //    date would otherwise abort the whole migration on two sessions in one day.
    await client.execute(
      `INSERT OR IGNORE INTO gym_sessions (date,title,done_at,note)
       SELECT date, title, done_at, notes FROM tasks WHERE kind='gym'`
    );

    // 3. Gym leaves the non-negotiables. SOFT (active=0), matching deleteHabit — it
    //    preserves any entries and the owner can turn it back on from /habits.
    await client.execute({
      sql: "UPDATE habits SET active=0, updated_at=? WHERE id=10 AND name='Gym'",
      args: [new Date().toISOString()],
    });

    // 4. When the rings started observing. Without this, day one is indistinguishable
    //    from fourteen days of neglect.
    await client.execute({
      sql: "INSERT INTO app_meta (key,value) VALUES ('rings_since',?)",
      args: [new Date().toISOString().slice(0, 10)],
    });

    await client.execute("INSERT INTO app_meta (key,value) VALUES ('rings_v1','1')");
    const g = await client.execute("SELECT COUNT(*) AS n FROM gym_sessions");
    console.log(`rings v1: outreach keyed, gym unhooked, ${Number(g.rows[0].n)} gym sessions rescued`);
  }

  console.log("migration complete:", url);
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
