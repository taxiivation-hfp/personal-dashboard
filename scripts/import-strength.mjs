// One-off importer for the Discord strength backlog.
//
//   node scripts/import-strength.mjs                      # DRY RUN — writes nothing
//   node scripts/import-strength.mjs --commit             # actually write
//   node scripts/import-strength.mjs <file.txt> [--all]   # other export / include misc
//
// DRY RUN IS THE DEFAULT AND --commit IS THE ONLY WAY PAST IT. This writes to production
// Turso, and a backlog importer that defaults to writing is one fat-fingered shell history
// entry away from duplicating four years of someone's training log.
//
// ---------------------------------------------------------------------------------------
// THERE IS NO NATURAL-LANGUAGE GYM PARSER IN THIS CODEBASE, AND THIS DOES NOT ADD ONE.
//
// That is a deliberate product decision rather than a gap: CLAUDE.md says the workout
// document is "deliberately unstructured — a workout log is numbers scribbled between sets,
// and any form imposed here is a form to fight on a bad day". `gym_sessions` has no set,
// rep or exercise column to parse into; it has `title` and free-text `note`. The importer
// this replaces (scripts/import-gym.mjs, deleted in dc2ecc6) said the same thing out loud:
// "Exercise names are NOT normalised and sets are NOT parsed into columns — that was a
// deliberate call: the logs stay as written."
//
// So stage two does not interpret a single exercise. It shapes each message into the
// convention the app already stores and renders, and that convention is verifiable against
// the three imported rows now in production:
//
//     title    the session's headline      "PUSH MONASH ft. Rats"
//     note     every remaining line, VERBATIM
//     done_at  the Discord message time, naive local   "2026-07-21T19:14:00"
//     kind     'strength'
//
// The one judgement it makes is WHICH MESSAGES ARE SESSIONS AT ALL, because the channel is
// four years of a group DM and most of it is not a workout. Every one of those decisions is
// printed, with its reason, so the dry run can be argued with.
// ---------------------------------------------------------------------------------------

import { createClient } from "@libsql/client";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
 * A connection string with every credential removed — scheme, host, and nothing else.
 *
 * This is not decoration. On this deployment the Turso token is carried as an `?authToken=`
 * QUERY PARAMETER inside DATABASE_URL rather than in TURSO_AUTH_TOKEN, so the obvious
 * "strip the userinfo" redaction prints a live read-write JWT to the terminal, into shell
 * scrollback, and into whatever captures that output. Anything that echoes a connection
 * string goes through here.
 */
function safeUrl(u) {
  try {
    const p = new URL(u);
    return `${p.protocol}//${p.host}${p.pathname === "/" ? "" : p.pathname}`;
  } catch {
    return String(u).split("?")[0];
  }
}

const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
/** Include misc/calisthenics sessions too. Off by default — the brief is strength. */
const ALL_KINDS = argv.includes("--all");
/**
 * File the date-disputed sessions under the MESSAGE date instead of holding them back.
 *
 * Off by default, because it overrides a date the owner typed with their own hands. What
 * makes it worth offering is that all 27 disputes in this export are one shape — a single
 * slipped digit, with the day-of-month matching the message exactly:
 *
 *   365/366/367d apart   the year: "22/04/22" sent on 22 Apr 2023
 *   30/31/59/60d apart   the month: "03/05/23" sent on 3 Jun 2023
 *
 * A gap that lands on a whole year or a whole month while the day stays put is a typing
 * slip, not a memory of a different day, and the Discord timestamp cannot be mistyped.
 */
const TRUST_MESSAGE_DATE = argv.includes("--trust-message-date");
const VERBOSE = argv.includes("--verbose");

/** The owner's own accounts. Everyone else in the group DM is chatter by definition. */
const OWNER = new Set(["taxiivation", "taxii_vfx"]);

const fileArg = argv.find((a) => !a.startsWith("--"));
const file =
  fileArg ??
  readdirSync(root)
    .filter((f) => /^Direct Messages - LOGS.*\.txt$/.test(f))
    .map((f) => resolve(root, f))[0];

if (!file || !existsSync(file)) {
  console.error(
    "usage: node scripts/import-strength.mjs [export.txt] [--commit] [--all] [--verbose]",
  );
  console.error("could not find the Discord export; pass its path explicitly");
  process.exit(1);
}

// =========================================================================================
// STAGE 1 — Discord export -> messages
//
// Structural only. It knows what a Discord message looks like and nothing whatsoever about
// training. Its whole output is { date, time, author, lines }.
// =========================================================================================

/**
 * "[11/5/2022 9:52 PM] taxiivation"
 *
 * M/D/YYYY — US order, and it is checked rather than assumed: across all 797 headers in
 * this export the first component never exceeds 12 while the second reaches 31, which is
 * only possible if the first is the month. Reading it the other way round would silently
 * corrupt every date whose day is <= 12, which is most of them. `assertHeaderOrder` below
 * re-runs that check on whatever file it is actually given.
 */
const HEADER =
  /^\[(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))? (AM|PM)\] (.+?)\s*$/;

/** Discord's own group-DM notices. Not messages anyone wrote. */
const SYSTEM =
  /^(Added .+? to the group\.|Removed .+? from the group\.|.*Left the group\.|Joined the group\.|Changed the channel name.*|Changed the channel icon\.|Pinned a message\.|.+ started a call.*|Unpinned a message\.)$/i;

/** Attachment / embed / reaction scaffolding the exporter writes into the body. */
const SCAFFOLD = /^(\{Attachments\}|\{Embed\}|\{Reactions\}|\{Stickers\}|https?:\/\/\S+)$/;

function to24h(hh, ap) {
  const h = Number(hh) % 12;
  return ap.toUpperCase() === "PM" ? h + 12 : h;
}

const pad = (n) => String(n).padStart(2, "0");

function extractMessages(text) {
  const lines = text.split(/\r?\n/);
  const messages = [];
  let cur = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const h = line.match(HEADER);
    if (h) {
      const [, mm, dd, yyyy, hour, minute, second, ap, author] = h;
      cur = {
        // The message timestamp, which is the date unless the body states one.
        date: `${yyyy}-${pad(mm)}-${pad(dd)}`,
        time: `${pad(to24h(hour, ap))}:${minute}:${second ?? "00"}`,
        month: Number(mm),
        day: Number(dd),
        author,
        lines: [],
      };
      messages.push(cur);
      continue;
    }
    // Anything before the first header is the export's own banner.
    if (cur) cur.lines.push(line);
  }

  for (const m of messages) {
    while (m.lines.length && m.lines[0].trim() === "") m.lines.shift();
    while (m.lines.length && m.lines[m.lines.length - 1].trim() === "") m.lines.pop();
  }
  return messages;
}

/** Re-derive the M/D vs D/M question from the data rather than trusting this file. */
function assertHeaderOrder(messages) {
  const maxFirst = Math.max(...messages.map((m) => m.month));
  const maxSecond = Math.max(...messages.map((m) => m.day));
  if (maxFirst > 12 && maxSecond > 12) {
    console.error("FATAL: both header components exceed 12 — the date order is unreadable.");
    process.exit(1);
  }
  if (maxFirst > 12) {
    console.error(
      `FATAL: first header component reaches ${maxFirst}, so this export is D/M/YYYY, not the\n` +
        "M/D/YYYY this script reads. Refusing to run rather than shifting every date.",
    );
    process.exit(1);
  }
  return { maxFirst, maxSecond };
}

// =========================================================================================
// STAGE 2 — message -> session, in the shape the app already stores
//
// No exercise is interpreted. What happens here is classification (is this a session?) and
// splitting (which line is the headline?), and nothing else.
// =========================================================================================

/**
 * A line recording a set that was PERFORMED.
 *
 *   "45kg OHP - 6 reps @ 1 RIR"      "1. Regular Pushups - 18 Reps - 2 minute rest"
 *   "Frontals - 7 reps"              "10kg Seated Laterals - 9.5 reps"
 *
 * The load is optional (bodyweight work has none) and so is the RIR. What every performed
 * line in this export has is a rep COUNT — a number attached to the word "rep".
 */
const PERFORMED = /\b\d+(?:\.\d+)?\s*(?:-\s*)?reps?\b/i;

/**
 * A line PRESCRIBING sets x reps — a programme, not a session.
 *
 *   "2x6-8 Conventional Deadlifts"   "3x10-15 Omni-Grip Hammer Strength Iso-Lateral Rows"
 *
 * These are all over 2023, written ahead of the day they describe, and they are the one
 * thing in the file that reads like a workout without being one. Importing them would put
 * sessions in the record that were never performed, which is the single worst thing this
 * script could do to a log whose entire purpose is honesty.
 */
const PRESCRIBED = /^\s*\d+\s*x\s*\d+/i;

/** A leading rule the owner sometimes types to separate two messages. */
const SEPARATOR = /^[-–—.=_*\s]+$/;

/**
 * A date the body states for itself, WITH OR WITHOUT the session's name after it:
 *
 *   "5/11/22:"                     bare — 28 of them
 *   "05/08/23: Ace Hardware Benching"   named — about 290 of them, the common case
 *   "23/04/24: what"
 *
 * The trailing half is the headline, and it has to be picked up HERE rather than by the
 * title rule below, because these are one line. Matching only the bare form (which is what
 * this did first) got both halves wrong at once on the majority of the file: the stated
 * date was ignored, so the session took the message's date instead, and the title came out
 * as "23/04/24: what" with the date glued to the front of it.
 *
 * D/M/Y — the opposite order to the Discord header, and consistent across the file (the
 * body of the 11/5/2022 message reads "5/11/22"). Two digits are windowed to 20xx; this log
 * starts in 2022 and no one is backfilling 1970.
 *
 * Three numeric groups separated by slashes is what makes this safe against set lines:
 * "8/9 Hand Gripper - 7 reps" has two and never matches.
 */
const BODY_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(?::\s*(.*))?$/;

/**
 * How far a stated date may sit from the message before it stops being believable.
 *
 * A session is written up on the day or shortly after, so a body date AFTER the message is
 * impossible for something already performed, and one a month earlier is a slipped digit —
 * this file has "8/1/22" on a message sent on 8 November, and two "11/05/23"s sent in June.
 * Those are not imported at either date. Guessing which half is the typo would be inventing
 * a training day, so they are listed for the owner to rule on instead.
 */
const DATE_TRUST_AFTER = 1;
const DATE_TRUST_BEFORE = 14;

/** Calisthenics / climbing — logged in this channel but 'misc' in the app, not strength. */
const MISC_HINT = /\b(calisthenic|bouldering|boulder|climb|skin the cat|muscle up|handstand)\b/i;

/** -> { date, title } for a body date line, or null when the line is not one. */
function bodyDate(line) {
  const m = line.trim().match(BODY_DATE);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Real calendar date, not just plausible digits.
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    return null;
  const trailing = (m[4] ?? "").trim();
  return {
    date: `${y}-${pad(mo)}-${pad(d)}`,
    title: trailing ? trailing.replace(/\s+/g, " ") : null,
  };
}

const daysApart = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * Turn one message into a session, or say why it is not one.
 *
 * Returns { verdict, ... }. verdict is one of:
 *   'session'  a workout, with { date, title, note, kind }
 *   'plan'     a programme template — real training content, deliberately NOT imported
 *   'chatter'  conversation, notices, attachments, timing notes
 *   'broken'   looks like a session but could not be shaped into one — printed, never written
 */
function toSession(msg) {
  const complaints = [];

  if (!OWNER.has(msg.author))
    return { verdict: "chatter", why: `written by ${msg.author}` };
  if (!msg.lines.length) return { verdict: "chatter", why: "empty body" };
  if (msg.lines.length === 1 && SYSTEM.test(msg.lines[0].trim()))
    return { verdict: "chatter", why: "Discord notice" };

  // Strip the export's attachment scaffolding and any leading rule. A body that was ONLY
  // scaffolding is a photo, not a session.
  let lines = msg.lines.filter((l) => !SCAFFOLD.test(l.trim()));
  if (!lines.some((l) => l.trim())) return { verdict: "chatter", why: "attachment only" };
  while (lines.length && (SEPARATOR.test(lines[0]) || !lines[0].trim())) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return { verdict: "chatter", why: "separator only" };

  // A PLAN ABOVE THE LOG. Eight messages in this export open with that week's programme in
  // "Inverted Rows: 3x12 + 1xFailure" notation and then start the session proper at a date
  // line partway down. Without this the headline comes out as a prescription ("Regular
  // Pushups: 1xFailure (WARMUP)") and the note carries a plan the owner never performed.
  //
  // The LAST date line wins, and only when real sets follow it — otherwise a session whose
  // final line happens to be a date would lose its whole body.
  // SHAPED like a date line, which is a weaker test than parsing as one — and it has to be.
  // Exactly one line in this export is written M/D ("12/14/2022:" on a message sent 14 Dec,
  // against 184 provably D/M lines elsewhere), so bodyDate rightly refuses to read it and
  // the session keeps the message's date, which for that message is the same day anyway.
  // Splitting is a separate question from dating: the line still marks where the plan stops
  // and the log starts, whichever order its digits are in.
  const dateAt = lines
    .map((l, i) => (BODY_DATE.test(l.trim()) ? i : -1))
    .filter((i) => i > 0);
  if (dateAt.length) {
    const at = dateAt[dateAt.length - 1];
    if (lines.slice(at + 1).some((l) => PERFORMED.test(l))) {
      complaints.push(
        `dropped ${at} preamble line(s) above the date line — programme, not performed`,
      );
      lines = lines.slice(at);
    }
  }

  // A date the body states for itself overrides the message timestamp — the owner writes
  // sessions up after the fact, and the line they typed is the day they mean.
  let date = msg.date;
  let dateNote = null;
  let disputed = null;
  /** Taken from the date line when it named the session: "05/08/23: Ace Hardware Benching". */
  let statedTitle = null;
  const stated = bodyDate(lines[0]);
  if (stated) {
    lines.shift();
    while (lines.length && !lines[0].trim()) lines.shift();
    statedTitle = stated.title;
    const gap = daysApart(msg.date, stated.date);
    date = stated.date;
    if (gap > DATE_TRUST_AFTER) {
      disputed = `states ${stated.date}, ${gap}d AFTER the message of ${msg.date}`;
    } else if (gap < -DATE_TRUST_BEFORE) {
      disputed = `states ${stated.date}, ${-gap}d BEFORE the message of ${msg.date}`;
    } else if (gap !== 0) {
      dateNote = `written up ${-gap}d later (message ${msg.date})`;
    }
  } else if (lines.length && BODY_DATE.test(lines[0].trim())) {
    // Shaped like a date, refuses to read as one — the lone "12/14/2022:". Drop it rather
    // than let it become the session's headline: a line of digits and slashes is never a
    // name, and the message's own date already covers the day.
    complaints.push(
      `unreadable date line ${JSON.stringify(lines[0].trim())} — kept the message date ${msg.date}`,
    );
    lines.shift();
    while (lines.length && !lines[0].trim()) lines.shift();
    if (!lines.length) return { verdict: "chatter", why: "date line only" };
  }
  if (!lines.length) return { verdict: "chatter", why: "date line only" };

  const content = lines.filter((l) => l.trim());
  const performed = content.filter((l) => PERFORMED.test(l));
  const prescribed = content.filter((l) => PRESCRIBED.test(l));

  // A programme: prescriptions and no performed set anywhere in it.
  if (!performed.length && prescribed.length >= 2)
    return {
      verdict: "plan",
      why: `${prescribed.length} prescribed lines ("2x8-12 …"), no performed reps`,
      date,
      preview: content[0],
    };

  if (!performed.length)
    return { verdict: "chatter", why: "no line records reps performed" };

  // The headline: whatever the date line named, else the first line that is not itself a
  // set. A session whose very first line is already a set has no title, which is legal —
  // the app renders a title-less row, and three of the four rows in production are titled
  // while the fourth is not.
  let title = statedTitle;
  const rest = [...lines];
  if (!title && rest.length && rest[0].trim() && !PERFORMED.test(rest[0])) {
    title = rest.shift().trim().replace(/\s+/g, " ");
  }
  while (rest.length && !rest[0].trim()) rest.shift();
  const note = rest.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // NEVER a partial session. Reps were found, so there is a workout in here somewhere; if
  // the split leaves nothing to store, that is this script failing to read it, not an empty
  // workout, and it must be printed rather than written.
  if (!note && !title)
    return { verdict: "broken", why: "nothing left after splitting", date, raw: msg.lines };
  if (!note)
    return {
      verdict: "broken",
      why: "a headline but no set lines survived the split",
      date,
      raw: msg.lines,
    };

  for (const l of content)
    if (PRESCRIBED.test(l) && !PERFORMED.test(l))
      complaints.push(`prescription inside a performed session: ${JSON.stringify(l.trim())}`);

  const kind = MISC_HINT.test(`${title ?? ""}\n${note}`) && !/\d\s*kg|\d\s*lbs/i.test(note)
    ? "misc"
    : "strength";

  return {
    verdict: "session",
    date,
    dateNote,
    disputed,
    messageDate: msg.date,
    title,
    note,
    kind,
    doneAt: `${date}T${msg.time}`,
    sets: performed.length,
    complaints,
  };
}

// =========================================================================================
// IDEMPOTENCY — by date + content, never by row id
// =========================================================================================

/**
 * What makes two records the same session.
 *
 * The title/note SPLIT is not part of it, deliberately. The same session exists in
 * production in both shapes: three rows carry a title with the sets in `note`, and the
 * 2026-08-06 row the owner typed by hand has title NULL and the headline sitting inside
 * `note`. Signing the recombined text matches both; signing the pair would have re-inserted
 * the hand-typed one as a duplicate on the first run.
 */
function signature(title, note) {
  return [title ?? "", note ?? ""]
    .join("\n")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The headline alone, for spotting a session that is present but has been edited since. */
function headline(title, note) {
  const first = (title ?? (note ?? "").split("\n")[0] ?? "").trim();
  return first.toLowerCase().replace(/\s+/g, " ");
}

// =========================================================================================
// RUN
// =========================================================================================

const text = readFileSync(file, "utf8");
const messages = extractMessages(text);
if (!messages.length) {
  console.error(`FATAL: no Discord message headers matched in ${file}.`);
  console.error("Expected lines like: [11/5/2022 9:52 PM] username");
  process.exit(1);
}
const order = assertHeaderOrder(messages);

const results = messages.map((m) => ({ msg: m, out: toSession(m) }));
const sessions = results.filter((r) => r.out.verdict === "session");
const plans = results.filter((r) => r.out.verdict === "plan");
const broken = results.filter((r) => r.out.verdict === "broken");
const chatter = results.filter((r) => r.out.verdict === "chatter");

/**
 * Sessions whose two dates disagree beyond believing either. Held back from the import
 * entirely rather than filed under a guess — see DATE_TRUST_*. They are printed in full so
 * the owner can rule on them, and they are the only content this script drops for a reason
 * other than "not a workout".
 */
const inScope = sessions.filter((r) => ALL_KINDS || r.out.kind === "strength");

// --trust-message-date refiles them rather than dropping them. Done here, on the way out of
// classification, so `date` and `doneAt` stay in step — a session filed on one date with a
// done_at on another would be a row that disagrees with itself.
if (TRUST_MESSAGE_DATE)
  for (const r of inScope)
    if (r.out.disputed) {
      const o = r.out;
      o.dateNote = `refiled to the message date ${o.messageDate} (body ${o.disputed})`;
      o.date = o.messageDate;
      o.doneAt = `${o.messageDate}T${o.doneAt.slice(11)}`;
      o.disputed = null;
    }

const disputed = inScope.filter((r) => r.out.disputed);
const wanted = inScope.filter((r) => !r.out.disputed);

console.log("=".repeat(78));
console.log("STAGE 1 — Discord export");
console.log("=".repeat(78));
console.log(`file                        ${file}`);
console.log(`total messages              ${messages.length}`);
console.log(
  `header date order           M/D/YYYY (first component peaks at ${order.maxFirst}, second at ${order.maxSecond})`,
);
const span = messages.map((m) => m.date).sort();
console.log(`message span                ${span[0]} .. ${span[span.length - 1]}`);
const authors = {};
for (const m of messages) authors[m.author] = (authors[m.author] || 0) + 1;
console.log(
  `authors                     ${Object.entries(authors)
    .map(([a, n]) => `${a}=${n}`)
    .join("  ")}`,
);

console.log();
console.log("=".repeat(78));
console.log("STAGE 2 — classification");
console.log("=".repeat(78));
console.log(`look like workouts          ${sessions.length}`);
console.log(`  of those, strength        ${sessions.filter((r) => r.out.kind === "strength").length}`);
console.log(`  of those, misc            ${sessions.filter((r) => r.out.kind === "misc").length}`);
console.log(`programme templates         ${plans.length}   (NOT imported — never performed)`);
console.log(`chatter / notices / photos  ${chatter.length}`);
console.log(`could not be shaped         ${broken.length}`);
console.log(`date disputed, held back    ${disputed.length}`);
console.log(`in scope for this run       ${wanted.length}${ALL_KINDS ? "  (--all)" : "  (strength only; pass --all for misc)"}`);

if (disputed.length) {
  console.log();
  console.log("-".repeat(78));
  console.log(`DATE DISPUTED — ${disputed.length} session(s), NOT imported at either date`);
  console.log("The body and the message disagree by more than a write-up delay explains.");
  console.log("-".repeat(78));
  for (const { out } of disputed) {
    console.log(`\n  ${out.title ?? "(no title)"} — ${out.disputed}`);
    for (const l of out.note.split("\n").slice(0, 6)) console.log(`      | ${l}`);
  }
}

if (broken.length) {
  console.log();
  console.log("-".repeat(78));
  console.log(`LINES THE PARSER CHOKED ON — ${broken.length} message(s), none will be written`);
  console.log("-".repeat(78));
  for (const { msg, out } of broken) {
    console.log(`\n  [${msg.date} ${msg.time}] ${msg.author} — ${out.why}`);
    for (const l of msg.lines) console.log(`      | ${l}`);
  }
}

const complained = wanted.filter((r) => r.out.complaints.length || r.out.dateNote);
if (complained.length) {
  console.log();
  console.log("-".repeat(78));
  console.log(`WORTH A LOOK — ${complained.length} in-scope session(s) with something odd`);
  console.log("-".repeat(78));
  for (const { out } of complained) {
    console.log(`\n  ${out.date}  ${out.title ?? "(no title)"}`);
    if (out.dateNote) console.log(`      date: ${out.dateNote}`);
    for (const c of out.complaints) console.log(`      ${c}`);
  }
}

if (VERBOSE && plans.length) {
  console.log();
  console.log("-".repeat(78));
  console.log(`PROGRAMME TEMPLATES SKIPPED — ${plans.length}`);
  console.log("-".repeat(78));
  for (const { msg, out } of plans)
    console.log(`  ${msg.date}  ${JSON.stringify((out.preview ?? "").slice(0, 70))}  — ${out.why}`);
}

// ----------------------------------------------------------------- against the database
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("\nFATAL: DATABASE_URL is not set (looked in the environment and .env.local).");
  process.exit(1);
}
if (COMMIT && /^file:/.test(url)) {
  console.error("\nFATAL: --commit against a file: database. This importer targets Turso.");
  process.exit(1);
}

const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

const existingRows = await db.execute(
  "SELECT id, date, kind, title, note FROM gym_sessions ORDER BY date, id",
);
const byDate = new Map();
for (const r of existingRows.rows) {
  const d = String(r.date);
  if (!byDate.has(d)) byDate.set(d, []);
  byDate.get(d).push({
    id: Number(r.id),
    kind: String(r.kind),
    sig: signature(r.title, r.note),
    head: headline(r.title, r.note),
  });
}

console.log();
console.log("=".repeat(78));
console.log("AGAINST THE DATABASE");
console.log("=".repeat(78));
console.log(`target                      ${safeUrl(url)}`);
console.log(
  `auth token                  ${
    process.env.TURSO_AUTH_TOKEN
      ? "TURSO_AUTH_TOKEN"
      : /[?&]authToken=/.test(url)
        ? "embedded in DATABASE_URL"
        : "none"
  }`,
);
console.log(`gym_sessions rows today     ${existingRows.rows.length}`);

const already = [];
const conflicts = [];
const fresh = [];
/** Sessions this run would itself insert twice — two identical messages on one day. */
const seen = new Set();

for (const { out } of wanted) {
  const sig = signature(out.title, out.note);
  const key = `${out.date} ${sig}`;
  const onDay = byDate.get(out.date) ?? [];

  if (onDay.some((r) => r.sig === sig)) {
    already.push(out);
    continue;
  }
  if (seen.has(key)) {
    already.push(out); // identical message repeated in the export — one session, not two
    continue;
  }
  const sameHead = onDay.find((r) => r.head && r.head === headline(out.title, out.note));
  if (sameHead) {
    conflicts.push({ out, existingId: sameHead.id });
    continue;
  }
  seen.add(key);
  fresh.push(out);
}

console.log(`already in gym_sessions     ${already.length}`);
console.log(`same day + same headline,`);
console.log(`  content differs           ${conflicts.length}   (NOT written — see below)`);
console.log(`NEW                         ${fresh.length}`);

if (conflicts.length) {
  console.log();
  console.log("-".repeat(78));
  console.log("PRESENT BUT DIFFERENT — left alone, because the row may have been edited");
  console.log("-".repeat(78));
  for (const { out, existingId } of conflicts) {
    console.log(`\n  ${out.date}  ${out.title ?? "(no title)"}   (existing row id ${existingId})`);
    console.log("  export has:");
    for (const l of `${out.note}`.split("\n")) console.log(`      | ${l}`);
  }
}

if (fresh.length) {
  console.log();
  console.log("=".repeat(78));
  console.log(`THE ${fresh.length} NEW SESSIONS, IN FULL`);
  console.log("=".repeat(78));
  for (const s of fresh) {
    console.log(`\n${"-".repeat(78)}`);
    console.log(`date    ${s.date}${s.dateNote ? `   [${s.dateNote}]` : ""}`);
    console.log(`kind    ${s.kind}`);
    console.log(`done_at ${s.doneAt}`);
    console.log(`title   ${s.title === null ? "(none)" : s.title}`);
    console.log(`note    (${s.sets} performed set line${s.sets === 1 ? "" : "s"})`);
    for (const l of s.note.split("\n")) console.log(`        | ${l}`);
  }
  const ds = fresh.map((s) => s.date).sort();
  console.log(`\n${"-".repeat(78)}`);
  console.log(`new sessions span ${ds[0]} .. ${ds[ds.length - 1]}`);
}

if (!COMMIT) {
  console.log();
  console.log("=".repeat(78));
  console.log("DRY RUN — nothing was written. Re-run with --commit to insert the above.");
  console.log("=".repeat(78));
  db.close();
  process.exit(0);
}

// ----------------------------------------------------------------------------- the write
//
// One INSERT per session, each re-checked against the database immediately before it goes
// in. The dry-run snapshot was taken at the top of this run and something else may have
// written since; a backlog importer is exactly the kind of long-running job for which that
// is not paranoia.
let inserted = 0;
for (const s of fresh) {
  const sig = signature(s.title, s.note);
  const onDay = await db.execute({
    sql: "SELECT title, note FROM gym_sessions WHERE date=?",
    args: [s.date],
  });
  if (onDay.rows.some((r) => signature(r.title, r.note) === sig)) {
    console.log(`  skip ${s.date} ${s.title ?? ""} — appeared since the dry run`);
    continue;
  }
  await db.execute({
    sql: "INSERT INTO gym_sessions (date, kind, title, done_at, note) VALUES (?,?,?,?,?)",
    args: [s.date, s.kind, s.title, s.doneAt, s.note],
  });
  inserted++;
}

console.log(`\ninserted ${inserted} session(s); ${already.length} were already present.`);
console.log("Rings and adherence are NOT recomputed — they derive on read.");
db.close();
