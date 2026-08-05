// Production preflight. Runs BEFORE `next start` (see package.json "start").
//
// WHY A SEPARATE PROCESS, not a check inside the app:
//   `next build` sets NODE_ENV=production and imports every route module while
//   collecting page data, so an unconditional module-scope throw inside src/ breaks
//   local production builds. A script that only runs at START time is unreachable from
//   the build, so the check here can be unconditional, fatal, and loud.
//
// WHAT IT BUYS: `fly deploy` waits for the new machine to come up healthy. A non-zero
// exit here fails the release and rolls back, instead of putting a server on the
// internet that quietly writes the board and the Google refresh token to a filesystem
// that is destroyed on the next restart.

import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL || "";
const syncUrl = process.env.TURSO_SYNC_URL || ""; // set only if embedded replicas are ever adopted
const token = process.env.TURSO_AUTH_TOKEN || "";

// Fly always injects these. Used as an independent signal so the escape hatch below
// cannot be switched on in the one place where the filesystem really is ephemeral.
const onFly = Boolean(process.env.FLY_APP_NAME || process.env.FLY_MACHINE_ID);
const isProd = process.env.NODE_ENV === "production" || onFly;

// LOCAL production smoke test only: `ALLOW_EPHEMERAL_FILE_DB=1 npm start`.
// Deliberately ignored when running on Fly.
const allowFileDb = process.env.ALLOW_EPHEMERAL_FILE_DB === "1" && !onFly;

const fail = (msg) => {
  console.error(`\n[preflight] FATAL\n${msg}\n`);
  process.exit(1);
};
const warn = (msg) => console.warn(`[preflight] WARNING: ${msg}`);

if (!isProd) process.exit(0); // `npm run dev` never gets here; this is belt and braces.

// --- DATABASE_URL --------------------------------------------------------------
if (!url) {
  fail(
    "DATABASE_URL is not set.\n" +
      "  The app would fall back to file:./data/dashboard.db — an ephemeral container path.\n" +
      "  fly secrets set DATABASE_URL='libsql://<db>-<org>.turso.io' TURSO_AUTH_TOKEN='...'"
  );
}

const isEmbeddedReplica = url.startsWith("file:") && syncUrl !== "";

if (url === ":memory:" || url.includes(":memory:")) {
  fail(`DATABASE_URL is "${url}" — an in-memory database. Everything is lost when the process exits.`);
}

if (url.startsWith("file:") && !isEmbeddedReplica) {
  if (!allowFileDb) {
    fail(
      `DATABASE_URL is "${url}" — a file-backed database, in production.\n` +
        "  The container filesystem is recreated on every deploy and every machine restart,\n" +
        "  so this silently discards the entire board AND the Google refresh_token in\n" +
        "  google_oauth_tokens (which cannot be recovered without re-consenting in a browser).\n" +
        "  Fix:  fly secrets set DATABASE_URL='libsql://<db>-<org>.turso.io' TURSO_AUTH_TOKEN='...'\n" +
        "  Local prod smoke test only:  ALLOW_EPHEMERAL_FILE_DB=1 npm start"
    );
  }
  warn(`file: database allowed by ALLOW_EPHEMERAL_FILE_DB. Data here is DISPOSABLE.`);
}

if (!url.startsWith("file:")) {
  if (!/^(libsql|https|wss):/.test(url)) {
    fail(
      `DATABASE_URL scheme is not allowed in production: "${url}".\n` +
        "  Use libsql:// (or https:// / wss://). Plain http:// and ws:// would send the\n" +
        "  auth token over the network in clear text."
    );
  }
  if (!token) {
    fail(
      "TURSO_AUTH_TOKEN is not set, but DATABASE_URL points at a remote database.\n" +
        "  Every query would fail with 401 at runtime instead of here."
    );
  }
}
if (isEmbeddedReplica && !token) fail("TURSO_SYNC_URL is set but TURSO_AUTH_TOKEN is not.");

// --- live connectivity ----------------------------------------------------------
// A wrong URL or an expired token should fail the DEPLOY, not the first request.
// Retried because DNS/networking on a freshly booted machine can lag the process.
const client = createClient({
  url,
  authToken: token || undefined,
  ...(isEmbeddedReplica ? { syncUrl } : {}),
});

let lastErr;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const t0 = Date.now();
    await client.execute("SELECT 1");
    console.log(`[preflight] database reachable in ${Date.now() - t0}ms`);
    lastErr = undefined;
    break;
  } catch (e) {
    lastErr = e;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
  }
}
if (lastErr) {
  fail(`could not reach the database after 3 attempts.\n  ${lastErr instanceof Error ? lastErr.message : lastErr}`);
}

// --- "am I pointed at the RIGHT database?" ---------------------------------------
// Not fatal: a genuine first deploy legitimately starts empty and is seeded by the
// app's self-heal. But pointing production at a fresh, empty database by mistake looks
// identical to data loss from the outside, so say so out loud.
try {
  const r = await client.execute(
    "SELECT (SELECT COUNT(*) FROM goals) AS goals, (SELECT COUNT(*) FROM tasks) AS tasks, (SELECT COUNT(*) FROM coach_messages) AS msgs"
  );
  const { goals, tasks, msgs } = r.rows[0];
  console.log(`[preflight] content: ${goals} goals, ${tasks} tasks, ${msgs} coach messages`);
  if (Number(goals) === 0 && Number(tasks) === 0) {
    warn("this database has no goals and no tasks. If this is not a first deploy, DATABASE_URL is pointing somewhere unexpected.");
  }
} catch {
  console.log("[preflight] schema not present yet — the app will self-heal it on first use.");
}

// --- foreign keys ----------------------------------------------------------------
// src/lib/db/client.ts asserts `PRAGMA foreign_keys` == 1 and throws otherwise. On a
// remote database that assertion depends on server behaviour, so surface the answer
// here rather than as a 500 on the first request.
try {
  await client.execute("PRAGMA foreign_keys = ON");
  const fk = await client.execute("PRAGMA foreign_keys");
  const on = Number(fk.rows[0]?.foreign_keys) === 1;
  console.log(`[preflight] foreign_keys = ${on ? "ON" : "OFF"}`);
  if (!on) {
    fail(
      "the database reports foreign_keys = OFF.\n" +
        "  src/lib/db/client.ts throws on this, so every request would 500."
    );
  }
} catch (e) {
  fail(`PRAGMA foreign_keys failed: ${e instanceof Error ? e.message : e}`);
}

console.log("[preflight] ok");
client.close();
