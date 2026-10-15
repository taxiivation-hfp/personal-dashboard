// The URGENCY HUE of a card on the hero rails — the owner's ruling, 2026-10-15.
//
// A one-off task or a dated subtask floating beside the ring takes a colour from how close
// its date is on the day being viewed: due today (or already past) is RED, three days out
// is YELLOW, tomorrow and two days out sit between the two, and anything four or more days
// away keeps the default ink. Four steps, not a gradient — the question a card answers is
// "how soon", and four named answers read faster than a continuous ramp.
//
// PURE and import-free apart from ./dates.ts, so it runs under `node --test` on the same
// terms as tasks.ts and subtasks.ts. The hues themselves live in globals.css as tokens —
// this module names which one applies and nothing more, so a change of shade is one CSS
// edit and never a code change.

import { daysBetween } from "./dates.ts";

/** Days ahead at which a card stops being coloured. Three is the last coloured step. */
export const DUE_TONE_HORIZON = 3;

/**
 * The CSS colour of a card due on `due`, viewed on `date` — or null for the default ink.
 *
 *   ahead <= 0   `--color-due-0`, red: today, or late.
 *   ahead == 1   `--color-due-1`
 *   ahead == 2   `--color-due-2`
 *   ahead == 3   `--color-due-3`, yellow.
 *   ahead >= 4   null — nothing to say yet.
 */
export function dueTone(due: string, date: string): string | null {
  const ahead = daysBetween(date, due);
  if (ahead > DUE_TONE_HORIZON) return null;
  return `var(--color-due-${Math.max(0, ahead)})`;
}
