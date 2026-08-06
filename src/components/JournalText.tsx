"use client";

import { useState } from "react";

/**
 * A typed page, on the same ruled A4 sheet as the handwritten one.
 *
 * Typing and handwriting must produce ONE artefact, not two features — so this borrows
 * the canvas's geometry exactly: 34px line gap, 56px margin rule, the same paper colour.
 * A journal that looks like two different products is a journal you stop trusting.
 *
 * No transcription anywhere. A drawing stays a drawing and text stays text.
 */

const LINE_GAP = 34;
const MARGIN_X = 56;
const PAPER = "#fdfbf6";

export default function JournalText({
  onSave,
  onCancel,
  busy,
}: {
  onSave: (body: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [body, setBody] = useState("");
  const hasWords = body.trim().length > 0;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-wide">Tonight&apos;s page</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Typed, on the same page. Saved as words — nothing reads it back or summarises it.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          className="relative max-h-full max-w-full overflow-hidden rounded-2xl border border-[var(--color-line)]"
          style={{ aspectRatio: "1 / 1.4142", height: "100%", background: PAPER }}
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={busy}
            aria-label="Today's page"
            spellCheck
            className="absolute inset-0 h-full w-full resize-none bg-transparent outline-none disabled:opacity-60"
            style={{
              // The ruled sheet, drawn behind the text and aligned to it: a repeating
              // gradient for the lines, one hard stop for the margin rule.
              backgroundImage: `repeating-linear-gradient(
                 to bottom,
                 transparent 0px,
                 transparent ${LINE_GAP - 1}px,
                 var(--color-line) ${LINE_GAP - 1}px,
                 var(--color-line) ${LINE_GAP}px
               )`,
              backgroundPosition: `0 ${LINE_GAP / 2}px`,
              paddingLeft: MARGIN_X + 8,
              paddingRight: 24,
              paddingTop: LINE_GAP / 2,
              lineHeight: `${LINE_GAP}px`,
              fontSize: 15,
              color: "var(--color-ink)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0"
            style={{ left: MARGIN_X, width: 1, background: "var(--color-line-strong)" }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--color-muted)]">
          {busy ? "Saving…" : hasWords ? "Ready to save." : "Empty page."}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => hasWords && onSave(body)}
            disabled={!hasWords || busy}
            className="rounded-xl bg-[var(--color-accent)] px-4 py-1.5 text-xs text-white transition-opacity disabled:opacity-40"
          >
            Save page
          </button>
        </div>
      </div>
    </div>
  );
}
