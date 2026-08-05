// One-off importer for a plain-text Discord gym backlog.
//
//   node scripts/import-gym.mjs <file.txt>            # dry run — prints, writes nothing
//   node scripts/import-gym.mjs <file.txt> --write    # actually import
//   node scripts/import-gym.mjs <file.txt> --write --xp
//
// Each Discord message becomes ONE did-list entry (kind='gym') holding the session's
// raw text. Exercise names are NOT normalised and sets are NOT parsed into columns —
// that was a deliberate call: the logs stay as written, and because the raw text is
// preserved a structured backfill remains possible later without re-importing.
//
// XP: OFF by default. A two-year backlog run through the normal did-list rule would
// mint thousands of XP and jump every level overnight, which misrepresents today's
// board. Pass --xp if you'd rather have the retroactive credit.
//
// Idempotent: re-running skips sessions already imported (same date + title).

import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "node:fs";
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

const file = process.argv[2];
const write = process.argv.includes("--write");
const withXp = process.argv.includes("--xp");

if (!file) {
  console.error("usage: node scripts/import-gym.mjs <export.txt> [--write] [--xp]");
  process.exit(1);
}
if (!existsSync(file)) {
  console.error("no such file:", file);
  process.exit(1);
}

// "dan — 21/07/2026, 19:14"  — DD/MM/YYYY. Parsing this as MM/DD would silently
// corrupt every entry whose day is <= 12, which is most of them.
const HEADER = /^(.+?)\s+[—–-]\s+(\d{1,2})\/(\d{1,2})\/(\d{4}),\s+(\d{1,2}):(\d{2})/;

const text = readFileSync(file, "utf8");
const sessions = [];
let cur = null;

for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim();
  const h = line.match(HEADER);
  if (h) {
    const [, , dd, mm, yyyy, HH, MM] = h;
    cur = {
      date: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
      time: `${HH.padStart(2, "0")}:${MM}`,
      title: null,
      lines: [],
    };
    sessions.push(cur);
    continue;
  }
  if (!cur || !line) continue;
  if (cur.title === null) cur.title = line; // first non-empty line is the session title
  else cur.lines.push(line);
}

// A message with a header but no content isn't a workout (join notices, chatter).
const usable = sessions.filter((s) => s.title && s.lines.length);
const skipped = sessions.length - usable.length;

console.log(`parsed ${sessions.length} messages -> ${usable.length} sessions (${skipped} had no set lines)`);
if (usable.length) {
  const dates = usable.map((s) => s.date).sort();
  console.log(`date range: ${dates[0]} .. ${dates[dates.length - 1]}`);
  console.log(`total set lines: ${usable.reduce((n, s) => n + s.lines.length, 0)}`);
  console.log("\nfirst 3:");
  for (const s of usable.slice(0, 3)) {
    console.log(`  ${s.date} ${s.time}  ${s.title}  (${s.lines.length} lines)`);
  }
  console.log("\nlast 3:");
  for (const s of usable.slice(-3)) {
    console.log(`  ${s.date} ${s.time}  ${s.title}  (${s.lines.length} lines)`);
  }
}

if (!write) {
  console.log("\nDRY RUN — nothing written. Re-run with --write to import.");
  process.exit(0);
}

const url = process.env.DATABASE_URL || "file:./data/dashboard.db";
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
await client.execute("PRAGMA foreign_keys = ON");

const pillar = await client.execute("SELECT id FROM pillars WHERE key='physical'");
if (!pillar.rows.length) {
  console.error("no 'physical' pillar — run db:migrate first");
  process.exit(1);
}
const pillarId = Number(pillar.rows[0].id);

let imported = 0;
let already = 0;
for (const s of usable) {
  const title = s.title.replace(/\s+/g, " ").trim();
  const dup = await client.execute({
    sql: "SELECT 1 FROM tasks WHERE date=? AND title=? AND kind='gym' LIMIT 1",
    args: [s.date, title],
  });
  if (dup.rows.length) {
    already++;
    continue;
  }
  const ts = new Date().toISOString();
  const r = await client.execute({
    sql: `INSERT INTO tasks (date,title,pillar_id,done,done_at,notes,source,kind,created_at,updated_at)
          VALUES (?,?,?,1,?,?,'user','gym',?,?)`,
    args: [s.date, title, pillarId, `${s.date}T${s.time}:00`, s.lines.join("\n"), ts, ts],
  });
  if (withXp) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO xp_log (pillar_id,amount,reason,source_type,source_id,date)
            VALUES (?,?, 'task_completed','task',?,?)`,
      args: [pillarId, 10, Number(r.lastInsertRowid), s.date],
    });
  }
  imported++;
}

if (withXp) {
  await client.execute(
    "UPDATE pillars SET xp = COALESCE((SELECT SUM(amount) FROM xp_log WHERE xp_log.pillar_id = pillars.id), 0)"
  );
}

console.log(`\nimported ${imported} sessions, skipped ${already} already present`);
console.log(withXp ? "XP granted and pillars recomputed." : "No XP granted (pass --xp to change that).");
console.log("Note: daily_log/rings are NOT recomputed for historical dates — today's board is untouched.");
client.close();
