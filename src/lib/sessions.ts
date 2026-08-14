// READING a workout session: what its title is, and finding a line in it.
//
// PURE and import-free, so it runs under `node --test` with no dependencies — and so the
// four screens that show a session (the log dialog's history pane, /sessions, the Physical
// pillar's drill-down and its chips) cannot each invent their own answer.
//
// It is a READ model and nothing else. Nothing here writes, splits or rewrites a stored
// note: the document the owner typed stays exactly as they typed it, and everything below
// is a view of it. That is the whole design — see splitSession.

export type SessionDoc = {
  /** The `gym_sessions.title` COLUMN, which only the rescued Discord history ever fills. */
  title: string | null;
  note: string | null;
};

export type SplitSession = {
  /** What to print as the heading, or null when there is nothing to head. */
  title: string | null;
  /** What to print underneath. Never includes the title line. */
  body: string;
};

/**
 * THE FIRST LINE OF A SESSION IS ITS TITLE.
 *
 * The owner writes a session as a name and then the sets under it, which is what a training
 * log looks like on paper. Until now only the rescued Discord history had a title — that
 * history arrived with one in its own COLUMN — so anything written in the app rendered as an
 * untitled block of text while the imported rows beside it read properly. The convention
 * already existed in one corner of the app (the pillar chips) and nowhere else.
 *
 * DERIVED ON READ, never stored, and that is the important part:
 *
 *   - The note stays ONE document. The dialog is a single textarea, and the first line is
 *     just its first line — editable, deletable, rewritable like any other. Splitting the
 *     text into a title column and a body column on save would turn the log into a form,
 *     which is the one thing this document refuses to be.
 *   - Nothing migrates. Every session ever written already has a first line, so every one of
 *     them acquires a title the moment this ships, and no row is touched to do it.
 *   - It cannot go stale. A stored split would have to be recomputed on every edit, and the
 *     day it was not is the day the heading stops matching the text under it.
 *
 * A STORED TITLE WINS, and its note is left whole. For the Discord history the title is not
 * the note's first line — it is a separate fact that arrived alongside it — so promoting the
 * note's first line as well would eat a real line of training out of the body.
 *
 * Blank leading lines are skipped rather than becoming an empty title, and the body keeps its
 * own interior blank lines: the line breaks ARE the log, and this must not reflow it.
 */
export function splitSession(s: SessionDoc): SplitSession {
  const note = s.note ?? "";
  const stored = (s.title ?? "").trim();
  if (stored) return { title: stored, body: note };

  const lines = note.split(/\r?\n/);
  // The first line with something on it. A note that opens with a blank line has a first
  // line of "", and an empty heading over the real one is worse than no heading.
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === "") i++;
  if (i >= lines.length) return { title: null, body: "" };

  const title = lines[i]!.trim();
  // The rest, with the blank lines that separated it from the title dropped — those were
  // spacing under a heading, and the heading is now drawn as one.
  let j = i + 1;
  while (j < lines.length && lines[j]!.trim() === "") j++;
  return { title, body: lines.slice(j).join("\n") };
}

/** Just the heading, for the many places that want nothing else. */
export function sessionTitle(s: SessionDoc): string | null {
  return splitSession(s).title;
}

/** One line of a session that matched, and where it sits in the document. */
export type MatchedLine = {
  /** 1-based, counted over the WHOLE note including the title line — so it is the line
   *  number you would count to if you opened the session and read down it. */
  n: number;
  text: string;
};

export type SessionHit = {
  /** The query is in the heading, whether that heading is stored or derived. */
  titleHit: boolean;
  /** The body lines that matched, in document order. May be empty when only the title did. */
  lines: MatchedLine[];
};

/**
 * How many hits a search shows before it offers the rest.
 *
 * The owner's ask, and it is about the RESULTS rather than the reading: /api/gym/history is
 * deliberately unpaginated and /sessions already holds every session in memory, so there is
 * no fetch to save here and staging one would be invented work. What ten does buy is a
 * screen you can take in — a keyword like "bench" can match half the log, and four hundred
 * lines is not an answer to "where did I last do this".
 */
export const SEARCH_PAGE = 10;

/**
 * Find a keyword in one session. Null when the query is empty or nothing matched.
 *
 * CASE-INSENSITIVE SUBSTRING over the raw query, deliberately — not tokens, not fuzzy, not
 * AND-of-words. A training log is searched for things like "incline db" and "5x5", and a
 * tokeniser would quietly match a session containing "incline" and "db" ten lines apart
 * while a phrase search says what it did. Predictable beats clever on a record you are
 * trying to trust.
 *
 * The line numbers count over the whole note, title line included, so a hit can say where in
 * the document it is regardless of how the heading is being drawn.
 */
export function searchSession(s: SessionDoc, query: string): SessionHit | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const { title } = splitSession(s);
  const titleHit = (title ?? "").toLowerCase().includes(q);

  // Scanned over the RAW note, not the split body, so `n` is a real line number in the
  // document. The title line is skipped only when it is the note's own first line — a
  // stored title is not in the note at all, so nothing there is skipped.
  const note = s.note ?? "";
  const raw = note.split(/\r?\n/);
  const derived = !(s.title ?? "").trim();
  let skip = -1;
  if (derived) {
    let i = 0;
    while (i < raw.length && raw[i]!.trim() === "") i++;
    skip = i;
  }

  const lines: MatchedLine[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (i === skip) continue;
    const text = raw[i]!;
    if (text.trim() && text.toLowerCase().includes(q)) {
      lines.push({ n: i + 1, text: text.trim() });
    }
  }

  return titleHit || lines.length ? { titleHit, lines } : null;
}
