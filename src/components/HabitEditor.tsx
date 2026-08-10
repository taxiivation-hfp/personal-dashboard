"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { addDays, todayISO } from "@/lib/dates";
import type { HabitView, PillarKey } from "@/lib/queries";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"]; // bit0=Mon … bit6=Sun
const ALL = 127;

/** The categories tomorrow's rows may be re-filed under. "None" keeps the accent tick. */
const PILLAR_CHOICES: { key: PillarKey | ""; label: string }[] = [
  { key: "", label: "None" },
  { key: "social_capital", label: "Social" },
  { key: "physical", label: "Physical" },
  { key: "portfolio", label: "Portfolio" },
];

/** One row of tomorrow's checklist, as /api/habits/override reads it: the default, and
 *  whatever the owner has dressed it as for that one day. */
type TomorrowHabit = {
  id: number;
  name: string;
  pillar: PillarKey | null;
  input: "check" | "number";
  override: { name: string | null; pillar: PillarKey | null } | null;
};

export default function HabitEditor({ initial }: { initial: HabitView[] }) {
  const [habits, setHabits] = useState(initial);
  const [name, setName] = useState("");
  /** Tomorrow's list with its overrides. null until the fetch lands. */
  const [tomorrow, setTomorrow] = useState<TomorrowHabit[] | null>(null);
  const tomorrowDate = addDays(todayISO(), 1);

  const loadTomorrow = () => {
    fetch(`/api/habits/override?date=${tomorrowDate}`)
      .then((r) => r.json())
      .then((d) => !d.error && setTomorrow(d.habits ?? []))
      .catch(() => setTomorrow([]));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadTomorrow, [tomorrowDate]);

  /** Write one habit's dressing for tomorrow. Name and pillar travel together — the
   *  upsert replaces the whole override, so the current value of BOTH is always sent. */
  async function override(
    h: TomorrowHabit,
    patch: { name?: string | null; pillar?: PillarKey | "" | null },
  ) {
    const nextName =
      patch.name !== undefined ? patch.name : (h.override?.name ?? null);
    const nextPillar =
      patch.pillar !== undefined
        ? patch.pillar || null
        : (h.override?.pillar ?? null);
    await fetch("/api/habits/override", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: tomorrowDate,
        habit_id: h.id,
        // A value equal to the default is not an override — sending null keeps the row
        // honest, so "reset" never prints beside a day that is just the default. (One
        // consequence: a habit whose default HAS a pillar cannot be overridden to none
        // for a day — the override table reads null as "no opinion", and a fourth state
        // to say "explicitly nothing" is not worth a column until it is ever wanted.)
        name: nextName && nextName !== h.name ? nextName : null,
        pillar: nextPillar && nextPillar !== h.pillar ? nextPillar : null,
      }),
    }).catch(() => {});
    loadTomorrow();
  }

  async function resetOverride(h: TomorrowHabit) {
    await fetch(
      `/api/habits/override?date=${tomorrowDate}&habit_id=${h.id}`,
      { method: "DELETE" },
    ).catch(() => {});
    loadTomorrow();
  }

  async function reload() {
    const d = await fetch("/api/habits").then((r) => r.json());
    if (!d.error) setHabits(d.habits ?? []);
  }

  async function add() {
    const n = name.trim();
    if (!n) return;
    setName("");
    await fetch("/api/habits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: n, days_mask: ALL }),
    });
    reload();
  }

  async function patch(body: Record<string, unknown>) {
    await fetch("/api/habits", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    reload();
  }

  function toggleDay(h: HabitView, i: number) {
    const bit = 1 << i;
    const next = h.days_mask & bit ? h.days_mask & ~bit : h.days_mask | bit;
    // Zero days would make it invisible everywhere with no way back from Today.
    patch({ id: h.id, days_mask: next === 0 ? h.days_mask : next });
  }

  return (
    <main className="mx-auto w-full max-w-[46rem] px-6 pb-24 pt-12 sm:px-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-heading font-serif font-semibold">
          Non-negotiables
        </h1>
        <Link
          href="/"
          aria-label="Close"

          className="shrink-0 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"

          >

            ×

          </Link>
      </header>

      <p className="mt-3 max-w-[60ch] text-body leading-relaxed text-[var(--color-muted)]">
        Small, binary, and separate from your blocks. No states and no reasons
        here — that&apos;s the point of the contrast. Pick which days each one
        applies to.
      </p>

      {/* A ruled list, not a stack of cards. The whole promise of this screen is that these
          are small plain things; a rounded panel around each one dressed a checklist up as a
          dashboard and made four items look like four features. */}
      <ul className="mt-8 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
        {habits.map((h) => (
          <li key={h.id} className="py-4">
            <div className="flex items-center justify-between gap-3">
              {/* The owner named it, so the field keeps the serif. The rule under it appears
                  on focus only — a resting underline on every row would read as a form to be
                  filled in rather than a list to be glanced at. */}
              <input
                defaultValue={h.name}
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== h.name &&
                  patch({ id: h.id, name: e.target.value })
                }
                className="min-w-0 flex-1 border-b border-transparent bg-transparent pb-0.5 font-serif text-body outline-none transition-colors focus:border-[var(--color-accent)]"
                aria-label={`Rename ${h.name}`}
              />
              <button
                onClick={() => patch({ id: h.id, remove: true })}
                className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
              >
                remove
              </button>
            </div>
            {/* Filled vs outlined, not dark vs pale: an off day has to look deliberately
                empty rather than switched off or unavailable, since most items legitimately
                run on a few days. Shape carries the state; the accent only confirms it. */}
            <div className="mt-3 flex gap-1.5">
              {DAYS.map((d, i) => {
                const on = Boolean(h.days_mask & (1 << i));
                return (
                  <button
                    key={i}
                    onClick={() => toggleDay(h, i)}
                    aria-label={`${d} ${on ? "on" : "off"}`}
                    aria-pressed={on}
                    className={`h-7 w-7 rounded-full border text-micro transition-colors ${
                      on
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                        : "border-[var(--color-line-strong)] text-[var(--color-muted)]"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex items-end gap-4">
        {/* Written on a line rather than into a box: what goes in here is the owner's own
            wording, and a bordered field asks for data where the page is asking for a
            sentence. Serif for the same reason. */}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a non-negotiable…"
          className="min-w-0 flex-1 border-b border-[var(--color-line-strong)] bg-transparent pb-1.5 font-serif text-body outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
        />
        <button
          onClick={add}
          disabled={!name.trim()}
          className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {/* TOMORROW, SPECIFICALLY. The defaults above stay the every-day truth; this dresses
          single rows differently for ONE day — a different wording, a different pillar —
          and the day after, everything is back to the default with nothing to undo. It is
          the planning move the day-title makes, extended to the checklist: tomorrow is the
          day you can still shape, so tomorrow is the one day this screen lets you shape. */}
      <section className="mt-12">
        <div className="section-head">
          <h2 className="text-small font-semibold">Tomorrow, specifically</h2>
          <span className="text-micro text-[var(--color-muted)]">
            one day only · back to the defaults after
          </span>
        </div>

        {tomorrow == null && (
          <p className="pt-3 text-small text-[var(--color-muted)]">Loading…</p>
        )}

        {tomorrow != null && tomorrow.length === 0 && (
          <p className="pt-3 text-small text-[var(--color-muted)]">
            Nothing is scheduled for tomorrow.
          </p>
        )}

        {tomorrow != null && tomorrow.length > 0 && (
          <ul className="mt-1 divide-y divide-[var(--color-line)]">
            {tomorrow.map((h) => {
              const overridden = h.override != null;
              return (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
                >
                  {/* What tomorrow will SAY. Defaults to the override when set, else the
                      every-day name — and writing the default back clears the override
                      rather than storing a copy of it. */}
                  <input
                    key={`${h.id}-${h.override?.name ?? h.name}`}
                    defaultValue={h.override?.name ?? h.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== (h.override?.name ?? h.name))
                        override(h, { name: v });
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.target as HTMLInputElement).blur()
                    }
                    aria-label={`Tomorrow's wording for ${h.name}`}
                    className="min-w-0 flex-1 border-b border-transparent bg-transparent pb-0.5 font-serif text-body outline-none transition-colors focus:border-[var(--color-accent)]"
                  />

                  {/* The category, as the app's own word for it — a select, because four
                      known choices are a setting, not writing. */}
                  <select
                    value={h.override?.pillar ?? h.pillar ?? ""}
                    onChange={(e) =>
                      override(h, {
                        pillar: e.target.value as PillarKey | "",
                      })
                    }
                    aria-label={`Tomorrow's pillar for ${h.name}`}
                    className="shrink-0 border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-small outline-none transition-colors focus:border-[var(--color-accent)]"
                  >
                    {PILLAR_CHOICES.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>

                  {/* Only when something IS different — a reset beside an unchanged row
                      would imply there was something to undo. */}
                  {overridden ? (
                    <button
                      onClick={() => resetOverride(h)}
                      className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                    >
                      reset
                    </button>
                  ) : (
                    <span className="shrink-0 text-micro text-[var(--color-muted)]">
                      default
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
