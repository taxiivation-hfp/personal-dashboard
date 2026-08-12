"use client";

import { useEffect, useState } from "react";
import { sinceLabel, stampInAppTz } from "@/lib/dates";

/**
 * "47m ago" — the age of the step count, and on a phone the way to go and fix it.
 *
 * THE PROBLEM IT SOLVES. The Shortcut pushes hourly, so the figure on the checklist is
 * somewhere between a minute and an hour old and the row never said which. A step count
 * you assume is current when it is from this morning is worse than no count at all,
 * because it is a number you act on. The age is therefore printed WHATEVER it is — never
 * hidden, never rounded up into looking fresh.
 *
 * THE BUTTON IS iOS ONLY, and it is a button rather than a link deliberately. A custom
 * URL scheme in an <a href> is unreliable from a standalone PWA — the home-screen web
 * view treats the navigation as a link it cannot resolve and can simply swallow it, where
 * a scripted assignment to location.href is handed to the system. Everywhere else the
 * same label renders as plain text: there is nothing to tap on a laptop, but the age is
 * still worth knowing, and hiding it would be hiding the honest half of the control.
 *
 * FEATURE-DETECTED, not sniffed. `navigator.standalone` is a WebKit-on-iOS property and
 * exists nowhere else — not in desktop Safari, not in Chrome on any platform. Its VALUE
 * says whether the app was opened from the home screen, which is not the question; its
 * EXISTENCE says this is an iPhone or iPad, which is. That beats reading a UA string,
 * which lies on iPadOS by design.
 */

/**
 * MUST MATCH THE SHORTCUT'S NAME IN THE SHORTCUTS APP, EXACTLY.
 *
 * iOS resolves this by name and by nothing else — no id, no fuzzy match. A rename in the
 * Shortcuts app, a stray capital or a trailing space silently turns the button into a
 * button that opens Shortcuts and does nothing. There is no error to catch and no way for
 * this app to know it happened; if the count stops moving after a tap, check this string
 * against the app first.
 */
const SHORTCUT_NAME = "Push Health";

/**
 * Past this, the count is described as OLD rather than current.
 *
 * Two hours, because the Shortcut is on an hourly automation: one missed run is ordinary
 * (the phone was in a tunnel, the automation was deferred) and two in a row means it has
 * actually stopped. Anything under this is simply how old the last hourly push is.
 */
const STALE_MINUTES = 120;

/** How often the label re-reads the clock. A minute — the finest thing it ever prints. */
const TICK_MS = 60_000;

export default function StepsRefresh({
  /** health_logs.updated_at for the day, or null when nothing has been pushed. */
  updatedAt,
  /**
   * Fired on the tap, BEFORE the app leaves for Shortcuts.
   *
   * The screen cannot tell a return-from-Shortcuts apart from any other return to the app,
   * and it throttles returns so that glancing at the phone does not re-read the database
   * every time. This is the one signal that says a return was ASKED FOR — without it a tap
   * made shortly after some earlier return is indistinguishable from that earlier return
   * and gets collapsed into it, which would be the refresh button failing at the one job
   * it has.
   */
  onRun,
  /**
   * Is the row showing the REAL today?
   *
   * Both halves of this control assume it. The button asks the phone for a fresh count,
   * and the Shortcut it launches pushes to whatever day the SERVER calls today — so on a
   * day you have navigated back to, tapping it would write a number into a row that is not
   * on screen and leave the figure you are looking at exactly where it was. That is the
   * "I assume it failed" the button exists to prevent, arrived at from the other side.
   *
   * The staleness dressing assumes it too: dashed-and-ink means "the phone has stopped
   * pushing", which is a true and useful thing to say about this morning and a meaningless
   * one about a Tuesday three weeks ago, where of course the last push is days old.
   *
   * The AGE still prints. It is a fact about the reading either way, and hiding it would
   * hide the honest half of the control.
   */
  live = true,
}: {
  updatedAt: string | null;
  onRun?: () => void;
  live?: boolean;
}) {
  // Both start FALSE / fixed on the server and are corrected in an effect: navigator does
  // not exist during the render that produces the HTML, and a clock read during it would
  // disagree with the client's by however long the response took. Either one branched on
  // directly is a hydration mismatch.
  const [isIOS, setIsIOS] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setIsIOS(
      "standalone" in navigator &&
        // Belt and braces against a desktop browser spoofing WebKit's shape: an iPhone
        // and an iPad both report touch points, and a Mac does not.
        navigator.maxTouchPoints > 0,
    );
  }, []);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const ago = now == null ? null : sinceLabel(updatedAt, now);
  const minutes =
    now == null || !updatedAt
      ? null
      : Math.max(0, Math.floor((now - Date.parse(updatedAt)) / 60_000));
  const stale = live && (minutes == null || minutes >= STALE_MINUTES);

  // Nothing pushed is its own statement and not a staleness reading: "0m ago" would be a
  // lie about a figure that does not exist. Kept short because this sits in a ~150px
  // checklist column — the row's own "—" already says the count is missing, and this only
  // has to say that no push is the reason.
  const label = ago ?? "no push yet";

  // Before the first tick there is no honest age to print, so nothing is printed. It
  // lasts one frame and is better than a label that says "just now" about a figure from
  // yesterday because the clock had not been read.
  if (now == null) return null;

  const title = updatedAt
    ? `Last pushed ${stampInAppTz(updatedAt)}`
    : "The phone has not pushed a step count for this day";

  // FORM says stale, not colour. A dashed edge is already this app's word for "not yet" —
  // it is what the checklist box wears below its floor — and the ink weight is what makes
  // an old figure worth a glance. Red is reserved for the floor line on a chart and gets
  // no second use: a warning colour on a step count would be the app grading a body.
  const chrome = stale
    ? "border-dashed border-[var(--color-line-strong)] text-[var(--color-ink)]"
    : "border-[var(--color-line-strong)] text-[var(--color-muted)]";

  if (!isIOS || !live)
    return (
      <span
        title={title}
        className={`shrink-0 rounded-full border px-2 py-0.5 text-micro tabular-nums ${chrome}`}
      >
        {label}
      </span>
    );

  return (
    <button
      type="button"
      onClick={() => {
        // Announced BEFORE the navigation, because the navigation is the last thing that
        // happens in this document — after it the app is in Shortcuts.
        onRun?.();
        // A SCRIPTED navigation, not an anchor — see the header. encodeURIComponent
        // because the name is the owner's own prose and may hold a space.
        window.location.href =
          "shortcuts://run-shortcut?name=" + encodeURIComponent(SHORTCUT_NAME);
      }}
      title={title}
      aria-label={`Ask the phone for fresh steps · last pushed ${label}`}
      className={`shrink-0 rounded-full border px-2 py-0.5 text-micro tabular-nums transition-colors hover:bg-[var(--color-panel)] ${chrome}`}
    >
      <span aria-hidden className="pr-1">
        ↻
      </span>
      {label}
    </button>
  );
}
