"use client";

import { useState } from "react";
import Link from "next/link";
import Ring from "./PillarRing";
import { PILLAR_PALETTE, PILLAR_DEFAULT_VAR } from "@/lib/rings";
import type { PillarView } from "@/lib/queries";

/**
 * THE TWO PILLAR HUES — Health and Career. Nothing else is editable here.
 *
 * A curated palette rather than a hex picker, on purpose: every value is checked against
 * the beige page, so no choice can make the app unreadable, and `engine.setPillarColor`
 * refuses anything outside it. The amber accent, the ink, the surfaces and the three block
 * states are NOT offered — one accent is what keeps the page quiet, and the block states
 * deliberately avoid a severity ramp.
 *
 * The SKILLS section is gone (spec §1): skills are hidden, and a hidden thing must not sit
 * on a settings screen as a row of swatches for something you cannot see. Every stored
 * skill colour is kept, and `skillColours` is still in queries.ts.
 *
 * Social is not listed either — `getPillars` filters its row out, and the row itself stays
 * in the database because goals, habits and tasks reference it.
 */
export default function ColourEditor({ initial }: { initial: PillarView[] }) {
  const [pillars, setPillars] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function set(key: string, color: string | null) {
    setBusy(true);
    try {
      const r = await fetch("/api/pillars", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, color }),
      })
        .then((x) => x.json())
        .catch(() => ({ error: true }));
      if (!r.error && r.pillars) setPillars(r.pillars);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[46rem] px-6 pb-24 pt-12 sm:px-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-heading font-serif font-semibold">Colours</h1>
        <Link
          href="/"
          aria-label="Close"

          className="shrink-0 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"

          >

            ×

          </Link>
      </header>

      {/* The intro paragraph is GONE — TEXT IS DATA, and it named skills, which are
          hidden. The swatches ARE the interface: a row per pillar, its chosen hue named at
          the end of its rule, and a sample ring under it. What the palette refuses and why
          it is curated lives in rings.ts and engine.setPillarColor. */}

      <div className="mt-10 flex flex-col gap-10">
        {pillars.map((p) => (
          <section key={p.key}>
            {/* The pillar name sits on its rule and the chosen hue's NAME sits at the end of
                it — the same shape a settings row takes, and the reason no meaning here
                rides on hue alone. Someone who cannot separate Moss from Olive still reads
                which one is set. */}
            <div className="section-head">
              <h2 className="text-small font-semibold">{p.name}</h2>
              <span className="text-micro text-[var(--color-muted)]">
                {p.color
                  ? (PILLAR_PALETTE.find((x) => x.hex === p.color)?.name ??
                    p.color)
                  : "Default"}
              </span>
            </div>

            {/* The sample ring hangs below the rule at the section's left edge, exactly as a
                real pillar ring does on Today — the preview is worth nothing if it is not
                the thing it previews. */}
            <div className="mt-4">
              <Ring
                fill={0.68}
                size={36}
                stroke={3.5}
                tone={p.key}
                color={p.color}
              />
            </div>

            {/* A curated row, not a picker. Selection is carried by the ink rim — form, not
                hue — and by aria-pressed; the hairline divider keeps the default apart from
                the eight so "no colour chosen" never reads as a ninth colour. */}
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => set(p.key, null)}
                disabled={busy}
                aria-pressed={p.color == null}
                aria-label="Default colour"
                className="h-7 w-7 rounded-full border-2 transition-colors disabled:opacity-40"
                style={{
                  background: PILLAR_DEFAULT_VAR[p.key],
                  borderColor:
                    p.color == null ? "var(--color-ink)" : "transparent",
                }}
              />
              <span
                aria-hidden
                className="mx-0.5 h-5 w-px bg-[var(--color-line)]"
              />
              {PILLAR_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => set(p.key, c.hex)}
                  disabled={busy}
                  aria-pressed={p.color === c.hex}
                  aria-label={c.name}
                  title={c.name}
                  className="h-7 w-7 rounded-full border-2 transition-colors disabled:opacity-40"
                  style={{
                    background: c.hex,
                    borderColor:
                      p.color === c.hex ? "var(--color-ink)" : "transparent",
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
