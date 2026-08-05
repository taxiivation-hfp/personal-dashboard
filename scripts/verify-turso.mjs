// Probe a target database for the behaviours this app DEPENDS on.
// Run this the moment you have a Turso URL + token, BEFORE copying any data.
//
//   node scripts/verify-turso.mjs --to libsql://<db>-<org>.turso.io --token <t>
//   node scripts/verify-turso.mjs --to file:./data/dashboard.db          (baseline)
//
// Every check corresponds to a line of src/lib/db/client.ts or src/lib/engine.ts that
// would fail at runtime, on a real request, if the remote answer differs from local.
// It creates and drops two temp tables prefixed __probe_ and touches nothing else.

import { createClient } from "@libsql/client";

const argv = process.argv.slice(2);
const flag = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const url = flag("--to") || process.env.TARGET_DATABASE_URL;
const token = flag("--token") || process.env.TARGET_AUTH_TOKEN;
if (!url) {
  console.error("usage: node scripts/verify-turso.mjs --to <url> [--token <t>]");
  process.exit(1);
}

const c = createClient({ url, authToken: token });
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

const t0 = Date.now();
await c.execute("SELECT 1");
const rtt = Date.now() - t0;
console.log(`round-trip: ${rtt}ms   (10 sequential reads per page load => ~${rtt * 10}ms floor)\n`);

// 1. PRAGMA foreign_keys read-back.
// src/lib/db/client.ts:37-41 runs `PRAGMA foreign_keys = ON` then re-reads it and THROWS
// unless it comes back 1. On the HTTP client every execute() opens and closes its own
// stream (node_modules/@libsql/client/lib-esm/http.js:74-80), so the SET does not carry
// over — this is really testing the server's DEFAULT. If it is 0, the app is dead on
// arrival: ensure() throws and every route 500s.
await c.execute("PRAGMA foreign_keys = ON").catch((e) => console.log(`  (PRAGMA set errored: ${e.message})`));
const fk = await c.execute("PRAGMA foreign_keys");
const fkVal = Number(fk.rows[0]?.foreign_keys);
check("PRAGMA foreign_keys reads back as 1", fkVal === 1, `got ${JSON.stringify(fk.rows[0])}`);

// 2. Are foreign keys ACTUALLY enforced for an ordinary statement?
await c.executeMultiple(
  "CREATE TABLE IF NOT EXISTS __probe_parent(id INTEGER PRIMARY KEY);" +
    "CREATE TABLE IF NOT EXISTS __probe_child(id INTEGER PRIMARY KEY, p INTEGER REFERENCES __probe_parent(id));"
);
let enforced = false;
try {
  await c.execute("INSERT INTO __probe_child(id,p) VALUES (1, 999999)");
  await c.execute("DELETE FROM __probe_child");
} catch {
  enforced = true;
}
check("foreign keys enforced on a normal INSERT", enforced, enforced ? "" : "orphan row accepted");

// 3. executeMultiple — the schema self-heal replays all of schema.sql through this.
let emOk = true;
try {
  await c.executeMultiple("CREATE TABLE IF NOT EXISTS __probe_em(a);DROP TABLE __probe_em;");
} catch (e) {
  emOk = false;
  console.log(`  ${e.message}`);
}
check("executeMultiple (multi-statement DDL)", emOk);

// 4. Partial unique index — migrate.mjs:64 relies on this.
let idxOk = true;
try {
  await c.execute("CREATE UNIQUE INDEX IF NOT EXISTS __probe_idx ON __probe_parent(id) WHERE id=1");
  await c.execute("DROP INDEX IF EXISTS __probe_idx");
} catch (e) {
  idxOk = false;
  console.log(`  ${e.message}`);
}
check("partial unique index (WHERE clause)", idxOk);

// 5. Interactive write transaction — src/lib/engine.ts uses 9 of these, each holding a
// stream open across many statements. This is what a habit tick actually does.
let txOk = true;
let txMs = 0;
try {
  const s = Date.now();
  const tx = await c.transaction("write");
  await tx.execute("INSERT INTO __probe_parent(id) VALUES (42)");
  const r = await tx.execute("SELECT COUNT(*) n FROM __probe_parent WHERE id=42");
  if (Number(r.rows[0].n) !== 1) txOk = false; // read-your-own-writes inside the tx
  await tx.rollback();
  txMs = Date.now() - s;
  const after = await c.execute("SELECT COUNT(*) n FROM __probe_parent WHERE id=42");
  if (Number(after.rows[0].n) !== 0) txOk = false; // rollback actually rolled back
} catch (e) {
  txOk = false;
  console.log(`  ${e.message}`);
}
check("interactive write transaction + rollback", txOk, `${txMs}ms for a 3-statement tx`);

// 6. batch("write") — used by the seed in client.ts:54 and by coach.ts:72.
let batchOk = true;
try {
  await c.batch(["INSERT INTO __probe_parent(id) VALUES (7)", "DELETE FROM __probe_parent WHERE id=7"], "write");
} catch (e) {
  batchOk = false;
  console.log(`  ${e.message}`);
}
check('batch(..., "write")', batchOk);

// 7. strftime default — every created_at column uses it server-side.
const now = await c.execute("SELECT strftime('%Y-%m-%dT%H:%M:%SZ','now') AS t");
const t = String(now.rows[0].t);
const skew = Math.abs(Date.parse(t) - Date.now()) / 1000;
check("server clock within 60s of this machine", skew < 60, `db says ${t}, skew ${Math.round(skew)}s`);

// 8. lastInsertRowid — import-gym.mjs:133 and several engine paths depend on it.
const ins = await c.execute("INSERT INTO __probe_parent(id) VALUES (99)");
check("lastInsertRowid returned", ins.lastInsertRowid != null, String(ins.lastInsertRowid));

await c.executeMultiple("DROP TABLE IF EXISTS __probe_child;DROP TABLE IF EXISTS __probe_parent;");

console.log(`\n${failures ? `${failures} CHECK(S) FAILED` : "all checks passed"}`);
c.close();
process.exit(failures ? 1 : 0);
