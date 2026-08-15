"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import JournalReader from "./JournalReader";
import Sheet from "./Sheet";
import type { JournalPage } from "@/lib/queries";

/**
 * EVERY PAGE EVER WRITTEN, grouped by month — the journal's record, and now a place you can
 * actually read.
 *
 * It was a shelf of 84px thumbnails. A drawing at that size is a grey smudge you open in a
 * browser tab as a raw PNG; a typed page was a blank card with the first hundred and forty
 * characters printed on it and NO WAY THROUGH TO THE REST. Everything typed into this app
 * was, in practice, write-only — which is the one thing a journal may not be.
 *
 * So the shelf became a LIST, and the unit is a page rather than a tile: the page in
 * miniature on the left, the day it belongs to and the line it opens with beside it, and the
 * whole row is the way in. The opening line is what tells two Tuesdays apart, and a
 * thumbnail cannot carry it — that is the argument for a row over a grid, and the reason a
 * contact sheet was the wrong shape for this even though it looks better in a screenshot.
 *
 * Months, not days, because that is how you leaf back through a journal — days are for
 * finding, months are for remembering. Newest month first, and inside a month the pages run
 * newest first too: leafing back, not reading forward.
 *
 * No transcription, no search, no themes. The pages are the artefact; this screen shelves
 * them and opens them.
 */

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. */
const onDay = (iso: string) => new Date(`${iso}T12:00:00`);

const monthHeading = (ym: string) =>
  onDay(`${ym}-15`).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });

const dayLabel = (iso: string) =>
  onDay(iso).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

export default function JournalArchive({ initial }: { initial: JournalPage[] }) {
  const [pages, setPages] = useState<JournalPage[]>(initial);
  const [reading, setReading] = useState<number | null>(null);
  /**
   * Month -> chapter name, for the dividers.
   *
   * The archive already divides itself by month, which is exactly the unit a chapter names —
   * so the name the masthead shows for the month you are in shows here for every month you
   * have named. READ-ONLY: the chapter is edited where it is lived in, on Today, not in the
   * archive of what has already been written.
   */
  const [chapters, setChapters] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/chapter")
      .then((r) => r.json())
      .then((d) => !d.error && setChapters(d.chapters ?? {}))
      .catch(() => {});
  }, []);

  /** Re-read after the reader writes or deletes. The list is metadata only — previews at
   *  140 characters — so re-reading all of it is cheaper than reconciling one row. */
  const reload = useCallback(() => {
    fetch("/api/journal")
      .then((r) => r.json())
      .then((d) => !d.error && setPages(d.pages ?? []))
      .catch(() => {});
  }, []);

  /** A page deleted out from under the reader must not leave it open on a row that is
   *  gone. The reader moves itself to a neighbour first; this is the case where there was
   *  no neighbour left. */
  useEffect(() => {
    if (reading != null && !pages.some((p) => p.id === reading))
      setReading(null);
  }, [pages, reading]);

  /** "2026-08" -> its pages, insertion-ordered — the query already sorts newest first. */
  const byMonth = useMemo(() => {
    const m = new Map<string, JournalPage[]>();
    for (const p of pages) {
      const ym = p.date.slice(0, 7);
      if (!m.has(ym)) m.set(ym, []);
      m.get(ym)!.push(p);
    }
    return [...m.entries()];
  }, [pages]);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg)] text-[var(--color-ink)]">
      {/* The same masthead band every screen wears — this is the app's journal, not a
          different application that happens to share a database. */}
      <header className="shrink-0 border-b border-[var(--color-line-strong)] bg-[var(--color-bar)]">
        <div className="mx-auto flex w-full max-w-[64rem] items-baseline justify-between gap-4 px-6 py-5 sm:px-8">
          <h1 className="font-serif text-heading">The journal</h1>
          <Link
            href="/"
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
          >
            ×
          </Link>
        </div>
      </header>

      {/* ONE WINDOW on the page ground, the same surface Today's hero column sits on — the
          journal is the owner's writing, and the warm near-white is the paper surface. */}
      <main className="mx-auto w-full max-w-[64rem] flex-1 px-6 pb-16 pt-6 sm:px-8">
        <div className="window bg-[var(--color-surface-1)] p-5 lg:p-8">
          {pages.length === 0 && (
            <p className="max-w-[52ch] text-body leading-relaxed text-[var(--color-muted)]">
              No pages yet. Tonight&apos;s page is written from Today — the
              Journal row of the checklist — and every page lands here, kept by
              month.
            </p>
          )}

          <div className="flex flex-col gap-8">
            {byMonth.map(([ym, mine]) => (
              // Each month its own card, wearing the record's card treatment — the same
              // smaller-pane-of-the-same-glass the chart cards established.
              <section key={ym} className="record-card">
                <div className="section-head">
                  {/* ALONGSIDE the month, not instead of it — the owner's ruling. A chapter
                      called "The Thesis Month" is a name for a stretch of life; "August
                      2026" is where it sits in a record you are scanning by date. Losing
                      the second to gain the first would make the archive harder to navigate
                      in exchange for atmosphere. */}
                  <h2 className="min-w-0 text-small font-semibold">
                    {monthHeading(ym)}
                    {chapters[ym] && (
                      <span className="ml-2 font-serif font-normal text-[var(--color-muted)]">
                        {chapters[ym]}
                      </span>
                    )}
                  </h2>
                  <span className="text-micro tabular-nums text-[var(--color-muted)]">
                    {mine.length} page{mine.length === 1 ? "" : "s"}
                  </span>
                </div>

                {/* Rows on hairlines, the way the day's blocks are drawn — a month is a
                    list of entries, and a grid of cards would be a dashboard of them. */}
                <ul className="divide-y divide-[var(--color-line)]">
                  {mine.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => setReading(p.id)}
                        className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-4 rounded-lg px-2 py-3 text-left transition-colors hover:bg-[var(--color-bg)]"
                      >
                        {/* THE PAGE IN MINIATURE. Ruled, because the ruling scales with the
                            sheet — a thumbnail is a small page, not a page with tiny lines.
                            That is the whole of `.sheet`, and it is why a typed page on this
                            list finally looks like paper rather than like a blank card. */}
                        {p.kind === "text" ? (
                          <Sheet className="w-[4.5rem] shrink-0 rounded border border-[var(--color-line)]">
                            <div className="sheet-text">{p.preview || "…"}</div>
                          </Sheet>
                        ) : (
                          <Sheet
                            rules={false}
                            className="w-[4.5rem] shrink-0 rounded border border-[var(--color-line)]"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/journal/${p.id}/image`}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover object-top"
                            />
                          </Sheet>
                        )}

                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-3">
                            {/* The date IS the title. Out of the day's context it is the
                                only thing that tells two Tuesdays apart. */}
                            <span className="min-w-0 truncate font-serif text-body">
                              {dayLabel(p.date)}
                            </span>
                            <span className="shrink-0 text-micro text-[var(--color-muted)]">
                              {p.kind === "text" ? "typed" : "handwritten"}
                            </span>
                          </span>
                          {p.kind === "text" && (
                            // The line it opens with, in the owner's serif. Two lines and
                            // no ellipsis: the clip is the edge of the excerpt, and a
                            // "read more" affordance would be a second control on a row
                            // that is already one big one.
                            <span className="mt-0.5 line-clamp-2 block max-w-[68ch] font-serif text-small text-[var(--color-muted)]">
                              {p.preview || "…"}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </main>

      {/* One page, open. Delete lives IN here rather than on the row — the one destructive
          control in the journal now sits where the page is legible, instead of hanging off
          a thumbnail nobody could read. */}
      {reading != null && (
        <JournalReader
          pages={pages}
          id={reading}
          onId={setReading}
          onChanged={reload}
          onClose={() => setReading(null)}
        />
      )}
    </div>
  );
}
