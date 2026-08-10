"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import WorkoutLog, { type Workout } from "./WorkoutLog";
import { toneColor } from "./PillarRing";
import { WORKOUT_KINDS, type WorkoutKind } from "@/lib/rings";

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

type Session = Workout & { date: string };

const LABEL: Record<WorkoutKind, string> = {
  strength: "Strength",
  cardio: "Cardio",
  misc: "Misc",
};

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
  const [filter, setFilter] = useState<WorkoutKind | null>(null);
  /** `id: null` writes a new one. The dialog carries its own date. */
  const [open, setOpen] = useState<{
    kind: WorkoutKind;
    id: number | null;
  } | null>(null);

  const load = () => {
    fetch("/api/gym/history")
      .then((r) => r.json())
      .then((d) => !d.error && setAll(d.sessions ?? []))
      .catch(() => setAll([]));
  };
  useEffect(load, []);

  const shown = useMemo(
    () => (all ?? []).filter((s) => !filter || s.kind === filter),
    [all, filter],
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
    const m = new Map<WorkoutKind, number>();
    for (const s of all ?? []) m.set(s.kind, (m.get(s.kind) ?? 0) + 1);
    return m;
  }, [all]);

  const hue = toneColor("physical", null);

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
          {[null, ...WORKOUT_KINDS].map((k) => {
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

          <button
            onClick={() => setOpen({ kind: filter ?? "strength", id: null })}
            aria-haspopup="dialog"
            className="ml-auto rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-micro text-white transition-opacity hover:opacity-90"
          >
            Write one down
          </button>
        </div>

        {all == null && (
          <p className="py-16 text-small text-[var(--color-muted)]">Loading…</p>
        )}

        {all != null && shown.length === 0 && (
          <p className="max-w-[52ch] py-16 text-small leading-relaxed text-[var(--color-muted)]">
            Nothing logged{filter ? ` under ${LABEL[filter]}` : ""} yet. Sessions
            you write down here can be dated to any day — the log is for
            catching up as much as for keeping up.
          </p>
        )}

        {byDate.length > 0 && (
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
                  {rows.map((s) => (
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
                          {s.title && (
                            <span className="min-w-0 truncate font-serif text-small text-[var(--color-muted)]">
                              {s.title}
                            </span>
                          )}
                        </span>
                        {/* pre-wrap because the line breaks ARE the log — a set per line is
                            the only structure this document has. Clamped, because the point
                            of the list is finding a session rather than reading all of it. */}
                        {s.note && (
                          <span className="mt-1.5 line-clamp-4 whitespace-pre-wrap pl-4 font-serif text-small leading-relaxed text-[var(--color-ink)]">
                            {s.note}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        </div>
      </main>

      {open && (
        <WorkoutLog
          kind={open.kind}
          label={LABEL[open.kind]}
          // The dialog opens on TODAY and lets you move it. Opening on the date of the
          // session you clicked would be right for an edit and wrong for the far commoner
          // case of writing one down, and the dialog cannot tell which you meant.
          date={today}
          workout={
            open.id == null
              ? null
              : ((all ?? []).find((x) => x.id === open.id) ?? null)
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
