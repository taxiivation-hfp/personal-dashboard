// READ-ONLY survey of a remote (Turso) database. Writes nothing, ever.
//
//   node scripts/inspect-prod.mjs
//
// Reads TARGET_DATABASE_URL / TARGET_AUTH_TOKEN — the same names verify-turso.mjs and
// db-copy.mjs already use — from the environment or .env.local.
//
// It exists because the local file database and production are two different databases
// that never sync (see CLAUDE.md), so a migration planned against `data/dashboard.db` is
// planned against the wrong rows. Every count printed here is the one that matters.
//
// THERE IS NO --write AND NO WRITE PATH. Every statement below is a SELECT. If you find
// yourself adding one that is not, add it to db-copy.mjs instead — that script already
// carries the guards a write needs.

import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** .env.local, same shape the other scripts read it in. Real env wins. */
function loadEnv() {
  const p = resolve(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

/**
 * A connection string with every credential removed — scheme, host, nothing else.
 *
 * Lifted from import-strength.mjs, and for its reason: on this deployment the Turso token
 * can ride as an `?authToken=` QUERY PARAMETER inside the URL, so the obvious "strip the
 * userinfo" redaction prints a live read-write JWT into terminal scrollback and into
 * whatever captures that output. Anything that echoes a connection string goes through here.
 */
function safeUrl(u) {
  try {
    const p = new URL(u);
    return `${p.protocol}//${p.host}${p.pathname === "/" ? "" : p.pathname}`;
  } catch {
    return String(u).split("?")[0];
  }
}

const url = process.env.TARGET_DATABASE_URL;
const token = process.env.TARGET_AUTH_TOKEN;

if (!url) {
  console.error(`
FATAL: TARGET_DATABASE_URL is not set (looked in the environment and .env.local).

Add these to .env.local — which is gitignored, so the token stays out of git:

    TARGET_DATABASE_URL=libsql://<db>-<org>.turso.io
    TARGET_AUTH_TOKEN=<token>

Do NOT set DATABASE_URL to the Turso URL. That is what local dev reads, and every write
you made while developing would land in production.
`);
  process.exit(1);
}
if (url.startsWith("file:")) {
  console.error("FATAL: TARGET_DATABASE_URL is a file: URL. This script is for the REMOTE database.");
  process.exit(1);
}

const db = createClient({ url, authToken: token });
const n = (v) => (typeof v === "bigint" ? Number(v) : v);

/** Every query is wrapped: a table missing in production is information, not a crash. */
async function ask(label, sql) {
  try {
    const r = await db.execute(sql);
    console.log(`\n${label}`);
    if (!r.rows.length) console.log("  (no rows)");
    for (const row of r.rows) {
      console.log(
        "  " +
          Object.entries(row)
            .map(([k, v]) => `${k}=${n(v) ?? "NULL"}`)
            .join("  "),
      );
    }
  } catch (e) {
    console.log(`\n${label}\n  ERROR: ${e.message}`);
  }
}

/**
 * A short, non-reversible fingerprint of the token, and WHEN IT WAS MINTED.
 *
 * Both exist because "I pasted a new token" and "the file still holds the old one" are
 * indistinguishable from a 401, and we burned a round trip on exactly that. The fingerprint
 * changes if and only if the value did; `iat` says whether it predates the key rotation
 * that invalidated it. Neither reveals the token — the digest is one-way and truncated, and
 * `iat` is a timestamp.
 */
function tokenId(t) {
  if (!t) return "none";
  const fp = createHash("sha256").update(t).digest("hex").slice(0, 8);
  let minted = "unknown";
  const parts = t.split(".");
  if (parts.length === 3) {
    try {
      const p = JSON.parse(
        Buffer.from(
          parts[1].replace(/-/g, "+").replace(/_/g, "/"),
          "base64",
        ).toString(),
      );
      if (p.iat) minted = new Date(p.iat * 1000).toISOString();
    } catch {} // an opaque token is fine; the fingerprint still tells us if it changed
  }
  return `${fp}  minted ${minted}`;
}

console.log(`target  ${safeUrl(url)}`);
console.log(
  `auth    ${token ? "TARGET_AUTH_TOKEN" : url.includes("authToken=") ? "embedded in URL" : "NONE"}`,
);
console.log(`token   ${tokenId(token ?? (url.split("authToken=")[1] || ""))}`);

/**
 * PREFLIGHT. One trivial query, so a connection problem is reported ONCE, in the server's
 * own words, instead of as the same 401 repeated after every heading below — which reads
 * like seven separate faults and buries the one sentence that explains them.
 *
 * The libSQL client wraps the HTTP body away, so this goes over fetch to keep the server's
 * message. "role was invalidated after token was issued" means the database's keys were
 * rotated after this token was minted: it is not malformed, it is revoked, and no amount of
 * re-pasting the same value will fix it.
 */
{
  const host = url
    .replace(/^libsql:\/\//, "")
    .replace(/^https:\/\//, "")
    .split("?")[0];
  let res;
  try {
    res = await fetch(`https://${host}/v2/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token ?? ""}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requests: [{ type: "execute", stmt: { sql: "SELECT 1" } }, { type: "close" }],
      }),
    });
  } catch (e) {
    console.error(`\nFATAL: could not reach ${host} — ${e.message}`);
    process.exit(1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`\nFATAL: the database refused the connection (HTTP ${res.status}).`);
    console.error(`  ${body.slice(0, 300)}`);
    if (body.includes("role was invalidated")) {
      console.error(`
This token was minted BEFORE the database's keys were last rotated, so Turso has revoked it.
Re-pasting the same value cannot help — mint a genuinely new one:

  * Turso dashboard -> your database -> Create Token   (the CLI has no native Windows build)
  * or copy the working value out of the Vercel project's DATABASE_URL, which production
    is authenticating with right now

Then check the "minted" timestamp printed above actually moves.`);
    }
    process.exit(1);
  }
}

console.log("\n================ READ-ONLY SURVEY ================");

await ask(
  "tables",
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);

// The two the redesign actually turns on.
await ask(
  "gym_sessions by kind  (misc rows are the ones being dropped)",
  "SELECT kind, COUNT(*) AS rows, MIN(date) AS first, MAX(date) AS last FROM gym_sessions GROUP BY kind ORDER BY kind",
);
await ask(
  "skill_time  (minutes goes nullable — how many rows carry one?)",
  "SELECT COUNT(*) AS rows, COUNT(minutes) AS with_minutes, COUNT(note) AS with_note, MIN(date) AS first, MAX(date) AS last FROM skill_time",
);
await ask(
  "skill_time per skill",
  "SELECT s.id, s.name, COUNT(t.id) AS sessions, SUM(t.minutes) AS total_minutes FROM skills s LEFT JOIN skill_time t ON t.skill_id=s.id GROUP BY s.id, s.name ORDER BY s.id",
);
await ask("skills", "SELECT id, name, state, pillar_id FROM skills ORDER BY id");

// Context for the steps change: the ring becomes SUM(steps) over the fortnight.
await ask(
  "health_logs",
  "SELECT COUNT(*) AS days, MIN(date) AS first, MAX(date) AS last, SUM(steps) AS total_steps, MAX(steps) AS best_day FROM health_logs",
);

// Everything irreplaceable, so the migration can be checked against it afterwards.
await ask(
  "row counts elsewhere",
  `SELECT 'goals' AS t, COUNT(*) AS rows FROM goals
   UNION ALL SELECT 'subgoals', COUNT(*) FROM subgoals
   UNION ALL SELECT 'journal_entries', COUNT(*) FROM journal_entries
   UNION ALL SELECT 'habit_entries', COUNT(*) FROM habit_entries
   UNION ALL SELECT 'block_marks', COUNT(*) FROM block_marks
   UNION ALL SELECT 'day_tasks', COUNT(*) FROM day_tasks
   UNION ALL SELECT 'calorie_entries', COUNT(*) FROM calorie_entries`,
);

console.log("\n=================================================");
console.log("Nothing was written. This script has no write path.\n");
