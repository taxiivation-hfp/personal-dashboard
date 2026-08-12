"use client";

import { useState } from "react";
import Sheet from "./Sheet";

/**
 * A typed page — written, or reopened and rewritten.
 *
 * Typing and handwriting must produce ONE artefact, not two features, so this takes the
 * same `Sheet` the canvas and the shelf take: the same eighteen rules, the same margin,
 * the same paper. The geometry used to be copied by hand between the two surfaces as a
 * pair of constants, which is the arrangement that eventually disagrees.
 *
 * EDITING IS THE SAME SURFACE. A page reopens with its words in it and the button says
 * Save instead of Save page — a second screen for correcting a sentence would be a second
 * place the journal lives. No transcription anywhere, in either direction, either way: a
 * drawing stays a drawing and words stay words.
 */
export default function JournalText({
  /** The page's existing words, when one is being reopened. Empty for a new page. */
  initial = "",
  editing = false,
  /** Is the page being written for the real today? Only the title — a page written on a
   *  day you stepped back to is that day's page, and calling it tonight's would be the
   *  app telling you what day it is and getting it wrong. */
  live = true,
  onSave,
  onCancel,
  busy,
}: {
  initial?: string;
  editing?: boolean;
  live?: boolean;
  onSave: (body: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [body, setBody] = useState(initial);
  const hasWords = body.trim().length > 0;
  const changed = body !== initial;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* The same chrome as the drawing surface, down to the rule under the title: two ways
          in to one artefact must not look like two products. */}
      <div className="min-w-0">
        <div className="section-head">
          <h2 className="text-small font-semibold">
            {editing ? "This page" : live ? "Tonight's page" : "That day's page"}
          </h2>
        </div>
        <p className="mt-2 text-micro text-[var(--color-muted)]">
          {editing
            ? "Your words, as you left them. Rewriting one is normal — nothing keeps a record of what it said before."
            : "Typed, on the same page. Saved as words — nothing reads it back or summarises it."}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        {/* No rules LAYER here: the textarea paints its own so they scroll with the words
            it holds. See `textarea.sheet-text` — a layer pinned behind a scrolling textarea
            would leave every line past the seventeenth sitting off its rule. */}
        <Sheet
          rules={false}
          className="max-h-full max-w-full rounded-2xl border border-[var(--color-line)]"
          style={{ height: "100%" }}
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={busy}
            // Named for the day it is actually about. It said "Today's page" whatever day
            // the screen was on — the visible heading knew better, and the two must agree.
            aria-label={
              editing ? "This page" : live ? "Today's page" : "That day's page"
            }
            spellCheck
            className="sheet-text disabled:opacity-60"
          />
        </Sheet>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-micro text-[var(--color-muted)]">
          {busy
            ? "Saving…"
            : !hasWords
              ? "Empty page."
              : editing && !changed
                ? "Unchanged."
                : "Ready to save."}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-[var(--color-line-strong)] px-3.5 py-1.5 text-small transition-colors hover:bg-[var(--color-panel-2)] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => hasWords && onSave(body)}
            disabled={!hasWords || busy || (editing && !changed)}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {editing ? "Save" : "Save page"}
          </button>
        </div>
      </div>
    </div>
  );
}
