"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JournalCanvas from "./JournalCanvas";
import JournalDrawing from "./JournalDrawing";
import JournalText from "./JournalText";
import Sheet from "./Sheet";
import type { JournalPage } from "@/lib/queries";
import { saveDrawing, type SheetImage } from "@/lib/journalSave";
import { fetchSender } from "@/lib/journalSend";

/**
 * ONE PAGE, OPEN — and the way through to the ones either side of it.
 *
 * The journal could be written and shelved but never read: a drawing opened as a raw PNG in
 * a browser tab, which is the file rather than the page, and a typed page could not be
 * opened at all — the shelf showed its first hundred and forty characters and there was no
 * way to the rest. Everything typed into this app before today was, in practice, write-only.
 *
 * LEAFING IS BY DATE, not by list position, and the words say so. `pages` arrives newest
 * first, so "older" walks down the array and "newer" walks up; labelling the controls with a
 * pair of arrows alone would have made the direction a thing you learn by pressing one.
 *
 * The sheet here GROWS. A page is at least A4 and then as long as the writing on it, rather
 * than a fixed rectangle with a scrollbar sliding the words across their own rules.
 */

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. */
const onDay = (iso: string) => new Date(`${iso}T12:00:00`);

const longDay = (iso: string) =>
  onDay(iso).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

type Loaded = {
  id: number;
  date: string;
  kind: string;
  body: string | null;
  /** How many A4 sheets the scroll runs to — ≥1 for a drawing, 0 for a typed page. The
   *  reader draws them all and the canvas loads them all as its base; see sheets.ts. */
  sheets: number;
};

export default function JournalReader({
  pages: given,
  id,
  onId,
  onChanged,
  onClose,
}: {
  /**
   * The pages this reader can leaf through, newest first.
   *
   * Optional, and the fallback matters: opened from the archive it is handed the list that
   * screen already has, and opened from the day's checklist there is no list to hand — so
   * it fetches the archive itself rather than leafing only through the pages that happen
   * to share a date with the one you opened. Metadata only, and previews at 140 characters;
   * a year of it is a few hundred short rows.
   */
  pages?: JournalPage[];
  id: number;
  onId: (id: number) => void;
  /** Raised after a write, so the list behind this reloads its previews. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [fetched, setFetched] = useState<JournalPage[] | null>(null);
  const pages = given ?? fetched ?? [];

  const [page, setPage] = useState<Loaded | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /**
   * The cache-buster appended to every sheet URL — UNIQUE PER MOUNT, and moved on after a
   * save.
   *
   * `[id]/sheet/[seq]` is served with `cache-control: private, max-age=3600`, which is
   * right for a page that almost never changes and exactly wrong for the moment one just
   * did — the browser would answer the reload out of its own cache and show the page as it
   * was before the pen touched it. It is also part of the canvas's `base`, so it is what
   * makes the editor reload its sheets.
   *
   * It is a timestamp and not a counter because THE READER IS UNMOUNTED ON CLOSE. A counter
   * started at 0 on every mount, so a page saved, closed and reopened minutes later asked
   * for `?v=0` again — the URL the browser had cached an hour for, holding the sheet as it
   * was BEFORE that save. The reader showed the old ink, and worse, the canvas loaded it as
   * its base, drew the next line over it and PUT the flattened result back: the first
   * sitting's strokes gone from the only copy. (The PUT goes to `/sheet/0` with no query,
   * a different cache key, so the browser's own invalidation never reached the stale
   * entry.) A value no earlier mount could have used is what makes a reopen a fetch.
   *
   * See `refresh` for WHEN it moves: after any write that may have changed the record,
   * including one that stopped halfway.
   */
  const [rev, setRev] = useState(() => Date.now());
  /**
   * "The record may not be what `page` and `rev` say." Set when a write begins and cleared
   * when a re-read lands; while it is set, leaving the editor or re-entering it re-reads
   * first. A ref, not state: it is consulted in handlers and must never itself re-render.
   */
  const staleRef = useRef(false);
  /** The page this reader is on, for an async re-read to check it still is. */
  const idRef = useRef(id);

  /** Re-read the list this reader owns. Only when it owns one: given a list, the screen
   *  behind is the authority and reloads it through `onChanged`. */
  const reloadList = useCallback(() => {
    if (given) return;
    fetch("/api/journal")
      .then((r) => r.json())
      .then((d) => !d.error && setFetched(d.pages ?? []))
      .catch(() => {});
  }, [given]);

  useEffect(() => {
    reloadList();
  }, [reloadList]);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  // The full words live only on this endpoint — every list in the app carries a 140-char
  // preview instead. Reset to null first so a slow read shows the page loading rather than
  // the PREVIOUS page's words under the new page's date.
  useEffect(() => {
    let alive = true;
    idRef.current = id;
    staleRef.current = false;
    setPage(null);
    setEditing(false);
    setConfirming(false);
    setError(null);
    fetch(`/api/journal/${id}`)
      .then((r) => r.json())
      .then((d: Loaded & { error?: string }) => {
        if (!alive) return;
        if (d.error) return setError(d.error);
        setPage(d);
      })
      .catch(() => alive && setError("could not open this page"));
    return () => {
      alive = false;
    };
  }, [id]);

  const at = pages.findIndex((p) => p.id === id);
  /** Newest first, so the NEXT entry is the older page and the previous one is newer. */
  const older = at >= 0 ? (pages[at + 1] ?? null) : null;
  const newer = at > 0 ? pages[at - 1] : null;

  // ← and → leaf, because a reader is the one screen in this app where that is what those
  // keys are for. Escape is the dialog's own and is left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || busy) return;
      if (e.key === "ArrowLeft" && older) onId(older.id);
      if (e.key === "ArrowRight" && newer) onId(newer.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, busy, older, newer, onId]);

  /**
   * RE-READ THE PAGE FROM THE RECORD, and move `rev` on so every sheet is fetched anew.
   *
   * Rather than patch the copy in hand: the row is the record, and a screen that shows what
   * it SENT rather than what was stored is a screen that can be wrong and look right. For a
   * drawing the re-read is also where the `sheets` count comes from, and a reader holding
   * the old count draws the scroll a sheet short — or, far worse, hands the editor a base a
   * sheet short (see `saveSheets`).
   *
   * Quiet on failure: `staleRef` stays set, and the next way into or out of the editor
   * tries again. A page that cannot be re-read right now is usually a connection that just
   * dropped, and the sitting's ink must not be lost to a message about that.
   */
  async function refresh() {
    const forId = id;
    try {
      const fresh = await fetch(`/api/journal/${forId}`).then((r) => r.json());
      // Leafed away while this was in flight: the answer belongs to a page no longer open.
      if (fresh.error || idRef.current !== forId) return;
      setPage(fresh);
      setRev(Date.now());
      staleRef.current = false;
    } catch {
      // Still stale; said by the flag, not by a message.
    }
  }

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    staleRef.current = true;
    try {
      const res = await fetch(`/api/journal/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "could not save");
      await refresh();
      setEditing(false);
      reloadList();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save");
    } finally {
      setBusy(false);
    }
  }

  /**
   * ADDING TO A HANDWRITTEN PAGE: the sheets the canvas hands over, PUT one by one.
   *
   * `saveDrawing` owns the sequence (see journalSave.ts); this is the reader's half of the
   * bargain — what to do when the sequence finishes, and what to do when it stops.
   *
   * ON FAILURE THE ERROR IS RETHROWN, AND NOT SHOWN HERE. The canvas marks sheets as saved
   * only when this promise resolves, so a rejection is what keeps its ink dirty and its
   * sheets unsaved — the next Save re-sends exactly what did not land. Swallowing the error
   * would tell the canvas the page was on the record when part of it was not. The canvas
   * also SHOWS the rejection, beside its Save button; setting `error` here as well put the
   * same sentence at the top and the bottom of one dialog, announced twice. `patch` keeps
   * its own message because the typed page has no line of its own.
   *
   * A SAVE THAT STOPPED HALFWAY HAS STILL CHANGED THE RECORD. The sequence is sheet by
   * sheet, so sheets 0 and 1 can be on the record when sheet 2 is refused, and this reader
   * would go on holding the old count and the old `rev`. Retrying in place is fine — the
   * canvas re-PUTs everything dirty, and re-writing a landed sheet is the same sheet again
   * — but CLOSING was not: the reading branch drew the old count with the cached old
   * bytes, and "Add to it" handed the editor that same short, stale base. The editor then
   * grew a BLANK sheet where the record already held an inked one, or drew the next line
   * over a sheet 0 missing the strokes the last save had landed, and the next Save flattened
   * that over the row: handwriting the record already had, gone without a word. So a write
   * marks the reader stale (`staleRef`), and leaving or re-entering the editor re-reads and
   * moves `rev` first. Deliberately NOT mid-sitting: the reload is deferred to the moment
   * the editor is left rather than done in this catch, because a re-read on the spot needs
   * the connection that most likely just dropped, and a `rev` moved while the sheets cannot
   * be fetched would wall the canvas ("could not be loaded") over ink that a retry a minute
   * later would have saved.
   */
  async function saveSheets(sheets: SheetImage[]) {
    if (!page) return;
    setBusy(true);
    setError(null);
    staleRef.current = true;
    try {
      await saveDrawing({ id, date: page.date }, sheets, fetchSender);
      await refresh();
      setEditing(false);
      reloadList();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  /** Into and out of the editor, re-reading first wherever a write may have left the
   *  reader behind the record — see `saveSheets`. */
  async function openEditor() {
    if (staleRef.current) {
      setBusy(true);
      await refresh();
      setBusy(false);
    }
    setEditing(true);
  }

  function closeEditor() {
    if (busy) return;
    setEditing(false);
    if (staleRef.current) void refresh();
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/journal/${id}`, { method: "DELETE" }).catch(() => {});
    setBusy(false);
    setConfirming(false);
    // Both, and in this order: the list this reader leafs through must lose the row too,
    // or "older" would walk straight into a page that is no longer there.
    reloadList();
    onChanged();
    // Land on the page next to the one just removed rather than dropping the reader — you
    // are usually somewhere in a run of pages, and closing back to the list to reopen the
    // one beside it is a round trip for nothing.
    const to = older ?? newer;
    if (to) onId(to.id);
    else onClose();
  }

  const isText = page?.kind === "text";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      className={`w-[min(94vw,46rem)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 text-[var(--color-ink)] sm:p-5 ${
        editing ? "h-[92dvh]" : "max-h-[92dvh] overflow-y-auto"
      }`}
    >
      {editing && page ? (
        // The editor and, above it, anywhere a failed save has to be able to speak.
        // `error` used to be rendered only in the reading branch, so a rejected PATCH set a
        // message into a state this branch could not draw: Save re-enabled itself, the
        // status line went back to "Ready to save.", and nothing on screen said the write
        // had been refused. A write that fails silently is worse than one that fails.
        // The TYPED page's line only: a refused sheet is reported by the canvas itself,
        // beside its Save button, and `saveSheets` leaves `error` alone (see there).
        <div className="flex h-full min-h-0 flex-col">
          {error && (
            <p role="alert" className="mb-2 shrink-0 text-small font-semibold">
              {error}
            </p>
          )}
          <div className="min-h-0 flex-1">
            {isText ? (
              <JournalText
                editing
                initial={page.body ?? ""}
                onSave={(body) => patch({ body })}
                onCancel={closeEditor}
                busy={busy}
              />
            ) : (
              // The whole scroll goes under the pen: every sheet the record holds, with
              // `rev` so a page saved a moment ago is fetched rather than remembered.
              <JournalCanvas
                base={{ id, sheets: page.sheets, rev }}
                onSave={saveSheets}
                onCancel={closeEditor}
                busy={busy}
              />
            )}
          </div>
        </div>
      ) : (
        <>
          {/* The date IS the title. Out of the day's context it is the only thing that tells
              two Tuesdays apart, and a journal page has no other name. */}
          <div className="section-head">
            <h2 className="min-w-0 font-serif text-body">
              {page ? longDay(page.date) : "…"}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-ink)]"
            >
              ×
            </button>
          </div>

          {/* THE CHROME, all of it, ABOVE the page.
              A page is a page — eighteen lines of A4 is taller than any dialog, so anything
              put under it is under a scroll. Leafing and editing are how you use this
              screen, not what you do after finishing it, so they sit where they can always
              be reached and the sheet below is left as one uninterrupted thing.

              Three groups on one line: what the page IS, how to leave it, what to do to it.
              The way back to the day is what makes the archive part of the app rather than
              a folder beside it — a page you are reading is usually a day you want to open. */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-micro text-[var(--color-muted)]">
              <span>{page ? (isText ? "typed" : "handwritten") : ""}</span>
              {page && (
                <a
                  href={`/?date=${page.date}`}
                  className="underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                >
                  open that day →
                </a>
              )}
            </p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* LEAFING BY DATE, and the words say so. `pages` runs newest first, so
                  "older" walks down it — a pair of bare arrows would have made the
                  direction something you learn by pressing one. */}
              <button
                onClick={() => older && onId(older.id)}
                disabled={!older || busy}
                className="rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-micro transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
              >
                ‹ older
              </button>
              <button
                onClick={() => newer && onId(newer.id)}
                disabled={!newer || busy}
                className="rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-micro transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
              >
                newer ›
              </button>
              {/* Padded to the height of the pills beside it. It stays a quiet word rather
                  than a button — it is the one destructive thing here — but a 16px target
                  12px from "newer ›" is one a thumb opens by accident. */}
              <button
                onClick={() => setConfirming(true)}
                disabled={!page || busy}
                aria-expanded={confirming}
                className="rounded-lg px-2 py-1.5 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
              >
                Delete
              </button>
              <button
                onClick={openEditor}
                disabled={!page || busy}
                className="rounded-lg bg-[var(--color-accent)] px-3.5 py-1.5 text-micro text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {/* Never guessed. Until the page has arrived nobody knows whether it is
                    words or ink, and "Add to it" over a typed page would be the reader
                    telling you what you wrote before it had read it. */}
                {page && !isText ? "Add to it" : "Edit"}
              </button>
            </div>
          </div>

          {/* The second step, in a row of its own. Never a native confirm(): in a standalone
              PWA that is a system sheet dropped on the app. */}
          {confirming && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-3">
              <p className="min-w-0 flex-1 text-small leading-snug">
                Delete this page? It can&apos;t be undone.
              </p>
              <button
                onClick={remove}
                disabled={busy}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-lg px-2 py-1.5 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
              >
                Keep
              </button>
            </div>
          )}

          {/* Ink at weight 600, not the accent: the accent measures 4.02:1 as text on this
              paper and fails the body floor. There is no red in this system, so an error
              stands out by weight — the same treatment the login screen uses. */}
          {error && (
            <p role="alert" className="mt-3 text-small font-semibold">
              {error}
            </p>
          )}

          <div className="mt-4 flex justify-center">
            {page && isText && (
              <Sheet
                a4={false}
                className="w-full max-w-[34rem] rounded-xl border border-[var(--color-line)]"
              >
                <div className="sheet-text sheet-page">{page.body}</div>
              </Sheet>
            )}
            {page && !isText && (
              // The whole scroll, every sheet of it, at the page's full width and never
              // cropped: a thumbnail may cover, a reader may not. JournalDrawing is the one
              // place that knows a page is several images, so this and the record's spread
              // cannot draw a scroll two different ways.
              <JournalDrawing
                id={id}
                sheets={page.sheets}
                rev={rev}
                alt={`Handwritten page from ${page.date}`}
                className="w-full max-w-[34rem] rounded-xl border border-[var(--color-line)]"
              />
            )}
            {!page && !error && (
              <p className="py-16 text-small text-[var(--color-muted)]">
                Opening…
              </p>
            )}
          </div>

        </>
      )}
    </dialog>
  );
}
