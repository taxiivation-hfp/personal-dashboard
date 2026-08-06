"use client";

import { useState } from "react";
import Link from "next/link";
import Ring from "./PillarRing";
import { PILLAR_PALETTE, PILLAR_DEFAULT_VAR } from "@/lib/rings";
import type { PillarView, PillarKey } from "@/lib/queries";

/**
 * Pillar hues only.
 *
 * A curated palette rather than a hex picker, on purpose: every value here is checked
 * against the beige page, so no choice can make the app unreadable. The amber accent, the
 * ink, the surfaces and the three block states are NOT offered — one accent is what keeps
 * the page quiet, and the block states deliberately avoid a severity ramp.
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
        <h1 className="text-[28px] font-semibold tracking-tight">Colours</h1>
        <Link
          href="/"
          className="text-[14px] text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
        >
          ← Today
        </Link>
      </header>

      <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--color-muted)]">
        Pick a hue for each pillar. It colours that pillar&apos;s rings, goals and skills.
        The accent, the ink and the three block states stay as they are — one accent is
        what keeps the page quiet.
      </p>

      <div className="mt-10 flex flex-col gap-8">
        {pillars.map((p) => (
          <section key={p.key}>
            <div className="flex items-center gap-3">
              <Ring fill={0.68} size={36} stroke={3.5} tone={p.key as PillarKey} color={p.color} />
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold">{p.name}</h2>
                <p className="text-[12px] text-[var(--color-muted)]">
                  {p.color
                    ? PILLAR_PALETTE.find((x) => x.hex === p.color)?.name ?? p.color
                    : "Default"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => set(p.key, null)}
                disabled={busy}
                aria-pressed={p.color == null}
                aria-label="Default colour"
                className="h-7 w-7 rounded-full border-2 transition-transform disabled:opacity-40"
                style={{
                  background: PILLAR_DEFAULT_VAR[p.key as PillarKey],
                  borderColor: p.color == null ? "var(--color-ink)" : "transparent",
                }}
              />
              <span aria-hidden className="mx-1 h-5 w-px bg-[var(--color-line)]" />
              {PILLAR_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => set(p.key, c.hex)}
                  disabled={busy}
                  aria-pressed={p.color === c.hex}
                  aria-label={c.name}
                  title={c.name}
                  className="h-7 w-7 rounded-full border-2 transition-transform disabled:opacity-40"
                  style={{
                    background: c.hex,
                    borderColor: p.color === c.hex ? "var(--color-ink)" : "transparent",
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
