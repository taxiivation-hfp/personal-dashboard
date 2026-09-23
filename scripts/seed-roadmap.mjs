// Seed the CAREER roadmap into goals, and the HEALTH roadmap onto the timeline.
//
//   node scripts/seed-roadmap.mjs                 -> print the plan, write NOTHING
//   node scripts/seed-roadmap.mjs --commit        -> write it
//
// The two source documents are roadmap.md (career) and healthroadmap.md (health), and the
// owner's ruling of 2026-09-20 is what splits them:
//
//   CAREER  -> goals. Ten of them, nine with deadlines, so nine take an arc of the Career
//              ring and "Systems depth" — which is explicitly ongoing, indefinitely — lists
//              without one. A deadline on forever would be a lie.
//   HEALTH  -> the timeline, and ONLY the timeline. Health's ring is five fixed parts and
//              has no goals in it (spec §5); health here is a sequence of tiers GATED BY
//              EACH OTHER rather than by a calendar, which is exactly what a free-floating
//              text window is for and exactly what a dated goal is not.
//
// IDEMPOTENT BY INSPECTION, not by a latch: every write checks for what it is about to
// create and skips it. Run it twice and the second run writes nothing. That matters more
// than usual because the target is PRODUCTION Turso — there is no undo, and the rows this
// touches sit beside a year of the owner's real data.
//
// IT NEVER OVERWRITES. A goal whose title already exists is left exactly as it is, words,
// deadline, subtasks and all; so is a month note the owner has already written. The script
// can add what is missing; it can never take back what is there.
import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// .env.seed FIRST and .env.local second, deliberately in that order: the live credentials
// belong in a file `next dev` does not read, so seeding production can never be a side
// effect of starting a dev server. (On 2026-09-03 .env.local was found pointing at Turso
// and `npm run dev` was writing to production — this is that mistake, prevented.)
function loadEnv(name) {
  const p = resolve(root, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv(".env.seed");
loadEnv(".env.local");

const COMMIT = process.argv.includes("--commit");

/**
 * --sql emits the whole seed as idempotent SQL on stdout instead of connecting to anything.
 *
 * It exists because Vercel's SENSITIVE environment variables are write-only: the live
 * Turso token cannot be revealed in the dashboard or pulled with `vercel env pull`, so
 * there are days when no credential is obtainable at all. The Turso dashboard's own SQL
 * shell needs none — you are already logged in — so the plan can be pasted there instead.
 *
 * SAME MANIFEST, second emitter. The goals, notes, tiers and positions above are not
 * duplicated for this mode; a second copy of the plan would eventually disagree with the
 * first about a subtask.
 *
 * Every statement carries its own guard, so the paste is as re-runnable as the script is.
 */
const SQL_ONLY = process.argv.includes("--sql");
const url = process.env.DATABASE_URL || "file:./data/dashboard.db";
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

// ------------------------------------------------------------------ THE CAREER GOALS
//
// `count` makes a COUNTED goal (goals.ts): a goal of N interchangeable items, whose
// progress is the true fraction rather than blocks of ten. `done` is where the owner
// actually is today — a roadmap written partway through must not start at zero, or the
// pace arc reads as behind on the day it is created.
//
// `subtasks` and `count` are EXCLUSIVE, so no goal below carries both.

const GOALS = [
  {
    title: "SQL",
    deadline: "2026-09-30",
    target:
      "LeetCode SQL 50, then 15 min/day maintenance — no second site. One pattern cold: ROW_NUMBER() OVER (PARTITION BY x ORDER BY y).",
    count: { done: 18, target: 50 },
  },
  {
    title: "Algorithms",
    deadline: "2027-01-31",
    target:
      "NeetCode, in their order, in Python. 25 minutes then read the solution; redo from scratch three days later. Week one: Counter, defaultdict, deque, heapq, bisect, lru_cache. Feb onward, 2/week.",
    count: { done: 1, target: 150 },
  },
];

// ------------------------------------------------------- THE REST OF THE CAREER ROADMAP
//
// STICKY NOTES, NOT GOALS — the owner's ruling, 2026-09-23, replacing the eight goals the
// first seeding made of these sections.
//
// What separates the two is whether the thing has a FINISH LINE the ring can measure a pace
// against. SQL is 50 problems by 30 September and Algorithms is 150 by 31 January: both are
// a count, a date, and an answer to "am I on track". The other eight are standing practices
// and open-ended programmes — "DDIA, a chapter a week, forever", "meetups, weekly, ongoing",
// "many small builds, you pick what". Giving those a deadline invented a finish line the
// roadmap never claimed, and every one of them then took an equal arc of the Career ring and
// diluted the two that could actually be behind.
//
// They still belong on the year. A sticky note is exactly the right shape for them: words
// you put somewhere and look at, feeding nothing. PLUM, because these are Career's, the way
// the health tiers are Moss.
//
// Their goals are DROPPED, never deleted (RETIRED_GOALS below) — status 'dropped' hides a
// goal from every list while its row and its subtasks stay on the record, which is this
// app's rule for everything: preserve data, migrate, never drop.

const CAREER_TINT = "plum";

const CAREER_NOTES = [
  "Systems depth · ongoing, indefinitely\nA Philosophy of Software Design first. Then DDIA, a chapter a week from December, forever. System Design Primer, a section a week. Hussein Nasser for internals.",
  "Data modelling · one weekend before January\nKimball's Data Warehouse Toolkit, chapters 1–3 only. Facts and dimensions, slowly changing dimensions, why a schema that reads well writes badly.",
  "Builds · December → January\nMany small builds, each forcing a new decision. One ADR each. Left to cover: state, concurrency, async, retry, caching, observability, real-time, blobs, and a KV store.",
  "One operated system · January → ongoing\nOne thing that runs, that people use, that can break at 3am. Real users, stateful, observable, OPERATED. One decision you can defend for ten minutes.",
  "AWS SAA-C03 · sit December · ~$150\nNot DEA-C01. Start from the exam guide's domain weightings. Skill Builder, Maarek or Cantrill, and build on the Free Tier — not video alone.",
  "Verification · December → ongoing\nCatching the model being confidently wrong. pytest for the invariants, not coverage theatre. Hypothesis for the cases you didn't think of. Specs first.",
  "Meetups · weekly, ongoing\nThe sponsorship pipeline. Same group FOUR times — recognition is the point. Stay for the 40 minutes after the talk. Follow up within 48 hours. Speak eventually.",
  "Technical interviews · February → June 2027\nLive coding OUT LOUD is the hard part, not the algorithm. System design: clarify, sketch, name the bottleneck, state the trade-off.",
];

/**
 * The goals the first seeding made of the sections above, to be retired.
 *
 * LISTED BY NAME rather than derived from "everything not in GOALS", so this can only ever
 * touch the eight rows it is pointed at. A rule that dropped whatever the manifest no longer
 * mentions would quietly drop a goal the owner wrote by hand the day after.
 *
 * Dropping is idempotent: the second run updates rows that are already 'dropped'.
 */
const RETIRED_GOALS = [
  "Systems depth",
  "Data modelling",
  "Builds",
  "One operated system",
  "AWS Solutions Architect – Associate",
  "Verification",
  "Meetups and industry events",
  "Technical interviews",
];

// ------------------------------------------------------------------ THE MONTH NOTES
//
// roadmap.md §11, the deadline table. These are dates the owner does not control and that
// have no subtasks, so they are not goals — a missed 485 lodgement is a visa problem, not a
// thin arc. A month's circle is where a year is read, so that is where they go.
//
// timeline_notes is PRIMARY KEY (month): one note per circle, so a month holding two things
// says both on one line.

const NOTES = {
  "2026-10": "Research scholarship outcome",
  "2027-01": "Sit IELTS/PTE — 8.0 every band. Must be within 12 months of the 485 lodgement",
  "2027-02": "Grad program applications open — through to May",
  "2027-06": "NAATI CCL Indonesian",
  "2027-07": "Deloitte graduate window, 1–22 Jul (2026 dates — verify) · request the completion letter the day it exists",
  "2027-08": "LODGE 485 — student visa expires 30/08/2027 · book the health exam immediately",
  "2028-02": "Professional Year decision point — only if no skilled job",
  "2028-07": "ACS skills assessment — nominate three ANZSCO codes, one fee",
};

// ------------------------------------------------------------------ THE HEALTH TIERS
//
// healthroadmap.md, as nine text windows BELOW the line, left to right in tier order, all
// on one tint so they read as one plan rather than nine unrelated stickies. Moss, because
// it is Health's own hue mixed to paper.
//
// SHORT, by the owner's ruling: tier name, cost band, and the one decision it turns on. The
// detail stays in healthroadmap.md — a card at the 500-character cap is ~300px tall, and
// nine of those is a wall at any zoom you can read the year at.
//
// They carry NO DATES, which is the point: the document is explicitly ordered by return on
// cost and gated tier-by-tier, not scheduled. A month-anchored card would invent a calendar
// the owner deliberately refused to give.

const TINT = "moss";

const HEALTH = [
  "Tier 1 · Do now, no gatekeeping · ~$1.6–3.6k\nAM: azelaic 15–20% → SPF 50. PM: tretinoin 0.025%, 3 nights, building. Dental: clean, restore, then whiten. A cut that exposes the forehead. Neck work + shrugs. Sleep hygiene. Add nothing else for 3 months; judge at 6.",
  "Tier 2 · Diagnostics · ~$1.6–3.9k\nLarge-FOV CBCT + lateral and PA ceph, TMJ MRI, sleep study, ENT with nasal endoscopy, surgical-capable ortho consult, bloods (iron, thyroid, vit D), photos and the five measurements. Nothing below can be planned without these.",
  "Tier 3 · Cheap functional wins · ~$600–1.5k\nENT-directed nasal treatment if the scope finds something. Respiratory physio for breathing pattern. Treat whatever the bloods and sleep study turn up. Some of the under-eye darkness and puffiness may resolve here.",
  "Tier 4 · Reversible tests · ~$1.6–4.5k · optional\nMasseter botox trial tells you in 6 weeks whether muscle drives the cheek width. HA filler to malar and chin tests projection before implant money. Skip both if you're already committed to the bimax.",
  "Tier 5 · MARPE · ~$2.5–6k\nOnly if the CBCT confirms transverse deficiency. The one surgical item defensible standalone — the airway benefit holds even if you stop here. Diastema opens temporarily. Do it for airway and smile width, not FWHR.",
  "Tier 6 · Bimax · ~$50–85k Seoul / $30–55k Jakarta or Bangkok · ~30 months\nLe Fort I + BSSO + genioplasty + septoplasty, custom hardware, one operation. Decompensation ortho → surgery → finishing ortho. 3–4 weeks in country. The only all-or-nothing decision here.",
  "Tier 7 · Reassess · ~$350–650\nFresh photos and CT 9–12 months post-op, once the soft tissue has settled. Then decide on Tier 8. A lot of people don't want it by this point.",
  "Tier 8 · Second stage · ~$20–45k\nCustom malar / infraorbital implants, crown lengthening, rhinoplasty, buccal fat only if still indicated, plate removal. Doing any of these before the bimax means paying for them twice.",
  "Rules that hold across the whole plan\nTier 2 before any surgical decision. Nothing from Tier 8 before Tier 6 — the only real sequencing trap. Never: Le Fort II/III, buccal fat now, masseter reduction, topical estriol. One variable at a time.",
];

// ------------------------------------------------------------------ WHERE THINGS LAND
//
// World pixels from the fixed origin at Jul 2025 (timeline.ts). These must match the
// library's geometry exactly or a card lands under the wrong month, so they are derived
// from the same constants rather than typed out.

const TIMELINE_START = "2025-07";
const MONTH_W = 170;
const PAD = 100;
const CARD_W = 224;
const GAP = 40;
const LINE_Y = 500;

const monthIndex = (m) => {
  const [y0, m0] = TIMELINE_START.split("-").map(Number);
  const [y, mm] = m.split("-").map(Number);
  return (y - y0) * 12 + (mm - m0);
};
const monthX = (m) => PAD + Math.max(0, monthIndex(m)) * MONTH_W;

/**
 * Career cards go ABOVE the line, in a COLUMN PER MONTH centred on that month's circle.
 *
 * Three goals share 31 Jan and three share 30 Jun, and a card is wider than two months are
 * apart (224 vs 170) — so cards sharing a month stack vertically, and only when two whole
 * COLUMNS would overlap is the later one nudged right until it clears. Nudging cards one at
 * a time instead put the December exam under February, which is the card quietly lying
 * about its own date; a column moves as one thing, or not at all.
 *
 * An UNDATED goal has no month of its own, so it joins the column for the month being
 * lived — which is where the work on it is happening.
 *
 * A card's x means "about here in the year", not a plotted date. This is a vision board,
 * and the owner can drag any of it anywhere.
 */
const ROWS = [60, 200, 340];

function placeCareer(items) {
  // Column key: the deadline's month, or the current month for an undated goal.
  const cols = new Map();
  for (const it of items) {
    const month = it.deadline ? it.deadline.slice(0, 7) : THIS_MONTH;
    if (!cols.has(month)) cols.set(month, []);
    cols.get(month).push(it);
  }

  const out = [];
  let prevRight = -Infinity;
  for (const month of [...cols.keys()].sort()) {
    const group = cols.get(month);
    // A column is three deep; a fourth card starts the next column along.
    const width = Math.ceil(group.length / ROWS.length);
    let x = monthX(month) - CARD_W / 2;
    if (x < prevRight) x = prevRight;
    for (let i = 0; i < group.length; i++) {
      const col = Math.floor(i / ROWS.length);
      out.push({
        ...group[i],
        x: Math.round(x + col * (CARD_W + GAP)),
        y: ROWS[i % ROWS.length],
      });
    }
    prevRight = x + width * (CARD_W + GAP);
  }
  return out;
}

// LOCAL, not UTC: at a month boundary an ISO string is the wrong month for the hours
// Australia is ahead of it, and this decides which circle an undated card sits near.
const THIS_MONTH = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
})();

/**
 * Health cards: one row BELOW the line, in tier order, starting at the month being lived.
 *
 * NOT at the world's left edge, which is where they landed first: that is July 2025, and a
 * plan you are starting now drawn under a year that has already happened reads as a thing
 * you have already done. Starting at today and running right puts the ladder under the
 * same span the career cards occupy above it — career above the line, health below, the PR
 * dates on the circles between them.
 *
 * The x still carries no date claim. The document is gated tier-by-tier, not scheduled, so
 * the order is the only thing the row means.
 */
const healthPlaced = HEALTH.map((text, i) => ({
  text,
  x: Math.round(monthX(THIS_MONTH) - CARD_W / 2 + i * (CARD_W + GAP)),
  y: LINE_Y + 90,
  color: TINT,
}));

/**
 * The career notes: the same ladder, ABOVE the line, in roadmap order.
 *
 * Career above and health below is the shape the canvas already had when the career items
 * were goal cards, and it is worth keeping: one glance separates the two plans without
 * reading a word of either. They start at the month being lived for the same reason the
 * health tiers do — a plan drawn under months that have already passed reads as a thing you
 * have already done.
 *
 * THE BAND IS TIGHT, AND BOTH ITS EDGES ARE MEASURED rather than guessed. On the timeline's
 * own landing view the world sits 212px above the viewport, so world y maps to screen
 * y - 212; the masthead's bottom edge is at screen 74, and the line is at world 500. A card
 * must therefore start below world 286 to clear the masthead and end above 500 to clear the
 * line. That is why these notes are capped at 200 characters: a text window is almost
 * exactly as many pixels tall as it has characters at CARD_W, so 200 characters is a ~200px
 * card in a ~204px band. Lengthen one and it sits under the masthead on the first screen
 * the owner sees.
 *
 * It also clears the two remaining goal cards above it (ROWS[0] = 60, a goal card about
 * 140 tall).
 */
const CAREER_NOTE_Y = 296;

const careerPlaced = CAREER_NOTES.map((text, i) => ({
  text,
  x: Math.round(monthX(THIS_MONTH) - CARD_W / 2 + i * (CARD_W + GAP)),
  y: CAREER_NOTE_Y,
  color: CAREER_TINT,
}));

/** Every text window this seed owns, in the order it prints them. */
const textPlaced = [...careerPlaced, ...healthPlaced];

// ------------------------------------------------------------------ THE RUN

/** The engine's own stamp shape, so a row this script touches looks like every other. */
const stamp = () => new Date().toISOString().replace(/[.]\d+Z$/, "Z");

const log = [];
const say = (s) => (log.push(s), console.log(s));

/** SQLite string literal: single quotes doubled, and nothing else escaped. */
const q = (v) =>
  v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;

/**
 * The seed as SQL, every statement guarded so a second paste writes nothing.
 *
 * A goal's id is never assumed: subtasks and timeline cards look it up by title through a
 * subselect, because the ids this script would hand out do not exist until the INSERT above
 * has run in whatever session the paste lands in.
 */
function emitSql() {
  const out = [];
  const goalRef = (title) =>
    `(SELECT id FROM goals WHERE title=${q(title)} AND status!='dropped' ORDER BY id LIMIT 1)`;

  out.push("-- The career roadmap as goals, and the health roadmap onto the timeline.");
  out.push("-- Generated by scripts/seed-roadmap.mjs --sql. Idempotent: re-running writes nothing.");
  out.push("--");
  out.push("-- RUN THIS LINE FIRST, ON ITS OWN. SQLite has no ADD COLUMN IF NOT EXISTS, so if the");
  out.push("-- app has already booted with the counted-goal code the column is there and this");
  out.push("-- errors with 'duplicate column name: done_count'. That error is the good outcome:");
  out.push("-- ignore it and run everything below. Any OTHER error, stop.");
  out.push("--");
  out.push("--   ALTER TABLE goals ADD COLUMN done_count INTEGER NOT NULL DEFAULT 0 CHECK (done_count >= 0);");
  out.push("--");
  out.push("BEGIN;");
  out.push("");

  for (const g of GOALS) {
    out.push(`-- ${g.title}`);
    out.push(
      `INSERT INTO goals (pillar_id,title,target,deadline,target_count,done_count)
` +
        `SELECT p.id, ${q(g.title)}, ${q(g.target ?? null)}, ${q(g.deadline ?? null)}, ` +
        `${g.count?.target ?? "NULL"}, ${g.count?.done ?? 0}
` +
        `  FROM pillars p WHERE p.key='portfolio'
` +
        `   AND NOT EXISTS (SELECT 1 FROM goals WHERE title=${q(g.title)} AND status!='dropped');`,
    );
    let order = 0;
    for (const sub of g.subtasks ?? []) {
      const t = typeof sub === "string" ? sub : sub.title;
      const done = typeof sub === "string" ? 0 : sub.done ? 1 : 0;
      order++;
      out.push(
        `INSERT INTO subgoals (goal_id,title,weight,done,sort_order)
` +
          `SELECT ${goalRef(g.title)}, ${q(t)}, 0, ${done}, ${order}
` +
          ` WHERE ${goalRef(g.title)} IS NOT NULL
` +
          `   AND NOT EXISTS (SELECT 1 FROM subgoals WHERE goal_id=${goalRef(g.title)} AND title=${q(t)});`,
      );
    }
    out.push("");
  }

  out.push("-- The deadline table, as month notes. OR IGNORE, so a note already written stays.");
  for (const [month, text] of Object.entries(NOTES)) {
    out.push(`INSERT OR IGNORE INTO timeline_notes (month,text) VALUES (${q(month)}, ${q(text)});`);
  }
  out.push("");

  out.push("-- Career goals placed on the timeline, above the line.");
  for (const c of placeCareer(GOALS)) {
    out.push(
      `INSERT INTO timeline_windows (kind,goal_id,x,y)
` +
        `SELECT 'goal', ${goalRef(c.title)}, ${c.x}, ${c.y}
` +
        ` WHERE ${goalRef(c.title)} IS NOT NULL
` +
        `   AND NOT EXISTS (SELECT 1 FROM timeline_windows WHERE goal_id=${goalRef(c.title)});`,
    );
  }
  out.push("");

  out.push("-- The career roadmap's standing practices above the line, the health tiers");
  out.push("-- below it. Each guarded on its own text, so a re-paste adds nothing.");
  for (const h of textPlaced) {
    out.push(
      `INSERT INTO timeline_windows (kind,text,color,x,y)
` +
        `SELECT 'text', ${q(h.text)}, ${q(h.color)}, ${h.x}, ${h.y}
` +
        ` WHERE NOT EXISTS (SELECT 1 FROM timeline_windows WHERE kind='text' AND text=${q(h.text)});`,
    );
  }

  out.push("");
  out.push("-- The eight sections that are sticky notes now. DROPPED, never deleted: the row");
  out.push("-- and its subtasks stay on the record, and every list already hides 'dropped'.");
  for (const t of RETIRED_GOALS) {
    out.push(
      `DELETE FROM timeline_windows WHERE goal_id IN (SELECT id FROM goals WHERE title=${q(t)});`,
    );
    out.push(
      `UPDATE goals SET status='dropped' WHERE title=${q(t)} AND status!='dropped';`,
    );
  }

  out.push("");
  out.push("COMMIT;");
  return out.join("\n");
}

async function main() {
  if (SQL_ONLY) {
    // Nothing is connected to, so no credential is needed and nothing can be written by
    // accident. The caller redirects this to a file and pastes it wherever they like.
    console.log(emitSql());
    return;
  }
  const where = url.startsWith("file:") ? "LOCAL FILE" : "TURSO (production)";
  say(`target: ${where} — ${url.replace(/\?.*$/, "")}`);
  say(COMMIT ? "MODE: --commit, writing" : "MODE: dry run, nothing will be written");
  say("");

  // The counted-goal column, added here as well as in the app's own ensure(). The seed
  // writes done_count directly, so it cannot assume the app has booted since this feature
  // landed — and a NOT NULL column with a constant default cannot lose a row, so adding it
  // is safe whichever happens first.
  const cols = await client.execute("PRAGMA table_info(goals)");
  if (!cols.rows.some((r) => String(r.name) === "done_count")) {
    say("schema ADD   goals.done_count");
    if (COMMIT)
      await client.execute(
        "ALTER TABLE goals ADD COLUMN done_count INTEGER NOT NULL DEFAULT 0 CHECK (done_count >= 0)",
      );
  }

  const pillar = await client.execute({
    sql: "SELECT id FROM pillars WHERE key='portfolio'",
    args: [],
  });
  if (!pillar.rows.length) throw new Error("no 'portfolio' pillar — is this the right database?");
  const pillarId = Number(pillar.rows[0].id);

  // What is already there. Titles are matched exactly and case-insensitively; a goal the
  // owner has since renamed will seed a second one, which is a duplicate they can drop —
  // strictly better than this script rewriting a title they chose.
  const existing = await client.execute("SELECT id,title FROM goals WHERE status != 'dropped'");
  const byTitle = new Map(existing.rows.map((r) => [String(r.title).toLowerCase(), Number(r.id)]));

  const goalIds = new Map();
  let made = 0;

  for (const g of GOALS) {
    const key = g.title.toLowerCase();
    if (byTitle.has(key)) {
      say(`goal  SKIP  ${g.title} — already on the board`);
      goalIds.set(g.title, byTitle.get(key));
      continue;
    }
    const counted = g.count ? `${g.count.done} of ${g.count.target}` : `${g.subtasks.length} subtasks`;
    say(`goal  ADD   ${g.title} — ${g.deadline ?? "no deadline"} · ${counted}`);
    if (!COMMIT) continue;

    const r = await client.execute({
      sql: `INSERT INTO goals (pillar_id,title,target,deadline,target_count,done_count)
            VALUES (?,?,?,?,?,?)`,
      args: [
        pillarId,
        g.title,
        g.target ?? null,
        g.deadline ?? null,
        g.count?.target ?? null,
        g.count?.done ?? 0,
      ],
    });
    const id = Number(r.lastInsertRowid);
    goalIds.set(g.title, id);
    made++;

    let order = 0;
    for (const s of g.subtasks ?? []) {
      const t = typeof s === "string" ? s : s.title;
      const done = typeof s === "string" ? 0 : s.done ? 1 : 0;
      await client.execute({
        sql: "INSERT INTO subgoals (goal_id,title,weight,done,sort_order) VALUES (?,?,0,?,?)",
        args: [id, t, done, ++order],
      });
    }
  }

  say("");

  // Month notes. Never overwritten: a note the owner has written is theirs.
  const notes = await client.execute("SELECT month FROM timeline_notes");
  const haveNote = new Set(notes.rows.map((r) => String(r.month)));
  for (const [month, text] of Object.entries(NOTES)) {
    if (haveNote.has(month)) {
      say(`note  SKIP  ${month} — already written`);
      continue;
    }
    say(`note  ADD   ${month}  ${text.slice(0, 64)}${text.length > 64 ? "…" : ""}`);
    if (!COMMIT) continue;
    await client.execute({
      sql: "INSERT INTO timeline_notes (month,text) VALUES (?,?)",
      args: [month, text],
    });
  }

  say("");

  // Timeline windows. A goal already placed is left where the owner put it — the partial
  // unique index on goal_id would refuse a second copy anyway, but skipping says why.
  const wins = await client.execute("SELECT kind,goal_id,text FROM timeline_windows");
  const placedGoals = new Set(wins.rows.filter((r) => r.goal_id != null).map((r) => Number(r.goal_id)));
  const placedText = new Set(wins.rows.filter((r) => r.kind === "text").map((r) => String(r.text)));

  for (const c of placeCareer(GOALS)) {
    const id = goalIds.get(c.title);
    if (id == null) {
      // Dry run: the goal does not exist yet, so there is no id to place — but the
      // placement is still worth printing, since where a card lands is the half of this
      // plan you cannot check any other way.
      say(`card  ADD   ${c.title} @ ${c.x},${c.y} (once the goal exists)`);
      continue;
    }
    if (placedGoals.has(id)) {
      say(`card  SKIP  ${c.title} — already on the timeline`);
      continue;
    }
    say(`card  ADD   ${c.title} @ ${c.x},${c.y}`);
    if (!COMMIT) continue;
    await client.execute({
      sql: "INSERT INTO timeline_windows (kind,goal_id,x,y) VALUES ('goal',?,?,?)",
      args: [id, c.x, c.y],
    });
  }

  for (const h of textPlaced) {
    if (placedText.has(h.text)) {
      say(`note  SKIP  ${h.text.split("\n")[0]}`);
      continue;
    }
    say(`note  ADD   ${h.text.split("\n")[0]} @ ${h.x},${h.y}`);
    if (!COMMIT) continue;
    await client.execute({
      sql: "INSERT INTO timeline_windows (kind,text,color,x,y) VALUES ('text',?,?,?,?)",
      args: [h.text, h.color, h.x, h.y],
    });
  }

  say("");

  // The eight sections that became sticky notes. Their goal rows are DROPPED rather than
  // deleted - listGoals already filters 'dropped', so they leave every screen while the row
  // and its subtasks stay on the record. Their timeline cards go outright: a goal window
  // pointing at a dropped goal renders as nothing, which is a dead row, not a card.
  for (const t of RETIRED_GOALS) {
    const g = await client.execute({
      sql: "SELECT id, status FROM goals WHERE title=?",
      args: [t],
    });
    const live = g.rows.filter((r) => String(r.status) !== "dropped");
    if (!live.length) {
      say(`drop  SKIP  ${t}`);
      continue;
    }
    say(`drop  DROP  ${t} - now a sticky note`);
    if (!COMMIT) continue;
    for (const r of live) {
      await client.execute({
        sql: "DELETE FROM timeline_windows WHERE goal_id=?",
        args: [Number(r.id)],
      });
      await client.execute({
        sql: "UPDATE goals SET status='dropped', updated_at=? WHERE id=?",
        args: [stamp(), Number(r.id)],
      });
    }
  }

  say("");
  say(
    COMMIT
      ? `done — ${made} goals created.`
      : "dry run complete. Re-run with --commit to write.",
  );
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
