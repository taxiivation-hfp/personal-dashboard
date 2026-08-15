"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import WorkoutLog, { type Workout } from "./WorkoutLog";
import SkillLog, { type SkillSession } from "./SkillLog";
import { toneColor } from "./PillarRing";
import { WORKOUT_KINDS, type WorkoutKind } from "@/lib/rings";
import {
  SEARCH_PAGE,
  searchSession,
  splitSession,
  type SessionHit,
} from "@/lib/sessions";

/**
 * Every session ever logged, and the place you write an old one down.
 *
 * The log dialog shows the last five of a kind as reference while you write; this is the
 * record itself. Two different jobs, which is why it is a page and not a taller pane: the
 * dialog is for the session in front of you, and a scrollable list of two hundred is not
 * something to put beside a textarea.
 *
 * A COUNT, never a score. No streaks, no personal bests, no volume totals, no
 * month-over-month. The rings already answer "is this enough"; this answers "what happened",
 * and nothing here is allowed to rank one session against another.
 */

/**
 * WHAT THIS PAGE LISTS, and it is no longer only the gym.
 *
 * Skill sessions joined the log because they became the same object: a dated free-text
 * document with its first line as its title. Two pages listing one kind of thing each would
 * mean two searches, and a search that can only see half your sessions is a search you stop
 * trusting. One page, one query, three chips.
 *
 * They stay DIFFERENT ROWS in different tables — a workout has a kind, a skill session has a
 * skill — so this type is the union and nothing merges them in the database.
 */
type LogKind = WorkoutKind | "skill";

type Session = Omit<Workout, "kind"> & {
  kind: LogKind;
  /** Set only on a skill session; the skill it belongs to. */
  skillId?: number;
  skillName?: string;
};

const LABEL: Record<LogKind, string> = {
  strength: "Strength",
  cardio: "Cardio",
  skill: "Skills",
};

/** The chips, in the order they are read. Skills last because it is the newest and because
 *  the two gym kinds belong together. */
const LOG_KINDS: LogKind[] = [...WORKOUT_KINDS, "skill"];

/**
 * The query, marked where it lands.
 *
 * `--color-accent-soft` is the token declared for exactly this — an accent tint sitting
 * BEHIND ink rather than replacing it — so the line stays fully legible and the app gains no
 * second accent. Every occurrence, not just the first: a line reading "Bench 3x8 then bench
 * 1x5" with one of them marked would look like a rendering bug.
 */
function marked(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const hay = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let at = 0;
  for (;;) {
    const i = hay.indexOf(needle, at);
    if (i < 0) break;
    if (i > at) out.push(text.slice(at, i));
    out.push(
      <mark
        key={i}
        className="rounded-[3px] bg-[var(--color-accent-soft)] text-[var(--color-ink)]"
      >
        {text.slice(i, i + needle.length)}
      </mark>,
    );
    at = i + needle.length;
  }
  if (!out.length) return text;
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. */
const onDay = (iso: string) => new Date(`${iso}T12:00:00`);

const heading = (iso: string) =>
  onDay(iso).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export default function SessionHistory({ today }: { today: string }) {
  const [all, setAll] = useState<Session[] | null>(null);
  /**
   * Seeded from `?kind=` so the record can link straight at one chip — the sessions figure
   * there names physical and skills separately and each opens its own half of this log.
   * Read once, on mount: after that the chips own it, and a link that kept re-asserting
   * itself would fight the control.
   */
  const [filter, setFilter] = useState<LogKind | null>(null);
  const [query, setQuery] = useState("");
  /** Searching shows a screenful, then the rest on request — see SEARCH_PAGE. */
  const [showAll, setShowAll] = useState(false);
  /** `id: null` writes a new one. The dialog carries its own date. */
  const [open, setOpen] = useState<{
    kind: LogKind;
    id: number | null;
  } | null>(null);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("kind");
    if (k && (LOG_KINDS as string[]).includes(k)) setFilter(k as LogKind);
  }, []);

  /**
   * BOTH LOGS, merged and sorted as one.
   *
   * Two requests rather than one endpoint switching on a parameter: these are different
   * tables with different columns, and a single route doing both would be two queries
   * wearing one name. Merged here, where the page already wants them in one list.
   *
   * `Promise.all`, so a slow half cannot make the other half arrive first and flash a
   * partial log. Either failing yields an empty list for that half rather than an error
   * page — half a record is worth reading, and the chips still say which half is missing.
   */
  const load = () => {
    const gym = fetch("/api/gym/history")
      .then((r) => r.json())
      .then((d) => (d.error ? [] : ((d.sessions ?? []) as Session[])))
      .catch(() => []);
    const skills = fetch("/api/skills/history")
      .then((r) => r.json())
      .then((d) =>
        d.error
          ? []
          : ((d.sessions ?? []) as {
              id: number;
              skillId: number;
              skillName: string;
              date: string;
              note: string;
            }[]
            ).map(
              (x): Session => ({
                // Ids collide across the two tables, so the list is keyed by kind AND id
                // everywhere below — see the map keys.
                id: x.id,
                date: x.date,
                kind: "skill",
                // A skill session has no stored title; its first line IS the title, which
                // splitSession derives. Passing null keeps that rule in one place.
                title: null,
                note: x.note,
                skillId: x.skillId,
                skillName: x.skillName,
              }),
            ),
      )
      .catch(() => []);
    Promise.all([gym, skills]).then(([g, k]) =>
      setAll(
        [...g, ...k].sort(
          (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
        ),
      ),
    );
  };
  useEffect(load, []);

  const shown = useMemo(
    () => (all ?? []).filter((s) => !filter || s.kind === filter),
    [all, filter],
  );

  /**
   * SEARCH, and it COMPOSES with the kind chips rather than replacing them: searching
   * "bench" under Cardio should find nothing, and that is a useful answer.
   *
   * Filtered here rather than fetched: /api/gym/history is deliberately unpaginated, so the
   * whole log is already in memory and a query is a scan over an array. The staging the
   * owner asked for is about the RESULTS — a keyword like "bench" can match half the log,
   * and a screenful is what makes it an answer instead of a second document to read.
   */
  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    if (!searching) return [];
    const out: { session: Session; hit: SessionHit }[] = [];
    for (const session of shown) {
      const hit = searchSession(session, query);
      if (hit) out.push({ session, hit });
    }
    return out;
  }, [searching, shown, query]);
  const visible = showAll ? results : results.slice(0, SEARCH_PAGE);
  /** Lines, not sessions — "4 sessions" hides that one of them matched nine times. */
  const lineCount = useMemo(
    () => results.reduce((n, r) => n + r.hit.lines.length, 0),
    [results],
  );

  /** Grouped by day, because a day is the unit you remember a session by — and because two
   *  lifts on one Tuesday should read as one Tuesday rather than two entries. */
  const byDate = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of shown) {
      if (!m.has(s.date)) m.set(s.date, []);
      m.get(s.date)!.push(s);
    }
    return [...m.entries()];
  }, [shown]);

  const counts = useMemo(() => {
    const m = new Map<LogKind, number>();
    for (const s of all ?? []) m.set(s.kind, (m.get(s.kind) ?? 0) + 1);
    return m;
  }, [all]);

  /** A session wears its PILLAR's hue: the gym is Physical, a skill is Portfolio. The
   *  chip you filtered by and the dialog you open from it therefore agree about what kind
   *  of thing you are looking at, without either naming it again. */
  const hueFor = (k: LogKind) =>
    k === "skill" ? toneColor("portfolio", null) : toneColor("physical", null);
  const hue = hueFor(filter ?? "strength");

  return (
    // The WINDOW LOOK, the same architecture the record and the journal wear: the masthead
    // band, then one window on the page ground, with each day a card inside it. This page
    // used to be bare rules on the page — the one deeper screen that had not joined the
    // family.
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="shrink-0 border-b border-[var(--color-line-strong)] bg-[var(--color-bar)]">
        <div className="mx-auto flex w-full max-w-[64rem] items-baseline justify-between gap-4 px-6 py-5 sm:px-8">
          <h1 className="font-serif text-heading">Sessions</h1>
          <Link
            href="/"
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
          >
            ×
          </Link>
        </div>
      </header>

      {/* Gold, because this is the Physical pillar's record — the same surface its window
          wears on Today, so arriving here reads as stepping deeper into that window rather
          than leaving the app. */}
      <main className="mx-auto w-full max-w-[64rem] flex-1 px-6 pb-16 pt-6 sm:px-8">
        <div className="window bg-[var(--color-surface-3)] p-5 lg:p-8">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* "All" first and selected by default: the page is the record, and a filter is
              something you reach for rather than something you arrive inside. */}
          {[null, ...LOG_KINDS].map((k) => {
            const on = filter === k;
            const n = k == null ? (all?.length ?? 0) : (counts.get(k) ?? 0);
            return (
              <button
                key={k ?? "all"}
                onClick={() => setFilter(k)}
                aria-pressed={on}
                className="rounded-full border px-3.5 py-1.5 text-micro tabular-nums transition-colors"
                style={{
                  borderColor: on
                    ? "var(--color-ink)"
                    : "var(--color-line-strong)",
                  color: on ? "var(--color-ink)" : "var(--color-muted)",
                }}
              >
                {k == null ? "All" : LABEL[k]}
                <span className="ml-1.5 text-[var(--color-muted)]">{n}</span>
              </button>
            );
          })}

          {/* A NEW SKILL SESSION CANNOT BE WRITTEN FROM HERE, and the control says so
              rather than failing quietly.
              This page lists sessions across every skill, so "which skill" has no answer
              here — on the board it is answered by the row you tapped. The button would
              otherwise open a dialog with no skill to write to, which is the worst kind of
              dead control: one that looks live. A gym session has no such ambiguity, since
              the chip you are standing on IS its kind. */}
          {filter === "skill" ? (
            <Link
              href="/"
              className="ml-auto rounded-full border border-[var(--color-line-strong)] px-4 py-1.5 text-micro text-[var(--color-muted)] transition-colors hover:border-[var(--color-ink)] hover:text-[var(--color-ink)]"
            >
              Log a skill on the board
            </Link>
          ) : (
            <button
              onClick={() =>
                setOpen({ kind: (filter as WorkoutKind) ?? "strength", id: null })
              }
              aria-haspopup="dialog"
              className="ml-auto rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-micro text-white transition-opacity hover:opacity-90"
            >
              Write one down
            </button>
          )}
        </div>

        {/* A LINE, not a box — the app's own input idiom, and the one that keeps a control
            you reach for occasionally from looking like a form you have to fill in first.
            type="search" so a phone offers the right keyboard and its own clear button. */}
        <label className="mt-5 flex items-baseline gap-3 border-b border-[var(--color-line-strong)] pb-1.5 transition-colors focus-within:border-[var(--color-accent)]">
          <span className="shrink-0 text-micro text-[var(--color-muted)]">
            Find
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // A new query is a new question — the last one's "show all" must not carry
              // over and dump four hundred lines onto the first keystroke of the next.
              setShowAll(false);
            }}
            placeholder="an exercise, a weight, a word you wrote"
            aria-label="Search every session"
            className="min-w-0 flex-1 bg-transparent font-serif text-small outline-none placeholder:text-[var(--color-muted)]"
          />
          {searching && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setShowAll(false);
              }}
              className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
            >
              clear
            </button>
          )}
        </label>

        {all == null && (
          <p className="py-16 text-small text-[var(--color-muted)]">Loading…</p>
        )}

        {/* THE RESULTS, and they are LINES rather than sessions. Searching a training log is
            asking "where did I last do this and what did I lift" — the answer is the line
            itself, so the line is what the result shows. The session it came from is named
            above it, and opening it is one tap away for the rest of the document. */}
        {all != null && searching && (
          <div className="mt-6">
            {/* THE HEADING LEADS WITH LINES ONLY WHEN THERE ARE LINES.
                A title match contributes no line — searchSession deliberately keeps the
                heading out of hit.lines so a result cannot print the same text twice — so
                a query that lands purely in session names has lineCount 0. Leading with it
                unconditionally printed "0 lines" directly above four listed results, on the
                single most natural query for this feature: searching a session by its name.
                Whichever figure is true is the one that leads. */}
            <div className="section-head">
              <h2 className="text-small font-semibold">
                {results.length === 0
                  ? "No matches"
                  : lineCount > 0
                    ? `${lineCount} line${lineCount === 1 ? "" : "s"}`
                    : `${results.length} session${results.length === 1 ? "" : "s"}`}
              </h2>
              <span className="text-micro tabular-nums text-[var(--color-muted)]">
                {results.length > 0 &&
                  (lineCount > 0
                    ? `in ${results.length} session${results.length === 1 ? "" : "s"}`
                    : "matched by name")}
              </span>
            </div>

            {results.length === 0 ? (
              <p className="max-w-[52ch] py-8 text-small leading-relaxed text-[var(--color-muted)]">
                Nothing in {filter ? LABEL[filter] : "the log"} matches “
                {query.trim()}”. The search is a plain phrase, so “incline db”
                finds that pair of words together and “incline bench” does not
                find them ten lines apart.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-[var(--color-line)]">
                  {visible.map(({ session: s, hit }) => {
                    const { title } = splitSession(s);
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => setOpen({ kind: s.kind, id: s.id })}
                          aria-haspopup="dialog"
                          className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-3 text-left transition-colors hover:bg-[var(--color-panel-2)]"
                        >
                          <span className="flex items-baseline gap-2">
                            <span
                              aria-hidden
                              className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
                              style={{ background: hue }}
                            />
                            <span className="shrink-0 text-small font-semibold">
                              {LABEL[s.kind]}
                            </span>
                            {title && (
                              <span className="min-w-0 truncate font-serif text-small text-[var(--color-muted)]">
                                {marked(title, query)}
                              </span>
                            )}
                            <span className="ml-auto shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                              {onDay(s.date).toLocaleDateString("en-AU", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </span>

                          {/* The matching lines only. Their line NUMBER travels with them —
                              out of the document a set has no other address, and it is what
                              tells two identical "Bench 3x8" lines apart. */}
                          {hit.lines.map((l) => (
                            <span
                              key={l.n}
                              className="mt-1.5 flex items-baseline gap-2.5 pl-4"
                            >
                              <span className="w-5 shrink-0 text-right text-micro tabular-nums text-[var(--color-muted)]">
                                {l.n}
                              </span>
                              <span className="min-w-0 flex-1 font-serif text-small leading-relaxed tabular-nums">
                                {marked(l.text, query)}
                              </span>
                            </span>
                          ))}

                          {/* Only the title matched, so there is no line to show — say so
                              rather than leaving a result that looks truncated. */}
                          {hit.lines.length === 0 && (
                            <span className="mt-1.5 block pl-4 text-micro text-[var(--color-muted)]">
                              matched in the title
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {results.length > visible.length && (
                  <button
                    onClick={() => setShowAll(true)}
                    className="mt-4 rounded-full border border-[var(--color-line-strong)] px-4 py-1.5 text-micro transition-colors hover:bg-[var(--color-panel)]"
                  >
                    Show the other {results.length - visible.length} session
                    {results.length - visible.length === 1 ? "" : "s"}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {all != null && !searching && shown.length === 0 && (
          <p className="max-w-[52ch] py-16 text-small leading-relaxed text-[var(--color-muted)]">
            Nothing logged{filter ? ` under ${LABEL[filter]}` : ""} yet. Sessions
            you write down here can be dated to any day — the log is for
            catching up as much as for keeping up.
          </p>
        )}

        {/* The record itself, which the results REPLACE while a query is live rather than
            sitting under them. Two lists of the same sessions on one screen is a page you
            have to work out; a search is a different question, so it gets the room. */}
        {!searching && byDate.length > 0 && (
          <div className="mt-8 flex flex-col gap-5">
            {/* Each day a CARD — the record's own card treatment, so a day of training
                reads as one sheet with its sessions on it rather than a run of rules. */}
            {byDate.map(([date, rows]) => (
              <section key={date} className="record-card">
                <div className="section-head">
                  <h2 className="text-small font-semibold">{heading(date)}</h2>
                  <span className="text-micro tabular-nums text-[var(--color-muted)]">
                    {rows.length} session{rows.length === 1 ? "" : "s"}
                  </span>
                </div>

                <ul className="divide-y divide-[var(--color-line)]">
                  {rows.map((s) => {
                    /* THE FIRST LINE IS THE TITLE. It used to be the stored column only,
                       which the rescued Discord history is the only thing that fills — so a
                       session written in the app sat here as an untitled block of text next
                       to imported ones that read properly. */
                    const { title, body } = splitSession(s);
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => setOpen({ kind: s.kind, id: s.id })}
                          aria-haspopup="dialog"
                          // panel-2, not panel: the card's own ground IS panel now, so the
                          // old hover was invisible on it.
                          className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-3 text-left transition-colors hover:bg-[var(--color-panel-2)]"
                        >
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: hue }}
                            />
                            <span className="text-small font-semibold">
                              {LABEL[s.kind]}
                            </span>
                            {title && (
                              <span className="min-w-0 truncate font-serif text-small text-[var(--color-muted)]">
                                {title}
                              </span>
                            )}
                          </span>
                          {/* pre-wrap because the line breaks ARE the log — a set per line is
                              the only structure this document has. Clamped, because the point
                              of the list is finding a session rather than reading all of it. */}
                          {body && (
                            <span className="mt-1.5 line-clamp-4 whitespace-pre-wrap pl-4 font-serif text-small leading-relaxed text-[var(--color-ink)]">
                              {body}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
        </div>
      </main>

      {/* THE RIGHT DIALOG FOR THE ROW. Two logs share this page, and they are not the same
          document: a workout belongs to a kind and writes to /api/gym, a skill session
          belongs to a SKILL and writes to /api/skills/[id]/time. Branching here rather than
          widening one dialog keeps each one's rules where they already live. */}
      {open?.kind === "skill" &&
        (() => {
          const row =
            open.id == null
              ? null
              : ((all ?? []).find(
                  (x) => x.kind === "skill" && x.id === open.id,
                ) ?? null);
          // A NEW skill session cannot be written from here: this page lists sessions across
          // every skill, and "which skill" is a question the board answers by being the
          // place you tapped. Sending you there beats guessing.
          if (!row?.skillId) return null;
          const session: SkillSession = {
            id: row.id,
            date: row.date,
            note: row.note ?? "",
          };
          return (
            <SkillLog
              key={`sk${row.id}`}
              name={row.skillName ?? "Skill"}
              date={today}
              today={today}
              session={session}
              recent={(all ?? [])
                .filter((x) => x.kind === "skill" && x.skillId === row.skillId)
                .map((x) => ({ id: x.id, date: x.date, note: x.note ?? "" }))}
              hue={hueFor("skill")}
              onSave={async (note, day) => {
                await fetch(`/api/skills/${row.skillId}/time`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ id: row.id, note, date: day }),
                }).catch(() => {});
                load();
              }}
              onDelete={async () => {
                await fetch(
                  `/api/skills/${row.skillId}/time?session=${row.id}&date=${today}`,
                  { method: "DELETE" },
                ).catch(() => {});
                load();
              }}
              onPick={(picked) =>
                setOpen(picked ? { kind: "skill", id: picked.id } : null)
              }
              onClose={() => setOpen(null)}
            />
          );
        })()}

      {open && open.kind !== "skill" && (
        <WorkoutLog
          /* One dialog per SESSION — see the same key in PillarSections. `note` and `day`
             are state seeded from props, and only a remount re-seeds them. */
          key={open.id ?? "new"}
          kind={open.kind as WorkoutKind}
          label={LABEL[open.kind]}
          // The day a NEW session defaults to. Editing an existing one ignores this and
          // opens on the session's own date — the dialog reads that off `workout`, which
          // is exactly how it tells the two cases apart. This comment used to claim it
          // could not, and the resulting mismatch was what made an edit clone the session
          // onto today instead of moving it.
          date={today}
          today={today}
          workout={
            open.id == null
              ? null
              : ((all ?? []).find(
                  (x) => x.kind === open.kind && x.id === open.id,
                ) as Workout | undefined) ?? null
          }
          hue={hue}
          onSave={async (note, day) => {
            await fetch("/api/gym", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                date: day,
                kind: open.kind,
                note,
                id: open.id,
              }),
            }).catch(() => {});
            load();
          }}
          onDelete={async () => {
            if (open.id == null) return;
            await fetch(`/api/gym?id=${open.id}&date=${today}`, {
              method: "DELETE",
            }).catch(() => {});
            load();
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
