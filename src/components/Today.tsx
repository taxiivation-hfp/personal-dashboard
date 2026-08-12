"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BlockList from "./BlockList";
import CalorieInput from "./CalorieInput";
import HabitBox from "./HabitBox";
import NextUp from "./NextUp";
import WeightLog from "./WeightLog";
import StepsLog from "./StepsLog";
import StepsRefresh from "./StepsRefresh";
import ProductivityLog from "./ProductivityLog";
import Dashboard from "./Dashboard";
import JournalPanel from "./JournalPanel";
import CoachNote from "./CoachNote";
import CalendarColumn from "./CalendarColumn";
import PillarSections from "./PillarSections";
import Ring, { toneColor } from "./PillarRing";
import { PhoneTabBar, PhoneSwipe, type PhoneTab } from "./PhoneTabs";
import type { Workout } from "./WorkoutLog";
import { addDays, daysBetween, prettyDate, todayISO } from "@/lib/dates";
import { projectedColour, SLAB_GYM, SLAB_NEUTRAL } from "@/lib/eventColor";
import { CALENDAR_RATES, type ProductivitySegment } from "@/lib/productivity";
import type {
  DayView,
  GoalView,
  SkillView,
  SkillSlice,
  PillarKey,
} from "@/lib/queries";
import { STEPS_FLOOR } from "@/lib/rings";
import type {
  PillarFactInput,
  PillarRingView,
  WorkoutKind,
} from "@/lib/rings";

type StripDay = {
  date: string;
  /** 0-100, and it only ever climbs through the day. Never null — see adherence.ts. */
  pct: number;
  isToday: boolean;
  /** Hours SPENT, uncapped. null when the calendar is unreachable — see CLAUDE.md's
   *  Productivity section; it is a quarantined exception, not a second adherence. */
  productivity: { points: number; segments: ProductivitySegment[] } | null;
};

// `isFuture` and `title` are still returned by /api/adherence and deliberately NOT declared
// here. The strip ends on the day being viewed, so no day on it can be future; and the days
// ahead are no longer named from this screen. Leaving the fields in the type would invite the
// next reader to branch on one that is always false.

/**
 * The gap between the week's columns, as a PERCENTAGE of the row.
 *
 * Four separate rows have to line up over each other — the percentages, the adherence bars,
 * the productivity columns and the weekday letters. A percentage gap keeps them aligned at
 * every width by construction; a px gap only agrees with itself, which is fine, but it made
 * the earlier SVG overlay drift because that was drawn in a stretched 0-100 box. The overlay
 * is gone and the percentage stayed: it costs nothing and removes a whole class of drift.
 */
const STRIP_GAP_PCT = 2;

/**
 * The stack, bottom-up, in the fill each slab is drawn with.
 *
 * Blocked time keeps the colour it had in the calendar. Logged training takes SLAB_GYM —
 * the hue gym already wears here, free now that Grape has left the rate table. The ticked
 * things go grey, because there is no calendar colour behind a non-negotiable for a hue to
 * mean.
 */
const slabFill = (s: ProductivitySegment): string =>
  s.kind === "sessions"
    ? SLAB_GYM
    : s.kind === "time"
      ? (projectedColour(s.colorId) ?? SLAB_NEUTRAL)
      : SLAB_NEUTRAL;

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

export default function Today({
  initial,
  today: serverToday,
  goals: initialGoals,
  skills: initialSkills,
}: {
  initial: DayView;
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
  skills: SkillView[];
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
  const [strip, setStrip] = useState<StripDay[]>([]);
  // Goals, skills and rings are OWNED here rather than left as server props. page.tsx
  // renders once per request, so every new control (subgoal tick, +15/+30/+60, gym
  // toggle) would otherwise mutate data the screen could not re-read without a full
  // navigation.
  const [goals, setGoals] = useState<GoalView[]>(initialGoals);
  const [skills, setSkills] = useState<SkillView[]>(initialSkills);
  const [rings, setRings] = useState<PillarRingView[] | null>(null);
  /** The raw fortnight printed under each pillar's name. Separate from `rings` because it
   *  is a different kind of statement — see pillarCaption. */
  const [facts, setFacts] = useState<PillarFactInput | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  /** The fortnight's ADHERED graphite events — the Social ring's inner band and its
   *  drill-down. null until /api/rings lands or when the calendar could not be reached. */
  const [socialEvents, setSocialEvents] = useState<
    { date: string; title: string }[] | null
  >(null);
  /** The adhered ONE-OFF social events — the Social ring's mid band. Same graphite as
   *  the standing ones; what separates them is that these do not repeat. */
  const [oneOffEvents, setOneOffEvents] = useState<
    { date: string; title: string }[] | null
  >(null);
  /** Per-skill sessions in the window — the Portfolio ring's segments. */
  const [skills14, setSkills14] = useState<SkillSlice[] | null>(null);
  // Phone only: which of the three panes is showing. Opens on the day's work, and a
  // reload returns there rather than wherever you last wandered.
  const [tab, setTab] = useState<PhoneTab>("today");
  // Naming TODAY. The days ahead used to be nameable inline on the strip; the strip now
  // ends on today and holds none of them, so only today's intention is set from this screen.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  // Raised by the Journal row in the checklist — the journal is written, not ticked.
  const [journalPrompt, setJournalPrompt] = useState(false);
  /** The weight trend dialog, raised from the Weight row's name. */
  const [weightOpen, setWeightOpen] = useState(false);
  /** The step trend dialog, raised from the Steps row's count. */
  const [stepsOpen, setStepsOpen] = useState(false);
  /** Which day's productivity workings are open, raised from a column of the week strip.
   *  Any day on the strip, including the one on screen — a score explains itself whether
   *  or not you are standing on it. */
  const [scoreDay, setScoreDay] = useState<string | null>(null);
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
   * ENDS ON TODAY — always, whatever day the screen is showing. There is no future half:
   * the calendar column says what tomorrow holds, and a strip that reserved three columns
   * for it spent a third of its width on days that had not happened. A consequence worth
   * knowing — no day on this strip is ever `isFuture`, which is why nothing below branches
   * on it.
   *
   * Anchored to TODAY and not to the viewed day, which matters now that those can differ.
   * A strip that travelled with the screen could only ever be walked backwards — the way
   * forward would be off its right-hand edge — and it would rescale its columns against a
   * different week's high at every step. Fixed, it is a ruler: the last seven days, one of
   * them underlined as the one you are on, and any of them a tap away.
   */
  const loadStrip = useCallback(() => {
    fetch(`/api/adherence?days=7&to=${today}`)
      .then((r) => r.json())
      .then((s) => !s.error && setStrip(s.days ?? []))
      .catch(() => {});
  }, [today]);

  const loadRings = useCallback(() => {
    const asked = data.date;
    fetch(`/api/rings?date=${asked}`)
      .then((r) => r.json())
      .then((s) => {
        if (s.error || viewing.current !== asked) return;
        setRings(s.pillars ?? []);
        setFacts(s.facts ?? null);
        setWorkouts(s.workouts ?? []);
        // undefined on a calendar failure, and passed through as such — the Events
        // drill-down says "unavailable" rather than showing an empty fortnight.
        setSocialEvents(s.socialEventList ?? null);
        setOneOffEvents(s.oneOffEventList ?? null);
        setSkills14(s.skills14 ?? null);
      })
      .catch(() => {});
  }, [data.date]);

  const refresh = useCallback(async () => {
    const d = await fetch(`/api/today?date=${data.date}`).then((r) => r.json());
    // Applied only if it is still the day on screen. `d.date` is the server's own answer,
    // so this compares what arrived against what is being asked — never two guesses.
    if (!d.error) setData((cur) => (d.date === cur.date ? d : cur));
    loadStrip();
    loadRings();
  }, [data.date, loadStrip, loadRings]);

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
   * NEVER PAST TODAY. There is nothing to log about a day that has not happened, and the
   * calendar column already says what tomorrow holds.
   */
  const [moving, setMoving] = useState<string | null>(null);
  const goToDay = useCallback(
    async (iso: string) => {
      if (iso === data.date || iso > today || moving) return;
      setMoving(iso);
      // Skills travel with the day: their 14-day figures are anchored to the date being
      // VIEWED (see listSkills), so a screen on last Tuesday must read the fortnight that
      // ended then. Fetched alongside rather than after, so the two land together.
      const [d, s] = await Promise.all([
        fetch(`/api/today?date=${iso}`)
          .then((r) => r.json())
          .catch(() => ({ error: true })),
        fetch(`/api/skills?date=${iso}`)
          .then((r) => r.json())
          .catch(() => ({ error: true })),
      ]);
      if (!d.error) {
        setData(d);
        if (!s.error) setSkills(s.skills ?? []);
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

  useEffect(loadStrip, [loadStrip]);
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
   * Nothing here touches adherence, the strip or the rings. A step count feeds the Physical
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
    await fetch("/api/habits/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ habit_id: id, date: data.date, done }),
    });
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

  async function mutateSkills(url: string, init: RequestInit) {
    const r = await fetch(url, {
      headers: { "content-type": "application/json" },
      ...init,
    })
      .then((x) => x.json())
      .catch(() => ({ error: true }));
    if (!r.error && r.skills) setSkills(r.skills);
    loadRings(); // a skill session feeds the Portfolio ring
  }

  /** Tick or untick a one-off task. The tick belongs to the day on screen. */
  async function toggleTask(id: number, done: boolean) {
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
   * The week's one piece of arithmetic: how tall the tallest column is.
   *
   * Productivity is UNCAPPED, so there is no ceiling to scale against and it is scaled to
   * the week's own high — the caption says so out loud, since a shape whose scale is
   * unstated is a shape that lies.
   *
   * Adherence needs nothing here. It is a percentage, so its scale is fixed 0..100 and its
   * bar is just the number drawn. That asymmetry is the reason the two are no longer sharing
   * a box: one of them has an axis and the other cannot have one.
   */
  /** 1 keeps the maths safe before the fetch lands, when there are no bars to draw. */
  const peak = Math.max(1, ...strip.map((d) => d.productivity?.points ?? 0));

  /**
   * A key for the stack, built from what the visible week actually contains.
   *
   * Derived rather than declared, so it can never list a colour that isn't on screen — a
   * legend naming four things when three are drawn is worse than none. It is also the only
   * place the grey slabs are named at all; a hue borrowed from the calendar explains
   * itself, and a grey one cannot.
   *
   * Ordered by the registry rather than by first appearance, so it does not reshuffle
   * itself when the week's composition changes.
   */
  const stackKey = (() => {
    const seen = new Map<string, { label: string; rank: number }>();
    for (const d of strip)
      for (const s of d.productivity?.segments ?? []) {
        const fill = slabFill(s);
        if (seen.has(fill)) continue;
        if (s.kind === "time") {
          const i = CALENDAR_RATES.findIndex((c) => c.id === s.colorId);
          seen.set(fill, {
            label: CALENDAR_RATES[i]?.label ?? "Other",
            rank: i < 0 ? CALENDAR_RATES.length : i,
          });
        } else {
          // After every calendar colour: the hours came first, and these two are the
          // things in the bar that were not hours. Gym before the ticks, matching the
          // order they are stacked in.
          seen.set(fill, {
            label: s.kind === "sessions" ? "Gym" : "Non-negotiables",
            rank: CALENDAR_RATES.length + (s.kind === "sessions" ? 1 : 2),
          });
        }
      }
    return [...seen]
      .map(([fill, v]) => ({ fill, ...v }))
      .sort((x, y) => x.rank - y.rank);
  })();
  // Straight off DayView.pillars — no extra request for something already loaded.
  const colors = Object.fromEntries(
    data.pillars.map((p) => [p.key, p.color]),
  ) as Partial<Record<PillarKey, string | null>>;

  /** The tick / fill for a non-negotiable, in its pillar's hue. Unassigned habits stay
   *  amber. Extracted to a local so the two habit shapes below can't drift apart. */
  const habitTone = (pillar: PillarKey | null | undefined) =>
    pillar ? toneColor(pillar, colors[pillar]) : "var(--color-accent)";

  const middle = (
    <div className="flex flex-col gap-10">
      {/* THE DAY. Date first and small — orienting meta, not a headline — then what you
          INTEND the day to be, in your own words. The intention is deliberately connected
          to nothing: it feeds no rate, no ring and no score, because the moment naming a
          day becomes something you can fail at, it stops being a plan. */}
      {/* CARDS now, not bare type on the window — the owner asked this screen for more
          structure and weight, and the record's card is the house word for it: the day's
          name in one card, the next thing that will happen in its own beside it. Same
          smaller-pane-of-the-same-glass the chart cards established. */}
      {/* CATCHING UP.

          The one piece of furniture the backdating feature adds, and it stands only while
          the screen is showing a day that is not today. It says the mechanism out loud —
          what you mark here lands on THAT day — because every control below it looks
          exactly as it does on a live day, which is the whole point and also the whole
          risk. A tick is cheap to make and expensive to make against the wrong date.

          --color-recorded is the token the calendar column already gives a past day, so a
          screen in the past wears the colour the app has always used to mean "recorded".
          No warning hue and no alarm: catching up is the feature working, not a mistake. */}
      {back > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-recorded)] px-4 py-2.5">
          <p className="min-w-0 text-small leading-snug">
            <span className="font-semibold">Catching up.</span>{" "}
            <span className="text-[var(--color-muted)]">
              Everything marked here lands on {prettyDate(data.date)} —{" "}
              {back} day{back === 1 ? "" : "s"} back.
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

      <header className="flex flex-wrap items-stretch gap-4">
        <div className="record-card min-w-0 flex-1">
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
                // happened, and the calendar column is what says what tomorrow holds.
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
        </div>

        {/* NextUp wears its own card and returns null when there is nothing next, so no
            empty frame ever stands here at 11pm — or on any day but today. */}
        <NextUp blocks={data.blocks} date={data.date} today={today} />
      </header>

      {/* THE HERO. The ring keeps the left side to itself and stays the largest thing on
          the screen; the checklist sits beside it deliberately quieter, because the number
          is the answer and the list is the work. */}
      <section className="flex flex-wrap items-start gap-x-9 gap-y-7">
        <div className="shrink-0">
          {/* The figure CLIMBS from zero: 70 parts blocked hours, 30 parts non-negotiables.
              It is always a number now — a morning that has earned nothing reads 0, which is
              a true statement, where the old null-and-dash meant "nothing has come due" and
              had to be explained every time. Nothing here ever subtracts. */}
          <Ring fill={a.pct / 100} size={176} stroke={8} tone="accent" bloom>
            <div className="flex items-end">
              <span className="stat-hero text-hero">{a.pct}</span>
              <span className="stat-hero pb-2 text-body text-[var(--color-muted)]">%</span>
            </div>
          </Ring>
          <p className="mt-3 max-w-[11rem] text-micro text-[var(--color-muted)]">
            {/* What the figure is MADE of, so the number is never a black box. Hours to one
                decimal — "3.5 of 8h" is the shape of a day; "3.4999" is noise. */}
            {round1(a.adheredHours)} of {round1(a.totalHours)}h blocked
            {a.habitsScheduled > 0 && (
              <>
                {" · "}
                {a.habitsDone} of {a.habitsScheduled} ticked
              </>
            )}
            {a.unmarked > 0 && (
              <span className="mt-1 block text-[var(--color-ink)]">
                {a.unmarked} to mark
              </span>
            )}
          </p>
        </div>

        {/* THE CHECKLIST, in TWO COLUMNS.

            One column ran the block well past the bottom of the 176px ring and left the row
            looking like a ring with a list falling off it. Two columns halve the height and
            put the whole day's list inside the ring's own bounds, which is what makes the
            row read as one object rather than two stacked ones.

            Calories and Steps live IN here, as rows of the list. The owner's ruling — they
            are things you do each day, and a second block underneath for two numbers was a
            second block to look at. The weight and calorie history that used to hang off
            these rows has moved to /stats; nothing here is a link any more.

            auto-fit rather than a breakpoint: the column this sits in is 178px wide beside
            the ring on a wide screen and the full 390px below it when it wraps, and neither
            of those is a viewport width. minmax lets the grid answer for itself — two
            columns when there is room for two, one when there is not. */}
        <div className="min-w-[15rem] flex-1">
          {/* The way into the editor — and into "Tomorrow, specifically". This used to
              exist only in the empty state, which meant that the moment you had habits
              there was no path to the screen that edits them. Quiet, right-aligned, the
              same word Goals and Skills use. */}
          <div className="mb-1 flex justify-end">
            <Link
              href="/habits"
              className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
            >
              edit · tomorrow
            </Link>
          </div>
          {/* 9rem and a 20px gutter, which is what makes two columns land at 308px — the
              width this block actually gets beside the ring. At 10.5rem it needed 364px and
              silently stayed one column, which is the failure mode of auto-fit: it does not
              warn, it just gives you back what you already had. Below ~308px it drops to one
              column on its own, which is the right answer on a narrow phone. */}
          <ul
            className="grid gap-x-5"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
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
                    {/* A value written on a line, not typed into a chip. The underline is
                        the field; it darkens on focus rather than growing a box. */}
                    <span className="flex shrink-0 items-baseline gap-1">
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
                  </div>
                </li>
              ) : (
                // Dated for the same reason as the numeric row above — these hold no
                // uncontrolled state, but one list must not be keyed two ways.
                <li key={`${data.date}-${h.id}`} className={CHECK_ROW}>
                  <button
                    onClick={() =>
                      // The journal is not a thing you tick, it is a thing you write. Its
                      // row opens the page picker instead of toggling, and the tick follows
                      // from saving a page — the only honest signal that one exists.
                      h.system_key === "journal"
                        ? setJournalPrompt(true)
                        : toggleHabit(h.id, !h.done)
                    }
                    aria-pressed={
                      h.system_key === "journal" ? undefined : h.done
                    }
                    className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--color-bg)]"
                  >
                    <HabitBox done={h.done} tone={habitTone(h.pillar)} />
                    <span
                      className={`min-w-0 font-serif text-small leading-snug ${h.done ? "text-[var(--color-muted)]" : ""}`}
                    >
                      {h.name}
                    </span>
                  </button>
                </li>
              ),
            )}

            {/* CALORIES. A row of the checklist like any other, with the running total
                where a tick would be — because a total IS the state here, and a box you
                tick would be a second thing to remember once the number is already in. */}
            <li className={CHECK_ROW}>
              <CalorieInput
                date={data.date}
                today={today}
                calories={data.calories}
                entries={data.calorieEntries}
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
                <HabitBox
                  done={(data.steps ?? 0) >= STEPS_FLOOR}
                  pending
                  tone="var(--color-physical)"
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

            {data.habits.length === 0 && (
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

          {/* TASKS — one-off things, and the one list here that is NOT scored.

              Below the checklist and under its own rule, because it is a different kind of
              thing: the list above is the standing daily minimum and carries the day's 30
              points; these are single decisions that carry themselves forward until done.
              Mixing them would have meant a backlog you never cleared quietly lowering what
              every non-negotiable was worth — see src/lib/tasks.ts.

              The label says "not scored" out loud rather than leaving it to be discovered.
              A list that looks like the scored one and isn't is worse than no list. */}
          {data.tasks.length > 0 && (
            <div className="mt-5 border-t border-[var(--color-line-strong)] pt-3">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="text-micro text-[var(--color-muted)]">
                  tasks · carry over, not scored
                </span>
                <Link
                  href="/habits"
                  className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                >
                  add
                </Link>
              </div>
              <ul>
                {data.tasks.map((t) => (
                  <li key={t.id} className={CHECK_ROW}>
                    <button
                      onClick={() => toggleTask(t.id, !t.done)}
                      aria-pressed={t.done}
                      className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--color-bg)]"
                    >
                      {/* The checklist's own box, in ink rather than a pillar hue — a task
                          belongs to no pillar, and borrowing one would file it under a
                          category it does not feed. */}
                      <span className="mt-0.5">
                        <HabitBox done={t.done} tone="var(--color-ink)" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block font-serif text-small leading-snug ${t.done ? "text-[var(--color-muted)] line-through decoration-[var(--color-line-strong)]" : ""}`}
                        >
                          {t.title}
                        </span>
                        {/* How long it has waited, stated plainly. No red, no "overdue",
                            no escalating weight — the honest-logging rule covers this list
                            too, and a list that starts scolding is one you stop writing to. */}
                        {!t.done && t.carried > 0 && (
                          <span className="mt-0.5 block text-micro text-[var(--color-muted)]">
                            carried {t.carried} day{t.carried === 1 ? "" : "s"}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* THE WEEK — two measurements, two rows, and deliberately no shared axis.

          Adherence is a thin horizontal bar per day, filling left to right in the accent.
          Productivity is the column beneath it, stacked in the colours those hours had in
          the calendar. They used to share one box with adherence drawn as a line over the
          bars; separating them says plainly that they are two different questions, and it
          stops a reader trying to compare a percentage against an uncapped score.

          The window ENDS ON TODAY. There is no future half any more — the calendar column
          is what says what tomorrow holds, and a week strip that reserved three empty
          columns for it was spending a third of its width on nothing.

          A CARD, like the record's charts — the owner's ask for weight and structure on
          this screen. The strip is this screen's one chart, so it wears the chart's frame. */}
      <section className="record-card">
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          {/* Two facts a reader cannot infer, and nothing else. "adherence" left this line
              long ago — it prints its own number above its own bar, and naming it here
              would be the third time. What is left is the columns' SCALE, which is
              uncapped and therefore has to be stated, and the one thing about this chart
              that is invisible: that a column will explain itself. */}
          <span className="text-micro text-[var(--color-muted)]">
            seven days to today · hours to this week&apos;s high · tap a day for
            its workings
          </span>
          {/* TODAY ONLY. The streak comes from the VIEWED day's DayView — getStreak counts
              the run ending on whatever day was asked for — and this card is anchored to
              today. Printed on a past day it would quietly swap today's run for a different
              one, and worse: the days you step back to are the ones with nothing marked on
              them yet, so the number you would see is almost always 0. A card captioned
              "seven days to today" must not carry another day's fact.

              A count, deliberately undramatised — no flame, no badge, no "don't break it".
              A fact about the record, not a thing you can lose. */}
          {back === 0 && data.streak > 0 && (
            <span className="text-micro text-[var(--color-muted)]">
              {data.streak} day{data.streak === 1 ? "" : "s"} logged in a row
            </span>
          )}
        </div>

        {/* TAPPING A COLUMN OPENS ITS WORKINGS, not the day.

            The column is a SCORE, so the question a finger asks of it is "why is it that
            tall" — and that question had no answer anywhere in the app: the strip prints no
            productivity number by design, so a day that felt busy and drew a stub was a
            mystery with nothing to read. The breakdown is that answer, and it carries the
            half the bar cannot draw at all: the hours that scored NOTHING, and why.

            Navigating to the day lives on the date line's arrows instead, and inside this
            sheet as a quiet link — the commonest thing the workings make you want to do is
            go and mark the block that did not count.

            The target is ONE TRANSPARENT BUTTON PER COLUMN, laid over all four rows rather
            than built into any of them. The four rows have to line up over each other and
            they do it with a percentage gap — see STRIP_GAP_PCT — so turning one of them
            into a row of controls would have made that row a different height from its
            neighbours and pulled the alignment apart. An overlay takes the same gap, so it
            covers exactly the columns it names, and nothing underneath it is interactive
            for it to steal a click from. */}
        <div className="relative">
          <div
            className="absolute inset-0 z-[1] flex"
            style={{ gap: `${STRIP_GAP_PCT}%` }}
          >
            {strip.map((d) => (
              <button
                key={d.date}
                onClick={() => setScoreDay(d.date)}
                aria-haspopup="dialog"
                aria-current={d.date === data.date ? "date" : undefined}
                aria-label={`${prettyDate(d.date)} · ${d.pct}% adhered — see how the day scored`}
                // No hover fill and no ring: the columns beneath carry three ink levels
                // and a stack of calendar colours, and any wash over them would tint a
                // chart made of colours. The cursor is the whole affordance on a laptop,
                // and on a phone the caption above says it in words.
                className="min-w-0 flex-1 rounded-sm outline-offset-2 disabled:cursor-default"
              />
            ))}
          </div>

          {/* ADHERENCE. The number and its bar are one unit — the bar is the number drawn,
              not a second measurement — so they sit together above the rule with the columns
              below it. Productivity gets no number at all: its height is the whole claim, and
              an uncapped score printed with no ceiling beside it invites a comparison it
              cannot support. */}
          <div className="flex" style={{ gap: `${STRIP_GAP_PCT}%` }}>
          {strip.map((d) => (
            <span
              key={d.date}
              className="min-w-0 flex-1 text-center text-micro tabular-nums"
              style={{
                color: d.isToday ? "var(--color-ink)" : "var(--color-muted)",
              }}
            >
              {d.pct}%
            </span>
          ))}
        </div>

        <div className="mt-1 flex" style={{ gap: `${STRIP_GAP_PCT}%` }}>
          {strip.map((d) => (
            <div
              key={d.date}
              className="h-[3px] min-w-0 flex-1 overflow-hidden"
              // --color-line-strong, not --color-line: a 0% day must still draw a bar. Against
              // the column's #fffdf9 surface, line-strong measures 1.68:1 and line only 1.36:1,
              // which at 3px tall is the difference between an empty bar and no bar. It is the
              // same swap the ring track already made, for the same reason.
              style={{ background: "var(--color-line-strong)" }}
            >
              {/* SQUARE ends, no rounding — the butt-cap rule, applied to a bar. A 1.5px cap at
                  each end of a 40px phone column overstates a small figure by about four points,
                  and the low end is exactly where honesty matters most.

                  scaleX from the left edge, never width: transform is composited and skips
                  layout. A floor of 2%, so a day that earned something never reads as a day that
                  earned nothing; a true 0 draws nothing at all and the track carries the day. */}
              {d.pct > 0 && (
                <div
                  // .motion-data, so today's bar TRAVELS when a mark lands rather than
                  // snapping while the hero ring beside it animates. It costs nothing on
                  // first paint: the bars only exist once the fetch has returned, so they
                  // MOUNT at their value and a mount is not a transition. Nothing grows
                  // from zero on load.
                  //
                  // No opacity distinction for today either. Today already carries the ink
                  // percentage above, the ink column border below and the right-hand edge;
                  // a fourth marker is over-marking a day the eye cannot miss. Worse, a
                  // dimmed amber bar reads as a LOWER figure — which is a gradient encoding
                  // a value by another name.
                  className="motion-data h-full w-full origin-left"
                  style={{
                    transform: `scaleX(${Math.max(d.pct, 2) / 100})`,
                    background: "var(--color-accent)",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* PRODUCTIVITY. */}
        <div className="mt-2.5 flex items-end" style={{ gap: `${STRIP_GAP_PCT}%` }}>
          {strip.map((d) => (
            <div
              key={d.date}
              className="relative h-20 min-w-0 flex-1 overflow-hidden rounded-t-[3px] border-x border-t"
              style={{
                // OUTLINED, not filled. --color-panel-2 measures 1.04:1 against the page,
                // so a day with no bar vanished entirely and the strip read as five days
                // instead of seven. An outline is the system's existing answer: it is how
                // "skipped" stays legible without becoming a third weight of fill.
                //
                // Today is marked by a STRONGER OUTLINE rather than an amber wash. The wash
                // sat behind the slabs and tinted every colour in the stack, which is the
                // one thing a chart made of colours cannot afford.
                borderColor: d.isToday
                  ? "var(--color-ink)"
                  : "var(--color-line-strong)",
              }}
            >
              {/* Each slab sized against the WEEK'S PEAK directly, bottom-aligned.
                  Deliberately un-transformed: a scaleY on the stack would have been
                  composited and free, but it scales the separators with it, so the
                  hairlines that make two slabs read as two would thin toward nothing on
                  exactly the short days that need them most. */}
              {d.productivity && d.productivity.points > 0 && (
                <div className="absolute inset-0 flex flex-col justify-end">
                  {/* Drawn bottom-up, so the largest slab sits at the base and the day
                      reads as a foundation with the extras on top. `segments` arrives
                      largest first — see scoreDay. */}
                  {[...d.productivity.segments].reverse().map((s, i) => (
                    <div
                      key={`${s.kind}-${s.colorId ?? "d"}-${i}`}
                      style={{
                        height: `${(s.points / peak) * 100}%`,
                        background: slabFill(s),
                        // A hairline in the column's own surface, so two slabs of a similar
                        // tone still read as two things.
                        borderTop:
                          i === 0
                            ? undefined
                            : "1px solid var(--color-surface-1)",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="h-px w-full bg-[var(--color-line-strong)]" />

          {/* THE LETTERS carry TWO marks now, and they mean different things. Ink is the
              real today, wherever it falls in the window — server truth, the same flag the
              calendar column pins its green row with. The UNDERLINE is the day on screen.
              On a live day they are the same column and the pair reads as one emphasis;
              stepped back, the underline travels and today stays where it is, which is
              exactly the fact a reader needs and the only place the strip states it. */}
          <div className="mt-2 flex" style={{ gap: `${STRIP_GAP_PCT}%` }}>
            {strip.map((d) => (
              <span
                key={d.date}
                className={`min-w-0 flex-1 text-center text-micro ${
                  d.date === data.date
                    ? "underline decoration-[var(--color-ink)] decoration-2 underline-offset-4"
                    : ""
                }`}
                style={{
                  color: d.isToday ? "var(--color-ink)" : "var(--color-muted)",
                }}
              >
                {new Date(`${d.date}T12:00:00`).toLocaleDateString("en-AU", {
                  weekday: "narrow",
                })}
              </span>
            ))}
          </div>
        </div>

        {/* Swatches, not a boxed legend. A few small marks on one line under the chart read
            in a glance and cost a line; a bordered key would cost a block and turn the strip
            into a figure with an apparatus. */}
        {stackKey.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {stackKey.map((k) => (
              <li
                key={k.fill}
                className="flex items-center gap-1.5 text-micro text-[var(--color-muted)]"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ background: k.fill }}
                />
                {k.label}
              </li>
            ))}
          </ul>
        )}
      </section>


      <CoachNote date={data.date} />

      <section>
        <div className="section-head">
          <h2 className="text-small font-semibold">
            {back === 0 ? "Today's blocks" : `Blocks on ${shortDay(data.date)}`}
          </h2>
        </div>
        <div className="mt-4">
          {data.calendarConnected ? (
            <BlockList
              date={data.date}
              isToday={back === 0}
              blocks={data.blocks}
              onChanged={refresh}
            />
          ) : (
            <p className="max-w-[42ch] text-body text-[var(--color-muted)]">
              Google Calendar isn&apos;t connected, so there are no blocks to
              mark.{" "}
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

      {/* The day's workings, raised from its column on the strip. Mounted only while open,
          so its read never runs behind a closed sheet. */}
      {scoreDay && (
        <ProductivityLog
          date={scoreDay}
          onClose={() => setScoreDay(null)}
          onOpenDay={(d) => {
            setScoreDay(null);
            goToDay(d);
          }}
        />
      )}
    </div>
  );

  const pillarPane = (
    <PillarSections
      goals={goals}
      skills={skills}
      rings={rings}
      facts={facts}
      colors={colors}
      workouts={workouts}
      socialEvents={socialEvents}
      oneOffEvents={oneOffEvents}
      skills14={skills14}
      date={data.date}
      today={today}
      onSubgoal={(id, done) =>
        mutateGoals(`/api/subgoals/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ done }),
        })
      }
      onLogTime={(skillId, minutes) =>
        mutateSkills(`/api/skills/${skillId}/time`, {
          method: "POST",
          body: JSON.stringify({ minutes, date: data.date }),
        })
      }
      onUndoTime={(skillId) =>
        mutateSkills(`/api/skills/${skillId}/time?date=${data.date}`, {
          method: "DELETE",
        })
      }
      onSaveWorkout={saveWorkout}
      onDeleteWorkout={deleteWorkout}
      onOpenRecord={openRecord}
    />
  );

  // Every pane is ALWAYS mounted. On desktop all three show and the tab is ignored; on
  // the phone the unselected panes sit in a grid collapsed to 0fr — see .pane-grid —
  // which is what lets both the opening AND the closing window animate to auto height.
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
   * accordion keeps calendar → today → pillars order, so after a switch at most two
   * collapsed bars sit above the open window — the top IS where the content is. Without
   * this, opening Pillars from the bottom of a long Today leaves the viewport parked on
   * empty space the collapse just vacated.
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
          the open window shows all of itself and never scrolls inside. */}
      <div className="lg:flex lg:h-dvh lg:flex-col">
        <div className="shrink-0 border-b border-[var(--color-line-strong)] bg-[var(--color-bar)]">
          {/* The title is CENTRED on the page, not on the space left over beside the
              link — hence a three-column grid with an empty cell mirroring the link. A
              flex row with one item pushed right would drift the title off centre by
              exactly half the link’s width. */}
          <div className="mx-auto grid w-full max-w-[92rem] grid-cols-[1fr_auto_1fr] items-baseline gap-4 px-6 py-5 sm:px-8">
            <span aria-hidden />
            {/* Serif because a page heading is the owner’s side of the Author Rule, and
                text-heading rather than text-hero — 52px is the adherence numeral and
                nothing else, and a masthead outsizing the hero would invert the
                hierarchy PRODUCT.md fixes. */}
            <h1 className="text-center font-serif text-heading">
              The Book of Nero
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
            scroll; the desktop column height machinery is all lg-scoped. */}
        <div className="mx-auto w-full max-w-[92rem] px-4 pb-24 pt-4 sm:px-8 lg:min-h-0 lg:flex-1 lg:px-6 lg:pb-6 lg:pt-6">
          {/* Source order is middle → left → right, which IS the stacked mobile order, so
            the phone needs no reordering and the day's work leads the document. Desktop
            only moves the columns spatially.
            Three WINDOWS now, each on its own surface with a hairline and a gutter of page
            ground between them. Their tones differ by only 1.03–1.07:1 — the hairline and
            the gutter do the separating; the tone just says which one you are in. */}
          {/* FLEX, not grid, and the change is what makes the record open at all.
              A grid's tracks are `minmax(15rem, 1fr)` — two values that do not interpolate
              into a rail width, so opening the record could only ever have been a jump or an
              overlay. As flex items the same three shares are `flex: <n> 1 0%`, which IS
              interpolable: the row keeps summing to itself at every frame of the move, so the
              record window grows by exactly what the other two give up and no gap opens.
              The ratios are unchanged — 1 / 1.9 / 1.15 with the same minimums. */}
          <div
            // Order is calendar → today → pillars in both worlds — one set of order
            // classes, no lg: fork. Height is desktop's concern only: the phone column
            // is as tall as its content, and the page scrolls it.
            className="panel-row flex flex-col gap-3 lg:h-full lg:min-h-0 lg:flex-row lg:items-stretch lg:gap-4"
            data-record={recordGeom ? "" : undefined}
            // Beat one, both directions: intent and geometry disagree, so contents leave.
            data-exiting={recordOpen !== recordGeom ? "" : undefined}
          >
            <div
              data-panel="today"
              data-open={tab === "today" ? "" : undefined}
              style={{ "--panel-grow": 1.9, "--panel-min": "26rem" } as CSSProperties}
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

            <div
              data-panel="calendar"
              data-open={tab === "calendar" ? "" : undefined}
              style={{ "--panel-grow": 1, "--panel-min": "15rem" } as CSSProperties}
              className={`panel window order-1 bg-[var(--color-surface-2)] p-5 lg:p-6 ${colScroll}`}
            >
              <button
                type="button"
                onClick={() => switchTab("calendar")}
                className={`w-full items-baseline justify-between text-left lg:hidden ${tab === "calendar" ? "hidden" : "flex"}`}
              >
                <span className="text-small font-semibold">Calendar</span>
                <span aria-hidden className="text-micro text-[var(--color-muted)]">
                  open
                </span>
              </button>
              <div className="panel-fade lg:h-full">
                {pane("calendar", <CalendarColumn date={data.date} />)}
              </div>

              {/* THE RAIL. What both left-hand windows became, and the way back out.
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
            </div>

            <div
              ref={pillarPanel}
              data-panel="pillars"
              data-open={tab === "pillars" ? "" : undefined}
              style={{ "--panel-grow": 1.15, "--panel-min": "16rem" } as CSSProperties}
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

      <PhoneTabBar tab={tab} onTab={switchTab} />

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
