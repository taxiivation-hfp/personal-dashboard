"use client";

import { useState } from "react";
import Link from "next/link";
import Ring from "./PillarRing";
import {
  PILLAR_PALETTE,
  PILLAR_DEFAULT_VAR,
  skillDefaultHex,
} from "@/lib/rings";
import type { PillarView, PillarKey } from "@/lib/queries";

/** One skill's row here: who it is and which hue its Portfolio segment wears. */
type SkillColour = {
  id: number;
  name: string;
  state: string;
  color: string | null;
};

/**
 * Pillar hues, and now each SKILL's hue — the Portfolio ring is segmented per skill, so
 * every skill owns a slice that needs telling apart.
 *
 * A curated palette rather than a hex picker, on purpose: every value here is checked
 * against the beige page, so no choice can make the app unreadable. The amber accent, the
 * ink, the surfaces and the three block states are NOT offered — one accent is what keeps
 * the page quiet, and the block states deliberately avoid a severity ramp.
 */
export default function ColourEditor({
  initial,
  skills: initialSkills,
}: {
  initial: PillarView[];
  skills: SkillColour[];
}) {
  const [pillars, setPillars] = useState(initial);
  const [skills, setSkills] = useState(initialSkills);
  const [busy, setBusy] = useState(false);

  /** A skill's segment hue. Optimistic — the palette guard lives in the engine, and a
   *  refused write comes back on the next load; a settings screen does not need a
   *  round-trip spinner per swatch. */
  async function setSkill(id: number, color: string | null) {
    setSkills((s) => s.map((x) => (x.id === id ? { ...x, color } : x)));
    await fetch(`/api/skills/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ color }),
    }).catch(() => {});
  }

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

      <p className="mt-3 max-w-[60ch] text-body leading-relaxed text-[var(--color-muted)]">
        Pick a hue for each pillar. It colours that pillar&apos;s rings, goals
        and skills. The accent, the ink and the three block states stay as they
        are — one accent is what keeps the page quiet.
      </p>

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
                tone={p.key as PillarKey}
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
                  background: PILLAR_DEFAULT_VAR[p.key as PillarKey],
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

        {/* THE SKILLS, each owning a slice of the Portfolio ring. The default is not "no
            colour" here — every slice must be told apart from its neighbours, so unset
            means the stable palette-cycled hue, shown as the leftmost swatch. */}
        {skills.length > 0 && (
          <section>
            <div className="section-head">
              <h2 className="text-small font-semibold">Skills</h2>
              <span className="text-micro text-[var(--color-muted)]">
                each one&apos;s slice of the Portfolio ring
              </span>
            </div>
            <ul className="mt-1 divide-y divide-[var(--color-line)]">
              {skills.map((s) => {
                const fallback = skillDefaultHex(s.id);
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: s.color ?? fallback }}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate font-serif text-small ${
                        s.state === "parked" ? "text-[var(--color-muted)]" : ""
                      }`}
                    >
                      {s.name}
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        onClick={() => setSkill(s.id, null)}
                        disabled={busy}
                        aria-pressed={s.color == null}
                        aria-label="Default colour"
                        title="Default"
                        className="h-6 w-6 rounded-full border-2 transition-colors disabled:opacity-40"
                        style={{
                          background: fallback,
                          borderColor:
                            s.color == null ? "var(--color-ink)" : "transparent",
                        }}
                      />
                      <span
                        aria-hidden
                        className="mx-0.5 h-4 w-px bg-[var(--color-line)]"
                      />
                      {PILLAR_PALETTE.map((c) => (
                        <button
                          key={c.hex}
                          onClick={() => setSkill(s.id, c.hex)}
                          disabled={busy}
                          aria-pressed={s.color === c.hex}
                          aria-label={c.name}
                          title={c.name}
                          className="h-6 w-6 rounded-full border-2 transition-colors disabled:opacity-40"
                          style={{
                            background: c.hex,
                            borderColor:
                              s.color === c.hex
                                ? "var(--color-ink)"
                                : "transparent",
                          }}
                        />
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
