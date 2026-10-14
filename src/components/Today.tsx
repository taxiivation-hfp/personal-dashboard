"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BlockList from "./BlockList";
import CalorieInput from "./CalorieInput";
import FloatingTasks from "./FloatingTasks";
import HabitBox from "./HabitBox";
import WeightLog from "./WeightLog";
import StepsLog from "./StepsLog";
import StepsRefresh from "./StepsRefresh";
import Dashboard from "./Dashboard";
import JournalPanel from "./JournalPanel";
import PillarSections, { type TrackerDay } from "./PillarSections";
import Timeline from "./Timeline";
import Ring, { toneColor } from "./PillarRing";
import { PhoneSwipe, type PhoneTab } from "./PhoneTabs";
import NoteLog, { DOC_HABITS } from "./NoteLog";
import StreakFlame from "./StreakFlame";
import ChapterName from "./ChapterName";
import type { Workout } from "./WorkoutLog";
import { addDays, daysBetween, prettyDate, todayISO } from "@/lib/dates";
import { buildCareerRing } from "@/lib/career";
import type { DayView, GoalView, PillarKey } from "@/lib/queries";
import { STEPS_FLOOR } from "@/lib/rings";
import type {
  HealthRingView,
  PillarRingView,
  WorkoutKind,
} from "@/lib/rings";

// Desktop only: each column owns its scroll, bounded to whatever the masthead leaves.
//
// `h-full` inside a flex-1 parent, NOT a calc() against the viewport. The old version
// subtracted a hand-measured 8.5rem for the header, which was wrong the moment the header
// changed height — and would be wrong again on the next masthead edit. The shell is a
// full-height flex column, the content row takes the remainder, and the columns fill it.
//
// `scrollbar-gutter: stable` keeps a column from reflowing when its content grows past
// the fold. On mobile these are inert — the page scrolls as one, as it should.
const colScroll = "lg:h-full lg:overflow-y-auto lg:[scrollbar-gutter:stable]";

/**
 * BEAT ONE of the record's three-beat choreography: how long the outgoing contents get to
 * leave before the geometry starts. Matches the exit leg of `.panel-fade` / `.panel-swap`
 * in globals.css — the sequence is contents OUT (this), windows MOVE (--dur-panel), new
 * contents IN (the entrance delays riding on `.panel-fade` and `.pane-enter`).
 *
 * A timeout rather than a transitionend listener, for the reason every other timed hand-off
 * in this app gives: transitionend does not fire in a hidden tab, and a record that never
 * appears because the tab was in the background is worse than a beat that occasionally runs
 * a frame early.
 */
const RECORD_EXIT_MS = 180;

/**
 * The timeline gesture's two travels — the windows' fall and their return. Timeouts
 * matched to the transitions in globals.css (`.panel-row[data-timeline]` and the base
 * `.panel` transform), with the usual 20ms of slack so the hand-off never runs a frame
 * before the move has finished. Timeouts, not transitionend: a hidden tab runs no
 * transition, and the state machine must still settle.
 */
const TL_FALL_MS = 640;
const TL_RISE_MS = 640;

/** Hours to one decimal, with no trailing ".0" — "3.5 of 8h" reads; "3.50 of 8.00h" does not. */
const round1 = (n: number) => String(Math.round(n * 10) / 10);

/** "2026-08-06" -> "Thu 6 Aug". Noon, never midnight: a bare ISO date parses as UTC and
 *  lands on the day before anywhere west of Greenwich. */
const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/**
 * One row of the day's checklist.
 *
 * A top rule on EVERY row rather than `divide-y` on the list. divide-y draws between
 * siblings in DOM order, which in a two-column grid puts a rule between the last item of
 * the left column and the first of the right — a line across a column break. Ruling each
 * row from the top gives both columns a matching top edge and costs nothing.
 */
const CHECK_ROW = "border-t border-[var(--color-line)]";

/**
 * How long the step re-read waits before it will run again.
 *
 * Coming back to the app fires visibilitychange AND focus a moment apart, and on a phone
 * it fires every time you glance at the thing. Five seconds collapses the pair into one
 * read and swallows an incidental flick away and back.
 *
 * A TAP OF THE REFRESH BUTTON IS EXEMPT — see `stepsWanted`. That is not belt and braces,
 * it is the difference between the throttle working and the feature not: the clock here
 * starts at the last READ, so a tap a few seconds after resuming the app fell inside the
 * window and produced no request at all. No length of window fixes that, because the
 * problem is that the throttle could not see the tap.
 */
const STEPS_REFETCH_MS = 5_000;

/**
 * The SECOND look, after the app is already back.
 *
 * Returning from Shortcuts is a race the first read usually loses: iOS hands the screen
 * back the moment the shortcut is done on the phone, which is before its POST has
 * finished crossing the network. One read on return would therefore show the OLD count —
 * exactly the "I assume it failed" the button exists to prevent — so a single follow-up
 * read runs a beat later. Two reads, not a poll: if it is still not there after this, it
 * genuinely did not arrive.
 */
const STEPS_SETTLE_MS = 2_500;

/** The one numeric field shape, so the weight row and the calorie row cannot drift apart. */
const NUM_FIELD =
  "w-[3rem] border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-right text-small tabular-nums outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]";

// DOC_HABITS moved to NoteLog.tsx — the dialog it configures — when the written log's day
// reader became a second surface that opens it. One roster, two ways in.

// StreakFlame (its own file, shared with CalorieInput) replaced the local StreakMark on
// 2026-08-24 — the flame ruling. The zero-draws-nothing rule lives inside it.

export default function Today({
  initial,
  today: serverToday,
  goals: initialGoals,
  initialView,
}: {
  initial: DayView;
  /** `?view=timeline` on the front door — a reload while standing on the timeline must
   *  land back on it, settled, with no animation to replay. */
  initialView?: "timeline";
  /**
   * The REAL today, resolved on the server.
   *
   * This screen shows `data.date`, which is usually today and deliberately no longer always
   * — so the two have to be held apart. It is resolved server-side and passed down rather
   * than read here, for two reasons: `todayISO()` consults APP_TZ, which Next does not
   * inline into a client bundle for a non-NEXT_PUBLIC var, and a value computed during
   * render is a value that goes stale in a tab left open across midnight.
   */
  today: string;
  goals: GoalView[];
}) {
  const [data, setData] = useState<DayView>(initial);

  /**
   * TODAY, AND IT HAS TO BE ABLE TO CHANGE.
   *
   * Seeded from the server, which is the right place to resolve it once — but a value
   * resolved once is a value that is wrong after midnight, and this app is opened from a
   * phone home screen and left there. At 00:10 the screen is showing yesterday while every
   * derived answer still says it is live: no catching-up bar, a forward arrow disabled
   * against a day that now exists, and a Steps refresh button that would launch the
   * Shortcut and write into a row that is no longer on screen.
   *
   * So it is re-read whenever the app comes back to the front, which on a phone is the
   * moment it matters. Nothing here MOVES the screen — the day you were looking at is
   * still the day you were looking at, it has simply stopped being today, and the bar and
   * the enabled arrow are how you find out.
   *
   * Client-side `todayISO()` falls back to the hardcoded Australia/Melbourne default, since
   * Next does not inline a non-NEXT_PUBLIC var into the browser bundle. That agrees with
   * the server unless APP_TZ is set to something else — and a tab that has been open across
   * midnight is exactly the case where a stale value is already wrong.
   */
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const now = todayISO();
      setToday((cur) => (cur === now ? cur : now));
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  /**
   * THE ADHERENCE TRACKER'S EIGHT DAYS — seven past, then the real today (spec §4).
   *
   * Anchored to TODAY and not to the viewed day, exactly as the week strip it replaces was:
   * a chart that travelled with the screen could only ever be walked backwards, and it would
   * rescale against a different week at every step. Fixed, it is a ruler, and a dot on it is
   * a way to any of those days.
   */
  const [tracker, setTracker] = useState<TrackerDay[]>([]);
  // Goals and the Health ring are OWNED here rather than left as server props. page.tsx
  // renders once per request, so every new control (subtask tick, gym log) would otherwise
  // mutate data the screen could not re-read without a full navigation.
  const [goals, setGoals] = useState<GoalView[]>(initialGoals);
  /** Health's fortnight, from /api/rings. null until it lands — a ghost, not a zero. */
  const [health, setHealth] = useState<HealthRingView | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  // Phone only: which of the two panes is showing. Opens on the day's work, and a
  // reload returns there rather than wherever you last wandered.
  const [tab, setTab] = useState<PhoneTab>("today");
  // Naming TODAY, and only today. The days ahead used to be nameable inline on the week
  // strip; nothing on this screen looks forward any more, so a day is named from the day.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  // Raised by the Journal row in the checklist — the journal is written, not ticked.
  const [journalPrompt, setJournalPrompt] = useState(false);
  /**
   * Which non-negotiable's document is open — outreach, today.
   *
   * The habit id rather than a boolean, so the row that opened it is the row that gets
   * written: the checklist is a list and a flag would have to be told which item it meant.
   */
  const [noteHabit, setNoteHabit] = useState<number | null>(null);
  /** Month -> chapter name. Fetched once; the masthead writes back into it on save so the
   *  title updates without a reload. Empty until it answers, which reads as "unnamed" —
   *  correct, and the same thing an unnamed month reads as anyway. */
  const [chapters, setChapters] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/chapter")
      .then((r) => r.json())
      .then((d) => !d.error && setChapters(d.chapters ?? {}))
      .catch(() => {});
  }, []);
  /** The weight trend dialog, raised from the Weight row's name. */
  const [weightOpen, setWeightOpen] = useState(false);
  /** The step trend dialog, raised from the Steps row's count. */
  const [stepsOpen, setStepsOpen] = useState(false);
  /**
   * Set the moment the refresh button is tapped, cleared by the read that answers it.
   *
   * A ref and not state, because nothing on screen depends on it and a re-render between
   * the tap and the departure would be a re-render for no one to see. What it buys is the
   * difference between "the app came back" and "the app was SENT somewhere and came back",
   * which the throttle below cannot otherwise tell apart.
   */
  const stepsWanted = useRef(false);

  const router = useRouter();
  /** The pillars window's box — measured when the phone's record expansion launches. */
  const pillarPanel = useRef<HTMLDivElement>(null);
  /**
   * The phone's record move: the from-transform mapping a full-screen overlay down onto
   * the pillars window. Non-null while the expansion is playing; the navigation to
   * /stats fires on a timer underneath it, so the record page appears exactly where the
   * expansion lands. Desktop never sets this — it has the in-place lateral move.
   */
  const [phoneExpand, setPhoneExpand] = useState<string | null>(null);
  useEffect(() => {
    if (phoneExpand == null) return;
    // A timeout, not transitionend — the reveal rule every timed hand-off here follows:
    // in a hidden tab the transition never runs and the navigation must still happen.
    const t = setTimeout(() => router.push("/stats"), 660);
    return () => clearTimeout(t);
  }, [phoneExpand, router]);

  /**
   * One button, two moves. Desktop: the row's lateral expansion, in place. Phone: the
   * pillars window grows on ALL FOUR sides into the record PAGE — the inline swap was a
   * desktop shape that read as a glitch inside a phone-height window, so below lg the
   * gesture became route-shaped: expand, then arrive at /stats.
   */
  const openRecord = () => {
    if (window.matchMedia("(min-width: 64rem)").matches) {
      setRecordOpen(true);
      return;
    }
    const r = pillarPanel.current?.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || 1;
    const vh = document.documentElement.clientHeight || 1;
    setPhoneExpand(
      r && r.width && r.height
        ? `translate(${r.left}px, ${r.top}px) scale(${r.width / vw}, ${r.height / vh})`
        : "scale(0.96)",
    );
  };
  /**
   * The record. Held HERE rather than in the pillar column because it is not a thing that
   * column contains — it is a change to the whole ROW, and only the row's owner can widen one
   * window by narrowing two others.
   */
  const [recordOpen, setRecordOpen] = useState(false);
  /**
   * The GEOMETRY, one beat behind the intent.
   *
   * `recordOpen` is what the owner asked for and flips on the click; this is what the row
   * is currently shaped as, and it follows RECORD_EXIT_MS later. The gap between them is
   * beat one: the row carries `data-exiting`, every window's contents fade down and out,
   * and only then does the layout start to move — a window that reflows while its text is
   * still readable reads as the text being crushed, not as the window travelling. This
   * state also decides WHICH content the pillar window holds, so the swap happens behind
   * an opacity that is already zero.
   */
  const [recordGeom, setRecordGeom] = useState(false);
  useEffect(() => {
    if (recordGeom === recordOpen) return;
    const t = setTimeout(() => setRecordGeom(recordOpen), RECORD_EXIT_MS);
    return () => clearTimeout(t);
  }, [recordOpen, recordGeom]);

  /** Escape closes the record — it is a window you opened, and that is what closes windows.
   *  Bound only while it is open, so it never competes with a dialog's own handler. */
  useEffect(() => {
    if (!recordOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRecordOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recordOpen]);

  /**
   * THE TIMELINE, and the fall that reveals it — the owner's ask, 2026-09-03: the three
   * windows are SHOVED DOWN out of sight (they do not collapse), the timeline fades in on
   * the ground behind them, and a small bar at the foot reverses the whole thing.
   *
   * A four-beat machine rather than a boolean, because the way BACK needs a painted frame
   * the way in does not:
   *
   *   closed → falling   the row carries data-timeline; every window travels 110vh down
   *                      on the departure curve (gathering speed — the one move that may),
   *                      while the timeline layer fades in behind it
   *   falling → open     TL_FALL_MS later the row leaves the layout entirely (display:
   *                      none), so 110vh of transformed window stops extending the page's
   *                      scroll height underneath the timeline. That also discards the
   *                      scrollTop of every window, which used to matter: the calendar
   *                      column came back parked at its top instead of centred on today and
   *                      had to be re-keyed on landing. The blocks list that replaced it
   *                      opens at its top anyway, so nothing is re-keyed now.
   *   open → prep        the return: the row is DISPLAYED again, still translated — one
   *                      committed frame, because a transition can only travel from a
   *                      state the browser has actually painted. A timeout, not a rAF:
   *                      in a hidden tab rAF never fires, and the machine must still
   *                      reach `closed` there (the transitions simply don't run, and
   *                      every resting state is the visible one).
   *   prep → rising      data-timeline comes off; the windows travel home on the house
   *                      ease-out while the layer fades away, and TL_RISE_MS later the
   *                      layer unmounts
   *
   * `?view=timeline` follows the state through replaceState — same contract as `?date=` —
   * so a reload lands back on the timeline, settled, and Back leaves the screen rather
   * than replaying the gesture.
   */
  const [tl, setTl] = useState<"closed" | "falling" | "open" | "prep" | "rising">(
    initialView === "timeline" ? "open" : "closed",
  );
  useEffect(() => {
    if (tl === "falling") {
      const t = setTimeout(() => setTl("open"), TL_FALL_MS);
      return () => clearTimeout(t);
    }
    if (tl === "prep") {
      const t = setTimeout(() => setTl("rising"), 50);
      return () => clearTimeout(t);
    }
    if (tl === "rising") {
      const t = setTimeout(() => setTl("closed"), TL_RISE_MS);
      return () => clearTimeout(t);
    }
  }, [tl]);

  /* BOTH SIDES GUARD ON THE MACHINE, and the URL is inside the guard.
   *
   * The state transition was already conditional and the replaceState beside it was not,
   * which is a disagreement waiting for a second press: the machine sits in `falling` and
   * in `rising` for 640ms each, and in BOTH of those states the control that triggered it
   * is still on screen and still clickable (the panel row is only `hidden` at `open`, and
   * the RETURN bar is mounted for every state but `closed`). Pressing TIMELINE, then RETURN,
   * then TIMELINE again inside that window left nothing opening and `?view=timeline` in the
   * address bar — so the next reload landed on the timeline the owner had just left. The
   * mirror press left the timeline open with the URL reading `/`. `tl` is read rather than
   * updated functionally because the guard has to decide the WRITE as well as the state. */
  const openTimeline = useCallback(() => {
    if (tl !== "closed") return;
    setTl("falling");
    const qs = new URLSearchParams();
    if (viewing.current !== today) qs.set("date", viewing.current);
    qs.set("view", "timeline");
    window.history.replaceState(null, "", `/?${qs}`);
  }, [tl, today]);
  const closeTimeline = useCallback(() => {
    if (tl !== "open") return;
    setTl("prep");
    window.history.replaceState(
      null,
      "",
      viewing.current !== today ? `/?date=${viewing.current}` : "/",
    );
  }, [tl, today]);

  /** Escape returns to the dashboard — the timeline is a place you opened. */
  useEffect(() => {
    if (tl !== "open") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTimeline();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tl, closeTimeline]);

  /**
   * THE DAY THE SCREEN IS CURRENTLY ASKING ABOUT, readable from inside a promise.
   *
   * Every loader here fires for one day and resolves later, and until this screen could
   * move there was only ever one day for them to be about. Now a reply can outlive the day
   * that asked for it: tick a habit, tap another column while the refresh is still out, and
   * the old day's answer lands last and paints itself over the new one — the date line would
   * say Monday while the checklist showed Saturday's ticks.
   *
   * A ref rather than state because nothing renders from it; it exists so a `.then` can ask
   * "is this still the question?" rather than assume.
   */
  const viewing = useRef(data.date);
  viewing.current = data.date;

  /**
   * EIGHT DAYS ENDING ON TODAY — seven past days and the live one, which is the tracker's
   * whole shape (spec §4). There is no future half: nothing has happened on a day that has
   * not happened, and a chart reserving columns for it spends its width on nothing.
   */
  const loadTracker = useCallback(() => {
    fetch(`/api/adherence?days=8&to=${today}`)
      .then((r) => r.json())
      .then((s) => !s.error && setTracker(s.days ?? []))
      .catch(() => {});
  }, [today]);

  /**
   * HEALTH ONLY. The route still answers with both pillars, and the `portfolio` entry is
   * deliberately ignored here — see `career` below, which is rebuilt on the client from the
   * goals this screen already owns so that ticking a subtask moves the ring without a round
   * trip. Health has no such local source: its fortnight is sessions, steps and calories.
   */
  const loadRings = useCallback(() => {
    const asked = data.date;
    fetch(`/api/rings?date=${asked}`)
      .then((r) => r.json())
      .then((s: { error?: unknown; pillars?: PillarRingView[]; workouts?: Workout[] }) => {
        if (s.error || viewing.current !== asked) return;
        setHealth(
          (s.pillars ?? []).find(
            (p): p is HealthRingView => p.key === "physical",
          ) ?? null,
        );
        setWorkouts(s.workouts ?? []);
      })
      .catch(() => {});
  }, [data.date]);

  /**
   * Which refresh is the LATEST. Ticks are drawn locally the instant they are tapped (see
   * `patchData` below) and the server's answer lands afterwards; two quick taps mean two
   * refreshes in flight, and the first one's reply must not paint over the second tap. Only
   * the newest reply is applied.
   */
  const refreshSeq = useRef(0);
  const refresh = useCallback(async () => {
    const mine = ++refreshSeq.current;
    // The three reads go out together — the tracker and the rings never waited on the day.
    loadTracker();
    loadRings();
    const d = await fetch(`/api/today?date=${data.date}`)
      .then((r) => r.json())
      .catch(() => ({ error: true }));
    if (mine !== refreshSeq.current) return;
    // Applied only if it is still the day on screen. `d.date` is the server's own answer,
    // so this compares what arrived against what is being asked — never two guesses.
    if (!d.error) setData((cur) => (d.date === cur.date ? d : cur));
  }, [data.date, loadTracker, loadRings]);

  /**
   * DRAW THE TAP BEFORE THE SERVER ANSWERS. Every tick on this screen used to wait for its
   * write AND the three reads that follow before the box changed — against a remote
   * database that is a visible pause on the most repeated gesture in the app. The write
   * still happens and `refresh` still replaces this guess with the stored truth; this only
   * moves the drawing to the front.
   */
  const patchData = useCallback((fn: (d: DayView) => DayView) => {
    setData((d) => fn(d));
  }, []);

  /**
   * GOING BACK A DAY — the whole of the backdating feature, in one function.
   *
   * Everything on this screen already wrote to `data.date` rather than to the clock: the
   * marks, the ticks, the weight, the calories, the page you write tonight. What was
   * missing was any way for `data.date` to be a day other than the one the server rendered,
   * which is why "I did it but forgot to log it" had no answer.
   *
   * THE SWAP IS ATOMIC, and that is the honest arrangement rather than the fast one. The
   * alternative — move the date line now, let the checklist catch up — puts a date at the
   * top of the screen and yesterday's ticks underneath it for as long as the fetch takes,
   * and a tick made in that window is a tick you made against the wrong list. So the whole
   * day arrives at once and the control you pressed carries the wait.
   *
   * NEVER PAST TODAY. There is nothing to log about a day that has not happened.
   */
  const [moving, setMoving] = useState<string | null>(null);
  const goToDay = useCallback(
    async (iso: string) => {
      if (iso === data.date || iso > today || moving) return;
      setMoving(iso);
      const d = await fetch(`/api/today?date=${iso}`)
        .then((r) => r.json())
        .catch(() => ({ error: true }));
      if (!d.error) {
        setData(d);
        // The address bar follows, so a reload stays on the day being read and the
        // journal's "open that day" link survives being bookmarked. replaceState rather
        // than push: back should leave this screen, not walk one day at a time through
        // every arrow tap. Next supports both natively and keeps its router in step.
        window.history.replaceState(
          null,
          "",
          iso === today ? "/" : `/?date=${iso}`,
        );
      }
      setMoving(null);
    },
    [data.date, today, moving],
  );

  /** How far back the screen is, and the fact the standing bar prints. 0 is today. */
  const back = daysBetween(data.date, today);

  useEffect(loadTracker, [loadTracker]);
  useEffect(loadRings, [loadRings]);

  /**
   * COMING BACK — re-read the step count, and only the step count.
   *
   * The Steps row is the one figure on this screen written by something that is not this
   * screen: an iOS Shortcut, which runs in another app. Tapping refresh therefore means
   * LEAVING, and without this the owner comes back to the number they left behind and
   * concludes the shortcut failed. It did not; nothing asked.
   *
   * A dedicated endpoint rather than refresh(): that one re-reads the whole day INCLUDING
   * the Google Calendar, and this fires every time the app comes to the front, which on a
   * phone is many times an hour and mostly for reasons that have nothing to do with steps.
   *
   * `focus` is the fallback and not the signal. visibilitychange is the event that
   * actually describes returning to a PWA; focus catches the desktop case of clicking back
   * into a window that never went hidden. Both are guarded on the document being visible
   * and both go through the same throttle, so the pair that fires on a single return is
   * one read.
   *
   * Nothing here touches adherence, the tracker or the rings. A step count feeds the Health
   * ring's own fortnight, which is /api/rings' business on its own schedule — it is not
   * something a glance at the screen should recompute.
   */
  useEffect(() => {
    let alive = true;
    let settle: ReturnType<typeof setTimeout> | null = null;
    let last = 0;

    const read = () => {
      fetch(`/api/health/steps?date=${data.date}`)
        .then((r) => r.json())
        .then((h: { error?: unknown; steps?: number | null; updatedAt?: string | null }) => {
          if (!alive || h.error) return;
          const steps = h.steps ?? null;
          const at = h.updatedAt ?? null;
          // Same answer, same object: an unchanged count must not re-render the checklist
          // and must not restart the number fields' uncontrolled defaults underneath a
          // cursor. Most returns to the app find exactly what they left.
          setData((d) =>
            d.steps === steps && d.stepsUpdatedAt === at
              ? d
              : { ...d, steps, stepsUpdatedAt: at },
          );
        })
        .catch(() => {});
    };

    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      const t = Date.now();
      // A TAP IS NEVER THROTTLED. The throttle exists to collapse the visibilitychange and
      // focus pair a single return fires, and to ignore an idle glance at the phone — it
      // was never meant to reach a refresh the owner actually asked for. It could: the
      // clock starts at the LAST READ, so a tap made a few seconds after resuming the app
      // came back inside the window and was dropped, silently, producing no request at
      // all. That is precisely the "I assume it failed" this button exists to prevent, and
      // it happened only in the sequence the button is used in.
      const asked = stepsWanted.current;
      if (!asked && t - last < STEPS_REFETCH_MS) return;
      stepsWanted.current = false;
      last = t;
      read();
      if (settle) clearTimeout(settle);
      settle = setTimeout(read, STEPS_SETTLE_MS);
    };

    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      alive = false;
      if (settle) clearTimeout(settle);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [data.date]);

  async function toggleHabit(id: number, done: boolean) {
    patchData((d) => ({
      ...d,
      habits: d.habits.map((h) => (h.id === id ? { ...h, done } : h)),
    }));
    await fetch("/api/habits/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ habit_id: id, date: data.date, done }),
    }).catch(() => {});
    refresh();
  }

  /** The document behind a non-negotiable. Writing it ticks the day server-side, so the
   *  refresh below picks up both the note and the tick in one read. `pages` travels only
   *  when the dialog owns a pages field — see /api/habits/log. */
  async function saveHabitNote(
    id: number,
    note: string | null,
    pages?: number | null,
  ) {
    const r = await fetch("/api/habits/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        habit_id: id,
        date: data.date,
        note,
        ...(pages !== undefined ? { pages } : {}),
      }),
    });
    // THROWS on a save that did not land, and that is load-bearing: the dialog closes
    // itself when this resolves, and closing over a 4xx would discard the only copy of
    // the words while looking exactly like success. NoteLog catches this and stays open.
    if (!r.ok) {
      const b = await r.json().catch(() => null);
      throw new Error(
        typeof b?.error === "string" ? b.error : "could not save",
      );
    }
    refresh();
  }

  /** Tick or untick a one-off non-negotiable. The row knows its own day. */
  async function toggleOneOff(id: number, done: boolean) {
    patchData((d) => ({
      ...d,
      oneOffs: d.oneOffs.map((o) => (o.id === id ? { ...o, done } : o)),
    }));
    await fetch("/api/habits/one-off", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, done }),
    }).catch(() => {});
    refresh();
  }

  // Mutating routes return the refreshed collection, so one round trip does both jobs.
  // Deliberately await-then-set rather than optimistic: there are no optimistic updates
  // anywhere in this codebase, and adding the first one beside a toggle that isn't would
  // need rollback semantics nothing else has.
  async function mutateGoals(url: string, init: RequestInit) {
    const r = await fetch(url, {
      headers: { "content-type": "application/json" },
      ...init,
    })
      .then((x) => x.json())
      .catch(() => ({ error: true }));
    if (!r.error && r.goals) setGoals(r.goals);
  }

  /**
   * TICK A GOAL DONE, from two places: the Career drill-down's `mark done` and a goal's
   * sticky note on the timeline. Status `done` stamps `completed_at` server-side and status
   * `active` clears it — the engine owns that pair, and this is only the button.
   *
   * A goal marked done leaves the Career ring, because only ACTIVE goals with a deadline take
   * an arc (spec §1). That is intended: the ring is what is in flight, not what has been
   * achieved. The timeline's note stays where it was put, with its tick and its date.
   */
  const onGoalDone = (id: number, done: boolean) =>
    mutateGoals(`/api/goals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: done ? "done" : "active" }),
    });

  /**
   * SET A COUNTED GOAL'S TALLY — the Career drill-down's stepper. Absolute, never a delta
   * (engine.setGoalCount): a double-fired tap must not advance the count twice.
   *
   * It goes through `mutateGoals` like every other goal write, so the Career ring is
   * rebuilt on this client the same beat the number moves — which is the whole reason the
   * ring is built here rather than taken from /api/rings.
   */
  const onGoalCount = (id: number, count: number) =>
    mutateGoals(`/api/goals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ count }),
    });

  /** Tick or untick a one-off task. The tick belongs to the day on screen. */
  async function toggleTask(id: number, done: boolean) {
    patchData((d) => ({
      ...d,
      tasks: d.tasks.map((t) =>
        t.id === id ? { ...t, done, doneOn: done ? d.date : null } : t,
      ),
    }));
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, date: data.date, done }),
    }).catch(() => {});
    refresh();
  }

  /** Numeric non-negotiable (weight). An empty field clears the day. */
  async function setHabitNumber(id: number, raw: string) {
    const v = raw.trim() === "" ? null : Number(raw);
    if (v !== null && !Number.isFinite(v)) return;
    await fetch("/api/habits/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ habit_id: id, date: data.date, value: v }),
    }).catch(() => {});
    refresh();
  }

  /** id null logs a NEW session; an id edits that one. A day can hold two lifts. */
  /** `date` is the dialog's, not the screen's — a session can be written up days later. */
  async function saveWorkout(
    kind: WorkoutKind,
    note: string,
    id: number | null,
    date: string,
  ) {
    await fetch("/api/gym", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, kind, note, id }),
    }).catch(() => {});
    loadRings();
  }

  async function deleteWorkout(id: number) {
    await fetch(`/api/gym?date=${data.date}&id=${id}`, {
      method: "DELETE",
    }).catch(() => {});
    loadRings();
  }

  /** Name a day, or clear it with an empty string. An intention, so rewriting is normal. */
  async function saveDayTitle(date: string, title: string) {
    setEditingTitle(false);
    await fetch("/api/day-title", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, title }),
    }).catch(() => {});
    refresh();
  }

  const a = data.adherence;

  /**
   * CAREER IS REBUILT HERE, on the client, and that is load-bearing rather than an
   * optimisation. Ticking a subtask must move the Career ring immediately — `mutateGoals`
   * returns the whole refreshed collection, so the ring follows the answer that same beat,
   * with no second round trip to /api/rings and no window where the list and the donut
   * disagree.
   *
   * It cannot drift from the server's own answer either: `buildCareerRing` is the exact
   * function /api/rings calls, given the same goals and the same day. The `portfolio` entry
   * that route returns is simply ignored on this screen.
   */
  const career = useMemo(
    () => buildCareerRing(goals, data.date),
    [goals, data.date],
  );

  // Straight off DayView.pillars — no extra request for something already loaded.
  const colors = Object.fromEntries(
    data.pillars.map((p) => [p.key, p.color]),
  ) as Partial<Record<PillarKey, string | null>>;

  /**
   * The tick / fill for a non-negotiable, in its pillar's hue.
   *
   * A habit with NO pillar is the warm neutral now, not the amber accent (spec §5): Journal,
   * Read and Tidy room are things with no pillar, and dressing them in the one accent made
   * three unfiled rows the loudest marks on the checklist. The accent stays where it means
   * something — the hero ring, and the ONE-OFF non-negotiables below, which belong to the day
   * rather than to any pillar. That branch is separate and deliberately unchanged.
   */
  const habitTone = (pillar: PillarKey | null | undefined) =>
    pillar ? toneColor(pillar, colors[pillar]) : "var(--color-neutral)";

  /**
   * THE DAY'S BLOCKS, and the way onto the timeline.
   *
   * Rendered TWICE — once in the blocks window on desktop and once inside Today's own pane
   * below `lg`, where the spec puts the list above the checklist. Two BlockList instances
   * mount and only one is ever visible; both read the same `data.blocks` and call the same
   * `refresh`, so they cannot disagree about a mark. A single instance moved between two
   * parents would remount on every breakpoint change and lose whatever row was open.
   */
  const blocksPane = (
    <section>
      <div className="section-head">
        <h2 className="text-small font-semibold">
          {back === 0 ? "Today's blocks" : `Blocks on ${shortDay(data.date)}`}
        </h2>
        {/* The timeline's entry point MOVES here from the old calendar head — this window
            is what replaced that one. A word, not a chip, tracked out: it is a PLACE you go
            rather than an action you take, and the chips on this screen are all marks. */}
        <button
          type="button"
          onClick={openTimeline}
          className="text-micro font-semibold tracking-[0.18em] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
        >
          TIMELINE
        </button>
      </div>
      <div className="mt-4">
        {data.calendarConnected ? (
          <BlockList
            date={data.date}
            isToday={back === 0}
            blocks={data.blocks}
            onChanged={refresh}
            onMark={(eventId, next) =>
              patchData((d) => ({
                ...d,
                blocks: d.blocks.map((b) =>
                  b.event_id === eventId ? { ...b, ...next } : b,
                ),
              }))
            }
          />
        ) : (
          <p className="max-w-[42ch] text-body text-[var(--color-muted)]">
            Google Calendar isn&apos;t connected.{" "}
            <a
              href="/api/google/connect"
              className="text-[var(--color-ink)] underline decoration-[var(--color-line-strong)] underline-offset-4 transition-colors hover:decoration-[var(--color-accent)]"
            >
              Connect it
            </a>
            .
          </p>
        )}
      </div>
    </section>
  );

  const middle = (
    // gap-8 on a past day, gap-10 on a live one. The catching-up bar is ~85px of furniture
    // this column does not otherwise carry, and the window's height budget has 77px of slack
    // — so the two gaps between the three blocks give back the 8px that would otherwise put
    // the checklist's last row past the fold. Nothing scrolls at rest, on either kind of day.
    <div className={`flex flex-col ${back > 0 ? "gap-8" : "gap-10"}`}>
      {/* THE DAY. Date first and small — orienting meta, not a headline — then what you
          INTEND the day to be, in your own words. The intention is deliberately connected
          to nothing: it feeds no rate, no ring and no score, because the moment naming a
          day becomes something you can fail at, it stops being a plan. */}
      {/* A CARD, not bare type on the window — the owner asked this screen for more
          structure and weight, and the record's card is the house word for it. Same
          smaller-pane-of-the-same-glass the chart cards established. It takes the window's
          full width now that nothing stands beside it. */}
      {/* CATCHING UP.

          The one piece of furniture the backdating feature adds, and it stands only while
          the screen is showing a day that is not today. It says the mechanism out loud —
          what you mark here lands on THAT day — because every control below it looks
          exactly as it does on a live day, which is the whole point and also the whole
          risk. A tick is cheap to make and expensive to make against the wrong date.

          --color-recorded is the token the calendar column gave a past day, so a screen in
          the past wears the colour the app has always used to mean "recorded". No warning
          hue and no alarm: catching up is the feature working, not a mistake. */}
      {back > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-recorded)] px-4 py-2.5">
          <p className="min-w-0 text-small leading-snug">
            <span className="font-semibold">Catching up.</span>{" "}
            <span className="text-[var(--color-muted)]">
              Marks land on {prettyDate(data.date)} · {back} day
              {back === 1 ? "" : "s"} back.
            </span>
          </p>
          <button
            onClick={() => goToDay(today)}
            disabled={moving != null}
            className="shrink-0 rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-micro transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
          >
            back to today
          </button>
        </div>
      )}

      {/* The "next up" card stood beside this one and went with the calendar window (spec
          §4). What is next is on the blocks list, one window to the left — the same glance,
          and also where you mark it. */}
      <header className="record-card">
        {/* THE DATE, and the way to another one. The arrows sit at the end of the line
            they move rather than flanking it: a date with a chevron on each side is a
            stepper, and this line is a heading that happens to be steppable — the day
            you open on is today, and nothing should suggest a dial to be spun. */}
        {/* items-center, not items-baseline: the arrows are 36px boxes now and a baseline
            would hang them off the date's own. -my-2 gives the buttons their height back
            out of the card's padding, so a generous target costs the header nothing. */}
        <div className="-my-2 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-micro text-[var(--color-muted)]">
            {prettyDate(data.date)}
          </p>
          <div className="-mr-2 flex shrink-0 items-center">
            {/* 2.25rem square each, and sized for a thumb rather than for the glyph.
                These are the always-visible way into the whole feature on a phone, and a
                chevron's own advance width is about 5px — a target that small, with its
                twin 12px away, is one where the commonest gesture in the feature lands on
                the wrong arrow and moves the screen the wrong way. The MARK stays small;
                only the box around it is generous. */}
            <button
              onClick={() => goToDay(addDays(data.date, -1))}
              disabled={moving != null}
              aria-label="The day before"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-small leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-ink)] disabled:opacity-40"
            >
              ‹
            </button>
            <button
              onClick={() => goToDay(addDays(data.date, 1))}
              // Never past today. There is nothing to log about a day that has not
              // happened.
              disabled={moving != null || back === 0}
              aria-label="The day after"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-small leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-ink)] disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => saveDayTitle(data.date, titleDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            maxLength={80}
            placeholder={back === 0 ? "What is today for?" : "What was that day for?"}
            aria-label={back === 0 ? "What is today for?" : "What was that day for?"}
            className="mt-1 w-full border-b border-[var(--color-line-strong)] bg-transparent pb-1 font-serif text-heading outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
          />
        ) : (
          <button
            onClick={() => {
              setTitleDraft(data.title ?? "");
              setEditingTitle(true);
            }}
            className="mt-1 w-full min-w-0 truncate text-left font-serif text-heading transition-colors hover:text-[var(--color-accent)]"
          >
            {data.title ?? (
              <span className="text-[var(--color-muted)]">
                {/* An intention is written in advance, so on a past day the question is
                    in the past tense — asking what a Tuesday three weeks gone "is for"
                    would be the screen not knowing which day it is on. */}
                {back === 0 ? "What is today for?" : "What was that day for?"}
              </span>
            )}
          </button>
        )}
      </header>

      {/* THE HERO BAND. The ring is CENTRED now and 240px — the largest thing on the screen
          by a wide margin — with the day's tasks floating on rails either side of it (spec
          §4). It used to sit on the left with the checklist beside it, which was the right
          answer when this column was a third of a narrower page; with the window at ~717px
          the checklist has room to run the full width underneath, and the ring gets the
          middle of the band it was always the subject of. FloatingTasks owns the rails and
          draws nothing at all when the day holds no tasks. */}
      <FloatingTasks tasks={data.tasks} onToggle={toggleTask}>
        {/* items-center rather than a width: the caption is a sentence whose length changes
            through the day, and pinning it to the ring's 240px would wrap "10 of 12 ticked"
            onto a second line on exactly the days that have the most to say. */}
        <div className="flex flex-col items-center">
          {/* The figure CLIMBS from zero: 50 parts blocked hours, 50 parts non-negotiables.
              It is always a number now — a morning that has earned nothing reads 0, which is
              a true statement, where the old null-and-dash meant "nothing has come due" and
              had to be explained every time. Nothing here ever subtracts. */}
          <Ring fill={a.pct / 100} size={240} stroke={10} tone="accent" bloom>
            <div className="flex items-end">
              <span className="stat-hero text-hero">{a.pct}</span>
              <span className="stat-hero pb-2 text-body text-[var(--color-muted)]">%</span>
            </div>
          </Ring>
          {/* What the figure is MADE of, so the number is never a black box. Hours to one
              decimal — "3.5 of 8h" is the shape of a day; "3.4999" is noise. ONE line,
              centred under a centred ring. */}
          <p className="mt-3 text-center text-micro text-[var(--color-muted)]">
            {round1(a.workedHours)} of {round1(a.totalHours)}h blocked
            {a.habitsScheduled > 0 && (
              <>
                {" · "}
                {a.habitsDone} of {a.habitsScheduled} ticked
              </>
            )}
          </p>
          {a.unmarked > 0 && (
            <p className="mt-1 text-center text-micro text-[var(--color-ink)]">
              {a.unmarked} to mark
            </p>
          )}
        </div>
      </FloatingTasks>

      {/* THE BLOCKS, on the phone only. Desktop has them in their own window one column to
          the left; below `lg` there is no such column, and the spec puts the list here —
          above the checklist, under the ring — because that is the order the day is worked
          in. Two instances, one visible; see blocksPane. */}
      <div className="lg:hidden">{blocksPane}</div>

      {/* THE CHECKLIST, ACROSS THE WINDOW.

          It used to sit in a ~300px gutter beside a 176px ring, which is why it went to two
          columns in the first place. The ring is centred and the band above it is its own
          row now, so this runs the full width underneath — the same list, given the room it
          was always being squeezed out of.

          Calories and Steps live IN here, as rows of the list. The owner's ruling — they
          are things you do each day, and a second block underneath for two numbers was a
          second block to look at. The weight and calorie history that used to hang off
          these rows has moved to /stats; nothing here is a link any more.

          auto-fit rather than a breakpoint, and deliberately still auto-fit now that the
          block is wider: the window is ~717px on the owner's screen and 390px on the phone,
          and neither of those is a number this list should be told. minmax answers for
          itself — as many columns as the track minimum fits, one when there is room for
          one. */}
      <section>
        {/* The way into the editor — and into "Tomorrow, specifically". This used to
            exist only in the empty state, which meant that the moment you had habits
            there was no path to the screen that edits them. Quiet, right-aligned, the
            same word Goals uses. */}
        <div className="mb-1 flex justify-end">
          <Link
            href="/habits"
            className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            edit · tomorrow
          </Link>
        </div>
        {/* 20rem and a 20px gutter — RAISED from 9rem when the window went full width.
            auto-fit does not warn when the answer changes: at the old 308px column 9rem
            gave two, and at this window's ~717px the same 9rem silently gave FOUR, which
            squeezed the Steps and Calories rows (their figure pills wrapped under the
            label) and is not the two columns the layout was decided as. 20rem is chosen
            against both ends of the range rather than against the owner's screen alone:
            320px × 2 + the gutter is 660 and fits 717 with room, 3 would need 1000 and
            cannot happen at any width this window reaches, and the 358px phone falls to
            one. The track minimum is what carries the decision, so nothing here is told a
            viewport number.
            `min(20rem, 100%)` and not a bare 20rem: minmax's MINIMUM is a hard floor, so a
            single 20rem track stood 2px proud of the 318px phone pane and shoved the weight
            row's `kg` into the window's padding. The min() caps the floor at the box. */}
        <ul
          className="grid gap-x-5"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(min(20rem, 100%), 1fr))",
          }}
        >
          {data.habits.map((h) =>
            h.input === "number" ? (
              // A NUMERIC non-negotiable — weight. Typing the number IS the tick: the
              // entry exists or it does not, so adherence needs no special case, and
              // clearing the field clears the day exactly like unticking.
              // KEYED BY DAY AS WELL AS BY HABIT, and this one is load-bearing rather
              // than tidy. The number field below is UNCONTROLLED — `defaultValue`, so a
              // background refresh cannot yank a figure out from under a cursor — and
              // React only ever writes `defaultValue` to the value ATTRIBUTE, which the
              // browser ignores once the field has been typed into. With a key that is
              // the same on every day, stepping from today to yesterday left this
              // morning's 82.4 sitting in a row whose tick and label had already become
              // yesterday's; blurring it then POSTed 82.4 against yesterday and
              // overwrote a real reading. A key that carries the date makes the day
              // change a REMOUNT, which is the one thing that reliably re-seeds an
              // uncontrolled field.
              <li key={`${data.date}-${h.id}`} className={CHECK_ROW}>
                <div className="flex w-full items-center gap-2.5 py-2.5">
                  <HabitBox done={h.done} tone={habitTone(h.pillar)} />
                  {/* WEIGHT's name is the way into its trend — the same pattern the
                      Calories row set: the field logs, the row opens the record. Other
                      number habits keep the plain label; a control that opens nothing
                      must not dress as one. */}
                  {h.system_key === "weight" ? (
                    <button
                      onClick={() => setWeightOpen(true)}
                      aria-haspopup="dialog"
                      className={`min-w-0 flex-1 text-left font-serif text-small leading-snug underline-offset-4 transition-colors hover:underline ${h.done ? "text-[var(--color-muted)]" : ""}`}
                    >
                      {h.name}
                    </button>
                  ) : (
                    <label
                      htmlFor={`h${h.id}`}
                      className={`min-w-0 flex-1 font-serif text-small leading-snug ${h.done ? "text-[var(--color-muted)]" : ""}`}
                    >
                      {h.name}
                    </label>
                  )}
                  {/* The run STACKS above the field, the Steps row's arrangement — not
                      inline beside the label. This row carries a fixed-width control on
                      its right, and in a ~160px checklist column an inline flame left
                      the label's min-w-0 box narrower than its own word: a single word
                      cannot wrap, so "Weight" overflowed its span and the flame painted
                      over the glyphs. Only on a live day: the days you step back to are
                      precisely the unmarked ones. */}
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {back === 0 && <StreakFlame count={h.streak} />}
                    {/* A value written on a line, not typed into a chip. The underline
                        is the field; it darkens on focus rather than growing a box. */}
                    <span className="flex items-baseline gap-1">
                      <input
                        id={`h${h.id}`}
                        type="number"
                        step="0.1"
                        min="0"
                        inputMode="decimal"
                        placeholder="—"
                        defaultValue={h.value ?? ""}
                        onBlur={(e) => setHabitNumber(h.id, e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          (e.target as HTMLInputElement).blur()
                        }
                        className={NUM_FIELD}
                      />
                      {h.unit && (
                        <span className="text-micro text-[var(--color-muted)]">
                          {h.unit}
                        </span>
                      )}
                    </span>
                  </span>
                </div>
              </li>
            ) : (
              // Dated for the same reason as the numeric row above — these hold no
              // uncontrolled state, but one list must not be keyed two ways.
              <li
                key={`${data.date}-${h.id}`}
                className={`${CHECK_ROW} flex items-center gap-2`}
              >
                <button
                  onClick={() =>
                    // Two rows are not ticked, they are WRITTEN. The journal's opens the
                    // page picker — a page existing is what ticks it. A document habit
                    // (outreach, reading) opens its logger: ONE control, the owner's
                    // ruling, replacing the tick-plus-side-button pair — saving is what
                    // ticks, and unticking lives inside the dialog it opens.
                    h.system_key === "journal"
                      ? setJournalPrompt(true)
                      : h.system_key != null && DOC_HABITS[h.system_key]
                        ? setNoteHabit(h.id)
                        : toggleHabit(h.id, !h.done)
                  }
                  aria-pressed={
                    h.system_key === "journal" ||
                    (h.system_key != null && DOC_HABITS[h.system_key])
                      ? undefined
                      : h.done
                  }
                  aria-haspopup={
                    h.system_key != null && DOC_HABITS[h.system_key]
                      ? "dialog"
                      : undefined
                  }
                  className="-mx-2 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--color-bg)]"
                >
                  <HabitBox done={h.done} tone={habitTone(h.pillar)} />
                  {/* break-words: a name is usually several words and wraps on its own,
                      but a single word wider than the label's min-w-0 box would OVERFLOW
                      it and collide with the flame — the live-site bug the weight and
                      calorie rows hit. Wrapping mid-word is the honest fallback. */}
                  <span
                    className={`min-w-0 flex-1 break-words font-serif text-small leading-snug ${h.done ? "text-[var(--color-muted)]" : ""}`}
                  >
                    {h.name}
                  </span>
                  {/* The run, at the row's far edge. A fact, not a mechanic — see
                      StreakFlame — and only on a live day, for the app-wide streak's own
                      reason: the days you step back to are the unmarked ones. */}
                  {back === 0 && <StreakFlame count={h.streak} />}
                </button>
              </li>
            ),
          )}

          {/* ONE-OFF NON-NEGOTIABLES — "Tomorrow, specifically", arrived. Items of this
              day's checklist and its tally exactly like the standing ones; what differs
              is only that they exist on this one date, which the quiet suffix says.
              Accent, not a pillar hue — a one-off belongs to the day, not to a pillar. */}
          {data.oneOffs.map((o) => (
            <li
              key={`${data.date}-o${o.id}`}
              className={`${CHECK_ROW} flex items-center gap-2`}
            >
              <button
                onClick={() => toggleOneOff(o.id, !o.done)}
                aria-pressed={o.done}
                className="-mx-2 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--color-bg)]"
              >
                <HabitBox done={o.done} tone="var(--color-accent)" />
                <span
                  className={`min-w-0 flex-1 font-serif text-small leading-snug ${o.done ? "text-[var(--color-muted)]" : ""}`}
                >
                  {o.title}
                </span>
                <span className="shrink-0 text-micro text-[var(--color-muted)]">
                  one-off
                </span>
              </button>
            </li>
          ))}

          {/* CALORIES. A row of the checklist like any other, with the running total
              where a tick would be — because a total IS the state here, and a box you
              tick would be a second thing to remember once the number is already in. */}
          <li className={CHECK_ROW}>
            <CalorieInput
              date={data.date}
              today={today}
              calories={data.calories}
              entries={data.calorieEntries}
              // The LOG streak — days the total reached 2,000, deliberately below the
              // 2,500 floor: it counts logging the day, not eating enough. Hidden off
              // today with every other streak.
              streak={back === 0 ? data.calorieStreak : 0}
              // The Health tone, for the same reason the Steps box takes it (spec §5):
              // the box stopped hard-coding --color-physical so the owner's /colours
              // choice reaches it.
              tone={habitTone("physical")}
              onChanged={refresh}
            />
          </li>

          {/* STEPS, live from the phone. A FLOOR row like Calories: the box is dashed
              until 7,000 is reached — "not yet", never "failed" — and the count is the
              phone's own last push, read-only, because the phone is the instrument and
              a hand-typed step count would be a number nobody measured. "—" until the
              Shortcut has pushed today; never a zero the phone didn't say. */}
          <li className={CHECK_ROW}>
            <div className="flex items-center gap-2.5 py-2.5">
              {/* The HEALTH tone, resolved through habitTone like every other row, not
                  the raw --color-physical literal this used to hard-code (spec §5). The
                  token is only Health's DEFAULT; the owner may pick another hue at
                  /colours, and a row that reads the token directly would have been the
                  one box on the checklist that ignored the choice. */}
              <HabitBox
                done={(data.steps ?? 0) >= STEPS_FLOOR}
                pending
                tone={habitTone("physical")}
              />
              <span
                className={`min-w-0 flex-1 font-serif text-small leading-snug ${(data.steps ?? 0) >= STEPS_FLOOR ? "text-[var(--color-muted)]" : ""}`}
              >
                Steps
              </span>
              {/* THE COUNT, and its age beneath it — STACKED, not wrapped.
                  These columns are about 150px wide, which two pills side by side do not
                  fit into, and a flex-wrap would have dropped the age to a second line at
                  some widths and not others. Stacking it deliberately also says the right
                  thing: the number is the reading and the age is a fact ABOUT the reading,
                  which is a hierarchy and not two equal figures. */}
              <span className="flex shrink-0 flex-col items-end gap-1">
                {/* The run of floor days — every checklist row streaks now, the owner's
                    2026-08-24 ruling, revising the earlier no-steps-streak stance. It
                    heads this stacked column rather than sitting beside the label: the
                    count pill is the widest on the list, and in the two-column desktop
                    checklist a flame beside the label truncated the word "Steps".
                    Hidden off today with every other streak. */}
                {back === 0 && <StreakFlame count={data.stepsStreak} />}
                {/* The count IS the way into the trend — the same move the Calories row
                    makes with its total. A number you can only read is a number you
                    cannot ask a question of, and the question a step count raises is
                    always "is that normal for me", which one day cannot answer. */}
                <button
                  onClick={() => setStepsOpen(true)}
                  aria-haspopup="dialog"
                  // The name is BUILT FROM THE COUNT, not put in place of it. A bare
                  // aria-label replaces an element's contents in the accessible name, so
                  // labelling this "Open the step record" would have made the figure —
                  // which was plain text in the row until it became a control — the one
                  // number on the checklist a screen reader could not reach. The row's
                  // rule is that the count is always printed; printing it only in pixels
                  // is not printing it.
                  aria-label={`Steps ${
                    data.steps == null
                      ? "not pushed yet"
                      : data.steps.toLocaleString()
                  } of ${STEPS_FLOOR.toLocaleString()} — open the step record`}
                  className="rounded-full border border-[var(--color-line-strong)] px-2.5 py-1 text-small tabular-nums transition-colors hover:bg-[var(--color-panel)]"
                >
                  {data.steps == null ? (
                    <span className="text-[var(--color-muted)]">—</span>
                  ) : (
                    data.steps.toLocaleString()
                  )}
                  <span className="text-micro text-[var(--color-muted)]">
                    /{STEPS_FLOOR.toLocaleString()}
                  </span>
                </button>
                {/* How old that figure is — and on a phone, the way to go and fix it. The
                    count is printed directly above, so this carries the age alone: saying
                    "12,431" twice in one row would be the row arguing with itself about
                    which of the two is the reading. */}
                <StepsRefresh
                  updatedAt={data.stepsUpdatedAt}
                  // The Shortcut pushes to whatever day the SERVER calls today, so on a
                  // day stepped back to there is nothing this button could correctly do
                  // — it would write into a row that is not on screen. The age still
                  // prints; only the ask, and the staleness dressing, stand down.
                  live={back === 0}
                  onRun={() => {
                    stepsWanted.current = true;
                  }}
                />
              </span>
            </div>
          </li>

          {data.habits.length === 0 && data.oneOffs.length === 0 && (
            <li className="py-2.5 text-small leading-relaxed text-[var(--color-muted)]">
              Nothing set for {back === 0 ? "today" : shortDay(data.date)}.{" "}
              <Link
                href="/habits"
                className="text-[var(--color-ink)] underline decoration-[var(--color-line-strong)] underline-offset-4 transition-colors hover:decoration-[var(--color-accent)]"
              >
                Add some
              </Link>
              .
            </li>
          )}
        </ul>
      </section>

      {/* The JOURNAL'S MACHINERY, and nothing visible.

          The shelf of pages that sat here moved to /journal, kept by month — Today is
          where tonight's page gets written, and an archive at the foot of the acting
          screen was the looking-back job in the wrong place, the same split /stats
          draws. The panel stays mounted with the shelf off because it owns the chooser
          and the writing surface the checklist's Journal row opens, and the chooser now
          carries the way through to the archive. */}
      <JournalPanel
        date={data.date}
        entries={data.journal}
        onChanged={refresh}
        live={back === 0}
        prompt={journalPrompt}
        onPromptHandled={() => setJournalPrompt(false)}
      />

      {/* The document behind a non-negotiable, raised from its row. Mounted only while
          open, and keyed by habit so opening a second one cannot show the first one's text
          in a box that now claims to be about something else. */}
      {noteHabit != null &&
        (() => {
          const h = data.habits.find((x) => x.id === noteHabit);
          if (!h) return null;
          const cfg = DOC_HABITS[h.system_key ?? ""] ?? {
            placeholder: "What happened?",
          };
          return (
            <NoteLog
              key={`${data.date}-${h.id}`}
              name={h.name}
              date={data.date}
              note={h.note}
              hue={habitTone(h.pillar)}
              done={h.done}
              // value 1 is a bare tick, not "one page" — see setHabitNote. Above 1 it is
              // a number someone typed, so it seeds the field.
              pages={cfg.pagesLabel ? h.value : null}
              pagesLabel={cfg.pagesLabel}
              placeholder={cfg.placeholder}
              onSave={async (note, pages) => {
                await saveHabitNote(h.id, note, pages);
              }}
              onUntick={
                h.done
                  ? async () => {
                      await toggleHabit(h.id, false);
                    }
                  : undefined
              }
              onClose={() => setNoteHabit(null)}
            />
          );
        })()}

      {/* The weight trend, raised from the Weight row's name. Mounted only while open so
          its trends fetch never runs behind a closed checklist. */}
      {weightOpen && (
        <WeightLog
          date={data.date}
          today={today}
          onChanged={refresh}
          onClose={() => setWeightOpen(false)}
        />
      )}

      {/* The step trend, raised from the Steps row's count. Read-only — the phone is the
          only writer — so unlike the weight dialog it hands nothing back to refresh. */}
      {stepsOpen && (
        <StepsLog date={data.date} onClose={() => setStepsOpen(false)} />
      )}

      {/* ProductivityLog was mounted here, raised from a column of the week strip. The
          strip is gone and so is the score it drew (spec §3). The day's HOURS still open
          their workings — from the record's hours chart, which is the one place a breakdown
          of hours belongs now. */}
    </div>
  );

  const pillarPane = (
    <PillarSections
      health={health}
      career={career}
      colors={colors}
      workouts={workouts}
      goals={goals}
      tracker={tracker}
      date={data.date}
      today={today}
      onSubgoal={(id, done) =>
        mutateGoals(`/api/subgoals/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ done }),
        })
      }
      onGoalDone={onGoalDone}
      onGoalCount={onGoalCount}
      onSaveWorkout={saveWorkout}
      onDeleteWorkout={deleteWorkout}
      onOpenDay={goToDay}
      onOpenRecord={openRecord}
    />
  );

  // Every pane is ALWAYS mounted. On desktop both show and the tab is ignored; on the
  // phone the unselected pane sits in a grid collapsed to 0fr — see .pane-grid — which is
  // what lets both the opening AND the closing window animate to auto height.
  //
  // `lg:h-full` on both wrappers is LOAD-BEARING, not decoration. A percentage height
  // resolves against the parent's, and these divs sit between a window that has a
  // definite height (flex + items-stretch) and a column asking for `h-full`. Left at
  // auto they break the chain: the pillar column stops at its content and the ring
  // solver sizes every donut against a column that was never given the room.
  const pane = (t: PhoneTab, node: React.ReactNode) => (
    <div
      className="pane-grid lg:h-full"
      data-open={tab === t ? "" : undefined}
    >
      <div className="lg:h-full">{node}</div>
    </div>
  );

  /**
   * The phone's tab switch: flip the state, then bring the page back to the top. The
   * accordion keeps today → pillars order, so after a switch at most one collapsed bar
   * sits above the open window — the top IS where the content is. Without this, opening
   * Pillars from the bottom of a long Today leaves the viewport parked on empty space the
   * collapse just vacated.
   */
  const switchTab = (t: PhoneTab) => {
    setTab(t);
    if (!window.matchMedia("(min-width: 64rem)").matches)
      window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <PhoneSwipe tab={tab} onTab={switchTab}>
      {/* THE MASTHEAD. Full-bleed, one step darker than the windows below it, so the page
          reads as a document with a head rather than three panels adrift.
          Not sticky: on desktop the columns scroll inside the viewport so it never leaves
          anyway, and on mobile a sticky band plus the fixed tab bar would eat ~112px of a
          390px screen.
          Only ink and muted may appear here — --color-skipped measures 4.39:1 on this
          surface and fails, so no block-state chip belongs in the band. */}
      {/* The shell is a full-height flex column on DESKTOP only, where the columns fill
          what the masthead leaves. The phone scrolls as one page — the owner's ruling:
          the open window shows all of itself and never scrolls inside.
          overflow-hidden WHILE THE TIMELINE GESTURE LIVES: three windows translated
          110vh down would otherwise extend the page's scrollable overflow, and a
          scrollbar appearing for content that is deliberately out of sight is the move
          leaking. At rest the class is absent and nothing changes. */}
      <div
        className={`lg:flex lg:h-dvh lg:flex-col ${tl !== "closed" ? "overflow-hidden" : ""}`}
      >
        <div className="shrink-0 border-b border-[var(--color-line-strong)] bg-[var(--color-bar)]">
          {/* The title is CENTRED on the page, not on the space left over beside the
              link — hence a three-column grid with an empty cell mirroring the link. A
              flex row with one item pushed right would drift the title off centre by
              exactly half the link’s width. */}
          {/* FULL WIDTH. The `max-w-[92rem]` cap went with the three-window relayout (spec
              §4): the owner's screen is 1858px and the row underneath now spends all of it,
              so a masthead that stopped at 1472 would have sat inside its own page. */}
          <div className="mx-auto grid w-full grid-cols-[1fr_auto_1fr] items-baseline gap-4 px-6 py-5 sm:px-8">
            <span aria-hidden />
            {/* Serif because a page heading is the owner’s side of the Author Rule, and
                text-heading rather than text-hero — 52px is the adherence numeral and
                nothing else, and a masthead outsizing the hero would invert the
                hierarchy PRODUCT.md fixes. */}
            {/* THE BOOK, THEN THE CHAPTER. The fixed half names the app and the editable
                half names the month you are in — see ChapterName. `flex-wrap` because a
                long chapter name on a phone must wrap under the title rather than shrink
                the masthead's one heading below its type step. */}
            <h1 className="flex flex-wrap items-baseline justify-center gap-x-2 text-center font-serif text-heading">
              <span>The Book of Nero:</span>
              <ChapterName
                month={data.date.slice(0, 7)}
                name={chapters[data.date.slice(0, 7)] ?? null}
                onSaved={setChapters}
              />
            </h1>
            {/* The date lives on the middle window now, above the ring, where it belongs
                to the day rather than to the app. */}
            <Link
              href="/colours"
              className="justify-self-end text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
            >
              colours
            </Link>
          </div>
        </div>

        {/* pb-24 on the phone clears the fixed tab bar at the end of the page's own
            scroll; the desktop column height machinery is all lg-scoped.
            `relative` so the timeline layer can fill exactly this region — the space
            under the masthead — and the min-height holds that region open on the phone
            once the fallen row leaves the layout (display:none takes its height with
            it; on desktop flex-1 already owns the height). */}
        <div
          className={`relative mx-auto w-full px-4 pb-24 pt-4 sm:px-8 lg:min-h-0 lg:flex-1 lg:px-6 lg:pb-6 lg:pt-6 ${
            tl !== "closed" ? "min-h-[calc(100dvh-9rem)]" : ""
          }`}
        >
          {/* THE TIMELINE, on the page ground behind the windows. Mounted only while the
              gesture lives, positioned BEFORE the row so the falling windows — positioned,
              later in the document — paint over it on the way down. The return bar rides
              inside the layer, fixed to the viewport's foot. */}
          {tl !== "closed" && (
            <div
              className="tl-layer"
              data-shown={tl === "falling" || tl === "open" ? "" : undefined}
            >
              <Timeline
                today={today}
                goals={goals}
                onGoalDone={onGoalDone}
              />
              <button
                type="button"
                onClick={closeTimeline}
                className="fixed bottom-5 left-1/2 z-[var(--z-sticky)] -translate-x-1/2 whitespace-nowrap rounded-full border border-[var(--color-line-strong)] bg-[var(--color-panel)] px-5 py-2 text-micro font-semibold tracking-[0.14em] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
              >
                RETURN TO DASHBOARD
              </button>
            </div>
          )}
          {/* Source order is today → blocks → pillars, which IS the stacked mobile order,
            so the phone needs no reordering and the day's work leads the document. Desktop
            only moves the windows spatially.
            Three WINDOWS, each on its own surface with a hairline and a gutter of page
            ground between them. Their tones differ by only 1.03–1.07:1 — the hairline and
            the gutter do the separating; the tone just says which one you are in. */}
          {/* FLEX, not grid, and the change is what makes the record open at all.
              A grid's tracks are `minmax(15rem, 1fr)` — two values that do not interpolate
              into a rail width, so opening the record could only ever have been a jump or an
              overlay. As flex items the same three shares are `flex: <n> 1 0%`, which IS
              interpolable: the row keeps summing to itself at every frame of the move, so the
              record window grows by exactly what the other two give up and no gap opens.
              The shares are 1 / 1.7 / 1.25 now, measured against the owner's 1858px window
              (spec §4): ≈450 / 765 / 563, which is what puts a 240px ring with a task rail
              either side inside the middle one and two 200px donuts side by side in the
              right. Today took width from the other two because it is the only window whose
              contents are laid out ACROSS rather than down. */}
          <div
            // Order is blocks → today → pillars in both worlds — one set of order
            // classes, no lg: fork. Height is desktop's concern only: the phone column
            // is as tall as its content, and the page scrolls it.
            className={`panel-row relative flex flex-col gap-3 lg:h-full lg:min-h-0 lg:flex-row lg:items-stretch lg:gap-4 ${
              tl === "open" ? "hidden" : ""
            }`}
            data-record={recordGeom ? "" : undefined}
            // Beat one, both directions: intent and geometry disagree, so contents leave.
            data-exiting={recordOpen !== recordGeom ? "" : undefined}
            // The fall. Present through `prep` as well — the return's one painted frame
            // must still hold the windows translated, or they snap home instead of
            // travelling (see the timeline state machine above).
            data-timeline={
              tl === "falling" || tl === "open" || tl === "prep" ? "" : undefined
            }
          >
            {/* THE RAIL'S LABEL, and the way back out.
                A CHILD OF THE ROW, not of the leftmost window it sits over. That window is a
                scroll container, and an absolutely positioned child of a scroll container
                scrolls with the CONTENT — when the calendar column lived there and opened
                scrolled to centre today, this word was laid out hundreds of pixels above the
                visible rail and off the screen. The row never scrolls, so anchoring here
                fixes it at the source rather than compensating for an offset that changes as
                the window is read.

                Desktop only: the phone shows one pane at a time, so there is nothing there
                for a rail to be the remains of — the record's own × closes it instead. */}
            <button
              type="button"
              onClick={() => setRecordOpen(false)}
              aria-label="Back to the three windows"
              aria-expanded={recordOpen}
              className="rail-label hidden text-micro font-semibold text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)] lg:flex"
            >
              <span>DASHBOARD</span>
            </button>

            <div
              data-panel="today"
              data-open={tab === "today" ? "" : undefined}
              style={{ "--panel-grow": 1.7, "--panel-min": "26rem" } as CSSProperties}
              className={`panel window order-2 bg-[var(--color-surface-1)] p-5 lg:p-6 ${colScroll}`}
            >
              {/* THE COLLAPSED BAR, phone only: the window's own title as the way into
                  it. The whole bar is the target; tapping it grows this window and
                  shrinks the open one in the same motion. Hidden while open — the
                  content is its own title then. */}
              <button
                type="button"
                onClick={() => switchTab("today")}
                className={`w-full items-baseline justify-between text-left lg:hidden ${tab === "today" ? "hidden" : "flex"}`}
              >
                <span className="text-small font-semibold">Today</span>
                <span aria-hidden className="text-micro text-[var(--color-muted)]">
                  open
                </span>
              </button>
              <div className="panel-fade lg:h-full">{pane("today", middle)}</div>
            </div>

            {/* THE BLOCKS WINDOW, DESKTOP ONLY — `hidden lg:flex`, and therefore the one
                window with no collapsed phone bar and no pane of its own. Below `lg` its
                contents are rendered a second time inside Today, above the checklist (spec
                §4), which is where a hand marking a block already is.
                `data-open` is deliberately never set: this window has no phone pane for the
                accordion to open, and stating that is cheaper than leaving the next reader to
                notice the attribute missing. */}
            <div
              data-panel="blocks"
              data-open={undefined}
              style={{ "--panel-grow": 1, "--panel-min": "15rem" } as CSSProperties}
              className={`panel window order-1 hidden bg-[var(--color-surface-2)] p-5 lg:flex lg:flex-col lg:p-6 ${colScroll}`}
            >
              <div className="panel-fade lg:h-full">{blocksPane}</div>
            </div>

            <div
              ref={pillarPanel}
              data-panel="pillars"
              data-open={tab === "pillars" ? "" : undefined}
              style={{ "--panel-grow": 1.25, "--panel-min": "17rem" } as CSSProperties}
              className={`panel window order-3 bg-[var(--color-surface-3)] p-5 lg:p-6 ${colScroll}`}
            >
              <button
                type="button"
                onClick={() => switchTab("pillars")}
                className={`w-full items-baseline justify-between text-left lg:hidden ${tab === "pillars" ? "hidden" : "flex"}`}
              >
                <span className="text-small font-semibold">Pillars</span>
                <span aria-hidden className="text-micro text-[var(--color-muted)]">
                  open
                </span>
              </button>
              {/* The record is rendered IN this window rather than over the page, so the
                  window's own border, radius and page margin are never lost — it is the same
                  window, wider. Three beats, not a cross-fade: the outgoing pane leaves in
                  beat one (`.panel-swap`, on the row's data-exiting), the window travels in
                  beat two, and the incoming pane — KEYED, so it genuinely remounts — arrives
                  in beat three on `.pane-enter`'s delayed entrance. Mounted only while
                  shown, so the record's fetches never run behind the pillars and the
                  pillars' never run behind the record. */}
              <div className="panel-swap lg:h-full">
                <div
                  key={recordGeom ? "record" : "pillars"}
                  className="pane-enter lg:h-full"
                >
                  {recordGeom ? (
                    <Dashboard
                      date={data.date}
                      today={today}
                      onClose={() => setRecordOpen(false)}
                    />
                  ) : (
                    pane("pillars", pillarPane)
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The record used to be mounted HERE, as a fixed overlay covering the page. On
          desktop it now lives inside the pillar window itself — see the panel row above.
          On the PHONE the overlay is back for one job only: the moment of travel. It
          expands from the pillars window to the whole screen while the route changes
          underneath it, so /stats appears exactly where the expansion lands. */}
      {phoneExpand && (
        <div
          aria-hidden
          className="phone-expand lg:hidden"
          style={{ ["--expand-from" as string]: phoneExpand }}
        />
      )}
    </PhoneSwipe>
  );
}
