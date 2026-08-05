// One-way database copy: local libSQL file  ->  Turso (or any libsql:// target).
//
//   node scripts/db-copy.mjs --to libsql://<db>-<org>.turso.io --token <t>          # DRY RUN
//   node scripts/db-copy.mjs --to libsql://<db>-<org>.turso.io --token <t> --write  # do it
//
// Why a script instead of `turso db shell .dump` / `--from-file`:
//   * the Turso CLI has no native Windows build (WSL only), and this repo's dev box is
//     Windows — this script uses @libsql/client, which is already installed and works.
//   * .dump output is a stream of SQL that has to be replayed statement-by-statement and
//     brings PRAGMA/BEGIN/COMMIT lines with it; a row copy has no parser in the loop.
//   * the whole database is ~35 rows, so a single atomic transaction is enough.
//
// Guarantees:
//   * PRIMARY KEYS ARE PRESERVED. xp_log.source_id points at task ids, tasks.goal_id at
//     goal ids, habit_entries.habit_id at habit ids — renumbering would silently detach
//     history from the rows it describes.
//   * The whole copy runs in ONE write transaction on the target, so a failure halfway
//     leaves the target exactly as it was.
//   * The target is wiped first, so re-running is safe and idempotent (this is a
//     one-way mirror of the local file, never a merge).
//
// It NEVER writes to the source.

import { createClient } from "@libsql/client";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const p = resolve(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const write = argv.includes("--write");
const fromUrl = flag("--from") || "file:./data/dashboard.db";
const toUrl = flag("--to") || process.env.TARGET_DATABASE_URL;
const toToken = flag("--token") || process.env.TARGET_AUTH_TOKEN;
// Reversing --from/--to turns this into the backup job: Turso -> a dated local file.
const fromToken = flag("--from-token") || process.env.TURSO_AUTH_TOKEN;

if (!toUrl) {
  console.error("usage: node scripts/db-copy.mjs --to <libsql-url> --token <auth-token> [--from <url>] [--write]");
  process.exit(1);
}
if (toUrl === fromUrl) {
  console.error("refusing to copy a database onto itself");
  process.exit(1);
}
if (!toUrl.startsWith("file:") && !toToken) {
  console.error("a remote --to needs --token (or TARGET_AUTH_TOKEN)");
  process.exit(1);
}

// Parent-before-child. Inserting in this order keeps the copy valid whether or not the
// target enforces foreign keys, so it does not depend on remote PRAGMA behaviour.
//
// DANGER: this list was previously hand-maintained and had silently fallen four tables
// behind the schema — including journal_entries, the ONLY copy of the owner's
// handwriting. The copy still printed "verified" because it only ever verified the
// tables it had chosen to copy. A missing table here is silent, permanent data loss.
// The assertion below now makes that impossible: if the database contains a table this
// list doesn't mention, the copy refuses to run.
const TABLES = [
  "pillars",
  "goals",
  "tasks",
  "habits",
  "habit_entries",
  "daily_log",
  "xp_log",
  "coach_messages",
  "health_logs",
  "journal_entries",
  "block_marks",
  "skills",
  "app_meta",
  "google_oauth_tokens",
];

// Tables that are intentionally not carried across, so the check below can tell
// "deliberately skipped" apart from "forgotten".
const INTENTIONALLY_SKIPPED = new Set(["meals", "digest_items", "digest_runs"]);

// createClient throws SQLITE_CANTOPEN (14) SYNCHRONOUSLY for a file: URL whose parent
// directory does not exist, so create it before constructing anything.
// Resolved against process.cwd(), which is what @libsql/client itself uses for a
// relative file: URL — run these scripts from the repo root.
for (const u of [fromUrl, toUrl]) {
  const p = u.startsWith("file:") ? u.slice("file:".length) : "";
  if (p && !p.startsWith("//")) mkdirSync(dirname(resolve(process.cwd(), p)), { recursive: true });
}

const src = createClient({ url: fromUrl, authToken: fromToken });
const dst = createClient({ url: toUrl, authToken: toToken });

const q = (id) => `"${id.replace(/"/g, '""')}"`;

async function main() {
  // --- 1. schema on the target -------------------------------------------------
  // Same DDL the app self-heals with, plus the two back-fill columns and the partial
  // unique index that only ever existed in migrate.mjs. Doing it here means the target
  // is a superset of both paths before a single row lands.
  const schema = readFileSync(resolve(root, "src/lib/db/schema.sql"), "utf8");
  if (write) {
    await dst.executeMultiple(schema);
    const tcols = await dst.execute("PRAGMA table_info(tasks)");
    const has = (rows, n) => rows.some((r) => String(r.name) === n);
    if (!has(tcols.rows, "calendar_event_id")) {
      await dst.execute("ALTER TABLE tasks ADD COLUMN calendar_event_id TEXT");
    }
    if (!has(tcols.rows, "kind")) {
      await dst.execute("ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'task'");
    }
    const hcols = await dst.execute("PRAGMA table_info(habits)");
    if (!has(hcols.rows, "escalate")) {
      await dst.execute("ALTER TABLE habits ADD COLUMN escalate INTEGER NOT NULL DEFAULT 0");
    }
    await dst.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_habits_one_escalation ON habits(escalate) WHERE escalate=1"
    );
    console.log("target schema ensured");
  }

  // --- 1b. refuse to copy a database we don't fully understand -------------------
  // The failure this prevents is silent: a table added to the schema but not to
  // TABLES is simply never copied, and the run still reports success.
  const present = (
    await src.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  ).rows.map((r) => String(r.name));
  const unaccounted = present.filter((t) => !TABLES.includes(t) && !INTENTIONALLY_SKIPPED.has(t));
  if (unaccounted.length) {
    console.error(
      `\nREFUSING TO COPY. These tables exist in the source but are in neither TABLES nor` +
        ` INTENTIONALLY_SKIPPED:\n  ${unaccounted.join(", ")}\n` +
        `Add them to one list or the other in scripts/db-copy.mjs. Copying now would lose them silently.`
    );
    process.exit(1);
  }

  // --- 2. read the source ------------------------------------------------------
  const plan = [];
  for (const t of TABLES) {
    const info = await src.execute(`PRAGMA table_info(${q(t)})`);
    if (!info.rows.length) {
      console.log(`  ${t.padEnd(20)} (absent in source, skipped)`);
      continue;
    }
    const cols = info.rows.map((r) => String(r.name));
    const { rows } = await src.execute(`SELECT ${cols.map(q).join(",")} FROM ${q(t)}`);
    plan.push({ table: t, cols, rows });
    console.log(`  ${t.padEnd(20)} ${String(rows.length).padStart(6)} rows  (${cols.length} cols)`);
  }
  const total = plan.reduce((n, p) => n + p.rows.length, 0);
  console.log(`\n${total} rows across ${plan.length} tables`);

  if (!write) {
    console.log("\nDRY RUN — target untouched. Re-run with --write to copy.");
    src.close();
    dst.close();
    return;
  }

  // --- 3. one atomic transaction on the target --------------------------------
  const tx = await dst.transaction("write");
  try {
    // Children first on the way out, parents first on the way in.
    for (const t of [...TABLES].reverse()) {
      await tx.execute(`DELETE FROM ${q(t)}`).catch(() => {});
    }
    for (const { table, cols, rows } of plan) {
      if (!rows.length) continue;
      const sql = `INSERT INTO ${q(table)} (${cols.map(q).join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
      for (const r of rows) {
        await tx.execute({ sql, args: cols.map((c) => (r[c] === undefined ? null : r[c])) });
      }
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }

  // --- 4. prove it ------------------------------------------------------------
  let bad = 0;
  for (const { table, rows } of plan) {
    const r = await dst.execute(`SELECT COUNT(*) AS n FROM ${q(table)}`);
    const n = Number(r.rows[0].n);
    const ok = n === rows.length;
    if (!ok) bad++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${table.padEnd(20)} src=${rows.length} dst=${n}`);
  }
  const fk = await dst.execute("PRAGMA foreign_key_check");
  console.log(`foreign_key_check: ${fk.rows.length} violation(s)`);
  if (fk.rows.length) console.log(JSON.stringify(fk.rows.slice(0, 5), null, 1));

  console.log(bad || fk.rows.length ? "\nCOPY COMPLETED WITH PROBLEMS" : "\ncopy verified");
  src.close();
  dst.close();
  if (bad || fk.rows.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
