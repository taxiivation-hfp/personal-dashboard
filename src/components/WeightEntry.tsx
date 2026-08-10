"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A weight reading, for any day — WRITTEN, CORRECTED or REMOVED.
 *
 * The checklist row on Today records this morning; this records the mornings you missed,
 * the months of readings you already have written down somewhere else, and — the part it
 * was missing — the ones you got wrong. Backfilling is not an edge case for a record meant
 * to last years, and neither is a typo: a scale misread as 92.4 instead of 82.4 is a
 * permanent kink in a line you will later trust, and until now the only way to reach it was
 * to guess that typing the same date again would overwrite rather than add.
 *
 * IT ALWAYS DID. habit_entries is UNIQUE (habit_id, date) and setHabitValue upserts on that
 * pair, so a second reading for a day has never been a second row — the store was already
 * correct and only the screen was silent about it. What is new is the screen SAYING so:
 * choosing a date that already has a reading fills the field with it and the button changes
 * from Save to Update, so the write you are about to make is the write you can see.
 *
 * DELETE ASKS FIRST, in the app's own two-step rather than a browser modal — the same
 * pattern the journal uses for the same reason. This is irreplaceable data and a native
 * confirm() in a standalone PWA is a system sheet dropped on top of the page.
 *
 * It sits under the weight chart, which is where you are already looking when you notice a
 * gap in it, or a spike that never happened. Deliberately not on Today: that screen is for
 * the day in front of you, and a date picker on it would be one more thing between waking
 * up and typing a number.
 */

const WEIGHT_KEY = "weight";

/**
 * How far back the readings list and the prefill can see. A year, which is /api/trends'
 * own ceiling and more history than this app has.
 *
 * A date older than this can still be written and still overwrites in place — the store
 * has no window. It simply arrives with an empty field rather than a filled one, which is
 * the honest thing for a reading this control cannot see.
 */
const HISTORY_DAYS = 366;

/** How many past readings are listed. The rest are reachable by date, and the line under
 *  the list says how many there are — a cap that hid the count would be the one thing the
 *  charts here are all built not to do. */
const LIST_LIMIT = 8;

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. The same rule DayChart draws its axis by. */
const short = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });

export default function WeightEntry({
  /** Today, so the picker cannot reach into the future. */
  today,
  onSaved,
}: {
  today: string;
  onSaved: () => void;
}) {
  const [habitId, setHabitId] = useState<number | null>(null);
  const [day, setDay] = useState(today);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  /** What just happened, in words — "saved to 3 Aug" or "removed 3 Aug". Naming the DAY is
   *  the point: the day is usually not today, so it is the part worth confirming, and a
   *  removal that reported itself as a save would be the one message you cannot trust. */
  const [saved, setSaved] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /** Every reading in the window, by date. The prefill and the list are the same fact
   *  read two ways, so they can never disagree about what is on record. */
  const [readings, setReadings] = useState<Map<string, number>>(new Map());

  // The habit's id is not knowable from here — it is whatever row carries system_key
  // 'weight', which the owner can rename freely without breaking this.
  useEffect(() => {
    let alive = true;
    fetch(`/api/today?date=${today}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || d.error) return;
        const h = (d.habits ?? []).find(
          (x: { system_key: string | null; id: number }) =>
            x.system_key === WEIGHT_KEY,
        );
        setHabitId(h?.id ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [today]);

  /** The readings themselves, from the series the chart above is already drawn from —
   *  one source, so a value in the list is a value on the line. */
  const loadReadings = useCallback(async () => {
    const d = await fetch(`/api/trends?days=${HISTORY_DAYS}&to=${today}`)
      .then((r) => r.json())
      .catch(() => ({ error: true }));
    if (d.error) return;
    const m = new Map<string, number>();
    for (const s of (d.series ?? []) as { date: string; weight: number | null }[])
      if (s.weight != null) m.set(s.date, s.weight);
    setReadings(m);
  }, [today]);

  useEffect(() => {
    loadReadings();
  }, [loadReadings]);

  /** What is ON RECORD for the selected day, or null. The prefill, the Save/Update wording
   *  and whether Delete exists at all are one question asked once. */
  const existing = readings.get(day) ?? null;

  // The field FOLLOWS the date, in both directions: pick a day with a reading and it
  // appears, pick one without and the field empties. A stale number left sitting under a
  // new date is how you overwrite a day you never meant to touch.
  //
  // Keyed on the VALUE rather than on the readings map, deliberately. The map gets a new
  // identity every time anything is written, and an effect that re-ran on identity would
  // reach in and rewrite the field while a different day's number was being typed into it.
  useEffect(() => {
    setValue(existing == null ? "" : String(existing));
  }, [day, existing]);

  // Changing the day is a new subject: an open confirm belongs to the day it was opened
  // on, and so does "saved to 3 Aug". Separate from the effect above so a write — which
  // changes `existing` and nothing else — cannot clear the message it just produced.
  useEffect(() => {
    setConfirming(false);
    setSaved(null);
  }, [day]);

  async function write(v: number | null) {
    if (habitId == null) return;
    setBusy(true);
    await fetch("/api/habits/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // null clears the day. The route and setHabitValue have always taken it — this is
      // the first control that offers it.
      body: JSON.stringify({ habit_id: habitId, date: day, value: v }),
    }).catch(() => {});
    setBusy(false);
    setConfirming(false);
    // The day the write landed on is captured BEFORE the reload, because reloading is what
    // makes `existing` change and the reload is awaited — by the line after it, the field
    // has already been rewritten and only the date is still certain.
    const on = day;
    await loadReadings();
    setSaved(`${v == null ? "removed" : "saved to"} ${short(on)}`);
    onSaved();
  }

  function save() {
    const n = Number(value);
    if (!value.trim() || !Number.isFinite(n) || n <= 0) return;
    write(n);
  }

  if (habitId == null) return null;

  /** Newest first. `readings` is keyed by ISO date, which sorts lexically as it sorts
   *  chronologically — the one thing an ISO date is for. */
  const listed = [...readings.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="mt-4 border-t border-[var(--color-line)] pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* The label is the STATE: whether this is about to write a day or rewrite one.
            It is the only thing that says which, and it is the difference between adding a
            reading and replacing one. */}
        <span className="text-micro text-[var(--color-muted)]">
          {existing == null ? "add a reading" : `editing ${short(day)}`}
        </span>

        <input
          type="date"
          value={day}
          max={today}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          aria-label="Date of the reading"
          className="rounded border border-[var(--color-line)] bg-transparent px-1.5 py-0.5 font-serif text-micro outline-none transition-colors focus:border-[var(--color-accent)]"
        />

        <span className="flex items-baseline gap-1">
          <input
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            placeholder="—"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            aria-label="Weight"
            className="w-[3.5rem] border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-right text-small tabular-nums outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
          />
          <span className="text-micro text-[var(--color-muted)]">kg</span>
        </span>

        <button
          onClick={save}
          disabled={busy || !value.trim()}
          className="rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-micro transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
        >
          {busy ? "Saving…" : existing == null ? "Save" : "Update"}
        </button>

        {/* Only where there is something to delete. A disabled delete button on every
            empty date would be a destructive control kept permanently in the corner of the
            eye, which is exactly what a quiet one should not be. */}
        {existing != null && (
          <button
            onClick={() => setConfirming(true)}
            disabled={busy}
            aria-expanded={confirming}
            className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
          >
            Delete
          </button>
        )}

        {saved && (
          <span className="text-micro text-[var(--color-muted)]">{saved}</span>
        )}
      </div>

      {/* THE SECOND STEP, in a row of its own under the controls rather than a floating
          panel over them. The journal anchors its confirm to a thumbnail in a grid, where
          it has somewhere to hang; this strip wraps at a phone width and the dialog it sits
          in clips its own overflow, so a popover would be a panel that occasionally opened
          off the edge of the sheet. Never a native confirm() either — in a standalone PWA
          that is a system sheet dropped on the app. */}
      {confirming && existing != null && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3">
          <p className="min-w-0 flex-1 text-small leading-snug">
            Remove the {existing}kg reading for {short(day)}? It can&apos;t be
            undone.
          </p>
          <button
            onClick={() => write(null)}
            disabled={busy}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            Keep it
          </button>
        </div>
      )}

      {/* THE READINGS THEMSELVES, newest first, each one the way into editing it.
          The chart above draws them and the pointer names them, but a shape is not a
          thing you can act on — reaching a bad reading used to mean recognising its date
          off the axis and typing it into the picker from memory. */}
      {listed.length > 0 && (
        <>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {listed.slice(0, LIST_LIMIT).map(([d, v]) => {
              const on = d === day;
              return (
                <li key={d}>
                  <button
                    onClick={() => setDay(d)}
                    aria-pressed={on}
                    className="rounded-full border px-2 py-0.5 text-micro tabular-nums transition-colors"
                    style={{
                      borderColor: on
                        ? "var(--color-ink)"
                        : "var(--color-line-strong)",
                      color: on ? "var(--color-ink)" : "var(--color-muted)",
                    }}
                  >
                    {short(d)}{" "}
                    <span className="text-[var(--color-ink)]">{v}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {/* The count, out loud. A list that quietly stopped at eight would be a cap
              hiding the truth, which is the one thing every chart on this page is built
              not to do. */}
          {listed.length > LIST_LIMIT && (
            <p className="mt-2 text-micro text-[var(--color-muted)]">
              the {LIST_LIMIT} most recent of {listed.length} readings · any
              other day is reachable by date
            </p>
          )}
        </>
      )}
    </div>
  );
}
