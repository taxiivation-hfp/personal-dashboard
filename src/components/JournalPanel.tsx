"use client";

import { useEffect, useRef, useState } from "react";
import JournalCanvas from "./JournalCanvas";
import JournalReader from "./JournalReader";
import JournalText from "./JournalText";
import Sheet from "./Sheet";
import type { JournalView } from "@/lib/queries";

/**
 * THE WAY IN, and nothing else visible.
 *
 * The Journal row of the day's checklist raises this: the journal is written, not ticked,
 * so its row asks which kind of page rather than toggling a box. The shelf of pages that
 * used to hang at the foot of Today is gone to /journal, kept by month — the same
 * acting/looking split /stats draws.
 *
 * A page is saved as handwriting or as words, and left as whatever it was — no transcription
 * in either direction. `kind` is the discriminator throughout: a text entry stores image='',
 * so testing for an empty image would work by accident today and break the moment anything
 * else writes a blank.
 *
 * WHAT IS NEW HERE IS THE DAY'S OWN PAGES. Writing a second page was the only thing this
 * chooser could do; the pages already written were listed nowhere it could reach, so the way
 * to reread tonight's page was to leave for the archive and find the date. They sit on the
 * chooser now, as pages, and tapping one opens it to read or to change.
 */
type Mode = null | "draw" | "type";

export default function JournalPanel({
  date,
  entries,
  onChanged,
  /** Is this the real today? Only the words: a page written on a day you stepped back to
   *  is still that day's page, and calling it "tonight's" would be the app telling you
   *  what day it is and getting it wrong. */
  live = true,
  prompt = false,
  onPromptHandled,
}: {
  date: string;
  entries: JournalView[];
  onChanged: () => void;
  live?: boolean;
  /** Raised by the Journal row in the day's checklist. */
  prompt?: boolean;
  onPromptHandled?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which page is open in the reader, by id. */
  const [reading, setReading] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const chooserRef = useRef<HTMLDialogElement>(null);

  // The chooser stands down the moment a kind is picked, or a page is opened — the page
  // itself is the next thing on screen, and two stacked modals would be one too many.
  useEffect(() => {
    const d = chooserRef.current;
    if (!d) return;
    const busyElsewhere = Boolean(mode) || reading != null;
    if (prompt && !busyElsewhere && !d.open) d.showModal();
    if ((!prompt || busyElsewhere) && d.open) d.close();
  }, [prompt, mode, reading]);

  const choose = (m: Mode) => {
    onPromptHandled?.();
    setMode(m);
  };

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (mode && !d.open) d.showModal();
    if (!mode && d.open) d.close();
  }, [mode]);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, ...payload }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "could not save");
      setMode(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save");
    } finally {
      setBusy(false);
    }
  }

  const written = entries.length > 0;

  return (
    <>
      {/* The chooser, raised from the day's checklist. Two equally-weighted options: a
          handwritten page and a typed one are the same artefact here, and giving either a
          filled button would quietly nominate one as the proper way to keep a journal. */}
      <dialog
        ref={chooserRef}
        onClose={() => onPromptHandled?.()}
        className="w-[min(92vw,24rem)] rounded-2xl bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
      >
        <p className="font-serif text-body">
          {live ? "Tonight's page" : "That day's page"}
        </p>
        <p className="mt-1 text-micro text-[var(--color-muted)]">
          {written
            ? "What is already on this day, and room for another."
            : "Both land on the same sheet. Nothing reads it back."}
        </p>

        {/* THE DAY'S PAGES, as pages. Small ruled sheets rather than a list of links: a
            journal page is an object, and the one thing that tells two of them apart at
            this size is what is on the paper. */}
        {written && (
          <ul className="mt-4 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
            {entries.map((e) => (
              <li key={e.id}>
                {/* A ROW, not a bare tile — the same shape the archive uses, and for the
                    same reason. A page in miniature is the page's likeness, not its name:
                    at 72px the ruled preview is a grey texture, so two typed pages written
                    on one Tuesday would have been two identical smudges and the only thing
                    telling them apart would have been an aria-label nobody sees. The
                    opening line beside the sheet is what makes the choice a choice. */}
                <button
                  onClick={() => {
                    onPromptHandled?.();
                    setReading(e.id);
                  }}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--color-bg)]"
                >
                  {e.kind === "text" ? (
                    <Sheet className="w-[2.75rem] shrink-0 rounded border border-[var(--color-line)]">
                      <div className="sheet-text">{e.preview || "…"}</div>
                    </Sheet>
                  ) : (
                    <Sheet
                      rules={false}
                      className="w-[2.75rem] shrink-0 rounded border border-[var(--color-line)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/journal/${e.id}/image`}
                        alt=""
                        className="h-full w-full object-cover object-top"
                      />
                    </Sheet>
                  )}
                  <span className="min-w-0 flex-1">
                    {e.kind === "text" ? (
                      <span className="line-clamp-2 block font-serif text-small text-[var(--color-ink)]">
                        {e.preview || "…"}
                      </span>
                    ) : (
                      <span className="block text-small text-[var(--color-muted)]">
                        handwritten
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => choose("draw")}
            className="rounded-full border border-[var(--color-line-strong)] px-3.5 py-1.5 text-small transition-colors hover:bg-[var(--color-bg)]"
          >
            {written ? "Write another" : "Write it"}
          </button>
          <button
            onClick={() => choose("type")}
            className="rounded-full border border-[var(--color-line-strong)] px-3.5 py-1.5 text-small transition-colors hover:bg-[var(--color-bg)]"
          >
            {written ? "Type another" : "Type it"}
          </button>
          <button
            onClick={() => onPromptHandled?.()}
            className="ml-auto text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            not now
          </button>
        </div>

        {/* The way back through the written ones — the archive lives at /journal, by
            month. An <a>, not the router: the dialog must close, and a full navigation is
            the cheapest correct way to guarantee it does. */}
        <a
          href="/journal"
          className="mt-4 inline-flex items-center gap-1.5 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
        >
          past pages, by month
          <span aria-hidden>→</span>
        </a>
      </dialog>

      {/* Ink at weight 600, not the accent. The accent is certified at 4.7:1 with WHITE ON
          TOP — as a fill. As text on the beige page it measures 4.02:1 and fails the body
          floor, and it also made error-ness ride on hue alone. Same treatment as the login
          screen: there is no red in this system, so an error stands out by weight. */}
      {error && (
        <p role="alert" className="mt-3 text-small font-semibold">
          {error}
        </p>
      )}

      {/* One of the few surfaces still allowed a panel: a modal really does leave the page
          plane, so the lift is true rather than decoration. */}
      <dialog
        ref={dialogRef}
        onClose={() => setMode(null)}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        className="h-[92dvh] w-[min(94vw,900px)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 text-[var(--color-ink)]"
      >
        {mode === "draw" && (
          <JournalCanvas
            live={live}
            onSave={(image, width, height) =>
              post({ kind: "drawing", image, width, height })
            }
            onCancel={() => !busy && setMode(null)}
            busy={busy}
          />
        )}
        {mode === "type" && (
          <JournalText
            live={live}
            onSave={(body) => post({ kind: "text", body })}
            onCancel={() => !busy && setMode(null)}
            busy={busy}
          />
        )}
      </dialog>

      {/* Reading one of the day's pages, and changing it. The reader fetches the archive
          for itself, so leafing off this day's pages reaches the whole journal rather than
          stopping at midnight. */}
      {reading != null && (
        <JournalReader
          id={reading}
          onId={setReading}
          onChanged={onChanged}
          onClose={() => setReading(null)}
        />
      )}
    </>
  );
}
