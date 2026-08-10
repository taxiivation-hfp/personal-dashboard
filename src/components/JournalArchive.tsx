"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { JournalPage } from "@/lib/queries";

/**
 * EVERY PAGE EVER WRITTEN, grouped by month — the journal's record.
 *
 * The shelf used to live at the foot of Today, under the day's blocks, which put the
 * archive on the acting screen: Today is where you write tonight's page, and this is where
 * you go back — the same split /stats draws between acting and looking, so it gets the
 * same architecture: a route of its own, wearing the window.
 *
 * Months, not days, because that is how you leaf back through a journal — days are for
 * finding, months are for remembering. Newest month first, and inside a month the pages run
 * newest first too: leafing back, not reading forward.
 *
 * No transcription, no search, no themes. The pages are the artefact; this screen only
 * shelves them.
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
  onDay(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric" });

export default function JournalArchive({ initial }: { initial: JournalPage[] }) {
  const [pages, setPages] = useState<JournalPage[]>(initial);
  const [confirming, setConfirming] = useState<number | null>(null);

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

  async function remove(id: number) {
    await fetch(`/api/journal/${id}`, { method: "DELETE" }).catch(() => {});
    setConfirming(null);
    setPages((ps) => ps.filter((p) => p.id !== id));
  }

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
                  <h2 className="text-small font-semibold">
                    {monthHeading(ym)}
                  </h2>
                  <span className="text-micro tabular-nums text-[var(--color-muted)]">
                    {mine.length} page{mine.length === 1 ? "" : "s"}
                  </span>
                </div>

                {/* The shelf, exactly as Today drew it: paper thumbnails, drawings as
                    themselves. The date sits under each page — out of the day's context it
                    is the only thing that tells two Tuesdays apart. */}
                <div className="mt-4 flex flex-wrap items-start gap-x-3 gap-y-4">
                  {mine.map((p) => (
                    <div key={p.id} className="relative">
                      {p.kind === "text" ? (
                        <div
                          className="flex h-[119px] w-[84px] overflow-hidden rounded-lg border border-[var(--color-line)] p-2"
                          style={{ background: "#fdfbf6" }}
                        >
                          <span className="line-clamp-6 font-serif text-micro text-[var(--color-ink)]">
                            {p.preview || "…"}
                          </span>
                        </div>
                      ) : (
                        <a
                          href={`/api/journal/${p.id}/image`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/journal/${p.id}/image`}
                            alt={`Handwritten page from ${p.date}`}
                            loading="lazy"
                            className="h-[119px] w-[84px] rounded-lg border border-[var(--color-line)] object-cover object-top"
                          />
                        </a>
                      )}
                      <p className="mt-1 text-center text-micro tabular-nums text-[var(--color-muted)]">
                        {dayLabel(p.date)}
                      </p>

                      {/* Always present rather than revealed on hover — phone first, and a
                          hidden control is an absent one. Quiet, because it is the one
                          destructive thing on the shelf. */}
                      <button
                        onClick={() => setConfirming(p.id)}
                        aria-label="Delete this page"
                        className="absolute -right-2 -top-2 rounded-full p-1 text-micro leading-none text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
                      >
                        ×
                      </button>

                      {/* One stray tap must never destroy handwriting. Same ask, same
                          panel, as the Today shelf it replaces. */}
                      {confirming === p.id && (
                        <div className="absolute left-0 top-full z-[var(--z-popover)] mt-1.5 w-48 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3">
                          <p className="text-small leading-snug">
                            Delete this page? It can&apos;t be undone.
                          </p>
                          <div className="mt-3 flex items-center gap-3">
                            <button
                              onClick={() => remove(p.id)}
                              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setConfirming(null)}
                              className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                            >
                              Keep
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
