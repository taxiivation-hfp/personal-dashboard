// The URGENCY HUE of a card on the hero rails — the owner's ruling, 2026-10-15.
//
// A one-off task or a dated subtask floating beside the ring takes a colour from how close
// its date is on the day being viewed: due today (or already past) is RED, three days out
// is YELLOW, tomorrow and two days out sit between the two, and anything four or more days
// away keeps the default ink. Four steps, not a gradient — the question a card answers is
// "how soon", and four named answers read faster than a continuous ramp. The two nearest
// steps are also BOLD, so the most urgent cards never rest on hue alone.
//
// PURE and import-free apart from ./dates.ts, so it runs under `node --test` on the same
// terms as tasks.ts and subtasks.ts. The hues themselves live in globals.css as tokens and
// the classes that wear them in FloatingTasks.tsx — this module names which step applies
// and nothing more, so a change of shade is one CSS edit and never a code change.

import { daysBetween } from "./dates.ts";

/** Days ahead at which a card stops being coloured. Three is the last coloured step. */
export const DUE_TONE_HORIZON = 3;

/** How close a card's date is: 0 today or late, 1 tomorrow, 2, 3 — or null from four days
 *  out, when the card wears the default ink. */
export type DueStep = 0 | 1 | 2 | 3;

/**
 * The step of a card due on `due`, viewed on `date` — or null for the default ink.
 *
 *   ahead <= 0   0, red: today, or late.
 *   ahead == 1   1
 *   ahead == 2   2
 *   ahead == 3   3, yellow.
 *   ahead >= 4   null — nothing to say yet.
 */
export function dueStep(due: string, date: string): DueStep | null {
  const ahead = daysBetween(date, due);
  if (ahead > DUE_TONE_HORIZON) return null;
  return Math.max(0, ahead) as DueStep;
}
