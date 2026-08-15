"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LogDay, LogEntry, LogKind } from "@/lib/dayLog";

/**
 * THE WRITTEN RECORD — every word this app holds, by the day it was written.
 *
 * The second half of the record, beside the stats. It exists because everything the owner
 * WRITES lived on a different screen from everything else they wrote: journal pages on
 * /journal, workouts on /sessions, skill sessions inside a pillar drill-down, drift reasons
 * nowhere at all. Each of those answers "show me my gym log". None answered "what did I write
 * down on the 12th", which is the question actually being asked.
 *
 * A CONTINUOUS SCROLL, not a day picker, by the owner's ruling — this is a record you skim
 * backwards through, and /sessions already proves that shape works here. Days holding nothing
 * are omitted upstream (see dayLog.ts), so a quiet fortnight costs one thin page rather than
 * fourteen cards saying you wrote nothing.
 *
 * IT OWNS NOTHING. Every entry belongs to the surface that created it and this is a reader —
 * no writing, no editing, no deleting. A journal page opens in the journal, which is where a
 * page can be rewritten. That keeps the app's one rule about duplicated records intact: two
 * places that can change the same row are two places that eventually disagree about it.
 */

/**
 * The hue a kind wears, and it is the PILLAR's, not a palette of its own.
 *
 * A workout is Physical, a skill session is Portfolio, outreach is Social — the same three
 * hues the rings use, so a colour means the same thing on both halves of the record. Drift
 * is deliberately achromatic: it belongs to a calendar block rather than to a pillar, and
 * giving it a hue would be inventing a fourth category. It is also the one entry here that
 * records something not going to plan, and this app does not colour that.
 */
const KIND_HUE: Record<LogKind, string> = {
  journal: "var(--color-portfolio)",
  gym: "var(--color-physical)",
  skill: "var(--color-portfolio)",
  outreach: "var(--color-social)",
  drift: "var(--color-line-strong)",
};

/** What each kind is CALLED, where the meta line does not already say it. */
const KIND_LABEL: Record<LogKind, string> = {
  journal: "journal",
  gym: "",
  skill: "",
  outreach: "outreach",
  drift: "drifted",
};

/** "2026-08-12" -> "Wed 12 August". Noon, never midnight: a bare ISO date parses as UTC and
 *  lands on the day before anywhere west of Greenwich. */
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });

/** How many lines of a body show before it is folded. Enough to recognise a session by its
 *  first sets; short enough that one long journal page cannot own the screen. */
const FOLD_LINES = 4;

function Entry({ e }: { e: LogEntry }) {
  const [open, setOpen] = useState(false);
  const lines = (e.body ?? "").split(/\r?\n/);
  // The title is already printed above, so the body shown here is what FOLLOWS it — except
  // for a drift, whose title is the block's name and whose body is the reason itself.
  const rest = e.kind === "drift" ? lines : lines.slice(1);
  const meaningful = rest.filter((l) => l.trim()).length > 0;
  const foldable = rest.length > FOLD_LINES;
  const shown = open ? rest : rest.slice(0, FOLD_LINES);
  const meta = [e.meta, KIND_LABEL[e.kind]].filter(Boolean).join(" · ");

  return (
    <li className="page-margin py-3">
      <div className="pt-1.5 text-right">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full align-middle"
          style={{ background: KIND_HUE[e.kind] }}
        />
      </div>

      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="min-w-0 font-serif text-body">
            {e.title ?? (
              // Never invented upstream, and not invented here either — the app says it
              // has no heading rather than writing one on the owner's behalf.
              <span className="text-[var(--color-muted)]">untitled</span>
            )}
          </span>
          {meta && (
            <span className="shrink-0 text-micro text-[var(--color-muted)]">
              {meta}
            </span>
          )}
        </p>

        {meaningful && (
          <>
            {/* The owner's own words, in the serif the journal and the session dialogs use.
                `whitespace-pre-wrap` because a workout is a column of sets and reflowing it
                into a paragraph destroys the only structure it has. */}
            <p className="mt-1 whitespace-pre-wrap font-serif text-small leading-relaxed text-[var(--color-muted)]">
              {shown.join("\n").trimEnd()}
            </p>
            {foldable && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="mt-1 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
              >
                {open ? "less" : `${rest.length - FOLD_LINES} more lines`}
              </button>
            )}
          </>
        )}

        {/* A page is opened where a page can be READ and rewritten — the journal. This is a
            reader; sending an edit control from here would be a second place the journal
            lives. Drawings have no body above, so this is the only way into them. */}
        {e.kind === "journal" && (
          <Link
            href="/journal"
            className="mt-1 inline-block text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            open in the journal
          </Link>
        )}
      </div>
    </li>
  );
}

export default function DayLog({ date }: { date: string }) {
  const [days, setDays] = useState<LogDay[]>([]);
  const [next, setNext] = useState<string | null>(date);
  const [done, setDone] = useState(false);
  /** null until the FIRST page answers. An empty list and an unanswered one are different
   *  facts, and printing "nothing written yet" during the wait states the wrong one. */
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  /**
   * THE IN-FLIGHT GUARD, and it is a REF rather than the `busy` state beside it.
   *
   * `busy` drives the "reading…" line, so it has to be state. It cannot also be the guard:
   * a state update is not visible until React commits, so two calls arriving in the same
   * tick both read `busy === false` and both fetch the SAME page. The initial load and the
   * IntersectionObserver do exactly that on mount, and StrictMode's double-invoke does it
   * again — which appended one page twice and produced React's "two children with the same
   * key" on every date in it. A ref is written synchronously, so the second caller sees it.
   */
  const inFlight = useRef(false);

  const more = useCallback(async () => {
    if (inFlight.current || done || next == null) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const d = await fetch(`/api/log?before=${next}`)
        .then((r) => (r.ok ? r.json() : { days: [], done: true }))
        .catch(() => ({ days: [], done: true }));
      /**
       * Appended by DATE, never blindly concatenated.
       *
       * Belt to the ref's braces: a day already on screen must never be added a second
       * time, whatever races upstream of here. `key={d.date}` is what the list is drawn
       * with, and React's response to a duplicate key is to drop or duplicate rows
       * silently — a log that quietly omits a Tuesday is worse than one that fails loudly.
       */
      setDays((prev) => {
        const seen = new Set(prev.map((x) => x.date));
        const fresh = ((d.days ?? []) as LogDay[]).filter(
          (x) => !seen.has(x.date),
        );
        return fresh.length ? [...prev, ...fresh] : prev;
      });
      setNext(d.nextBefore ?? null);
      // Only an EMPTY page ends the scroll. A short page is not the end — days with nothing
      // written are skipped, so a page can come back thin with years still behind it.
      if (d.done || d.nextBefore == null) setDone(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
      setLoaded(true);
    }
  }, [done, next]);

  // First page on mount, and again if the anchor date changes under it.
  useEffect(() => {
    // A fresh anchor is a fresh log. The ref is cleared too, or a fetch still in flight
    // from the previous date would land its `finally` on the new one and unblock nothing.
    inFlight.current = false;
    setDays([]);
    setNext(date);
    setDone(false);
    setLoaded(false);
  }, [date]);

  useEffect(() => {
    if (!loaded && !busy && next === date) void more();
  }, [loaded, busy, next, date, more]);

  /**
   * Infinite scroll by INTERSECTION, not by a scroll listener.
   *
   * A scroll handler fires on every frame of every scroll and has to be told which element
   * it is measuring; an observer fires once when the foot of the list actually comes into
   * view, and works unchanged whether this is scrolling inside the record's pane or the
   * page itself. `rootMargin` starts the fetch a screen early so the next page is usually
   * already there by the time the last one runs out.
   */
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && void more(),
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [more, done]);

  return (
    <div className="mx-auto w-full max-w-[52rem]">
      {days.map((d) => (
        <section key={d.date} className="mt-6 first:mt-0">
          <div className="section-head">
            <h2 className="font-serif text-body font-semibold">
              {dayLabel(d.date)}
            </h2>
            <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
              {d.entries.length}
            </span>
          </div>
          <ul className="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
            {d.entries.map((e) => (
              <Entry key={`${e.kind}${e.id}`} e={e} />
            ))}
          </ul>
        </section>
      ))}

      {loaded && days.length === 0 && (
        <p className="py-8 text-small leading-relaxed text-[var(--color-muted)]">
          Nothing written yet. Journal pages, workouts, skill sessions and
          outreach all land here on the day you wrote them.
        </p>
      )}

      {/* The foot. It carries the observer, so it must stay mounted while there is more. */}
      <div ref={sentinel} className="py-6 text-center">
        {busy && (
          <span className="text-micro text-[var(--color-muted)]">reading…</span>
        )}
        {done && days.length > 0 && (
          <span className="text-micro text-[var(--color-muted)]">
            that is the whole log
          </span>
        )}
      </div>
    </div>
  );
}
