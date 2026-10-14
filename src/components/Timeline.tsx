"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { GoalView, TimelineWindow } from "@/lib/queries";
import HabitBox from "./HabitBox";
import {
  timelineMonths,
  timelineGroups,
  TIMELINE_START,
  MONTH_W,
  CARD_W,
  WORLD_H,
  LINE_Y,
  worldWidth,
  monthX,
  zoomAbout,
  clampView,
  centreOn,
  WINDOW_TINTS,
  tintHex,
  WINDOW_TEXT_MAX,
  type View,
} from "@/lib/timeline";

/**
 * THE TIMELINE — the app's months on one horizontal line, and the floating windows over
 * them. The owner's ask, 2026-09-03: a roadmap to stand back from, where the record's
 * other screens are places to stand in.
 *
 * A CANVAS, NOT A STRIP — the owner's revision the same day: "scrolling should let us
 * zoom; it should be like a whole canvas". One WORLD (src/lib/timeline.ts owns its
 * geometry: a fixed width from the month count, a fixed height, the line at LINE_Y) is
 * drawn under one view {x, y, s} — a translate and a scale — and the viewport is a
 * window onto it. The wheel ZOOMS about the cursor (a sideways trackpad swipe pans,
 * shift-wheel pans), a drag on the ground PANS, two fingers PINCH. The view lives in a
 * ref and is applied to the world's transform directly, so a pan re-renders nothing:
 * React draws the world once and the compositor moves it.
 *
 * WHAT IS DERIVED AND WHAT IS WRITTEN. The months (Jul 2025 to a rolling year ahead) and
 * the term/break brackets come from src/lib/timeline.ts; the owner's words sit over those
 * defaults — a note under each month, a name on each bracket — stored via /api/timeline
 * and cleared by writing nothing, exactly as a chapter is.
 *
 * THE FLOATING WINDOWS are rows of timeline_windows, added by the two buttons at the top
 * left. A GOAL window is one of the board's own goals, placed here BY CHOICE: this screen
 * stores which and where, never a second copy, so the card and the board can never
 * disagree about one — including its STATUS, which a goal note's tick box writes straight
 * to the goal (see `onGoalDone`). A TEXT window is a few of the owner's words with a tint from the
 * curated WINDOW_TINTS — tap to write, the swatches sit under the words while writing,
 * and removing one asks first because the words go with it. Positions are world pixels
 * from a fixed origin, so nothing shifts as months roll in on the right.
 *
 * A month is a way INTO the log: its circle and name navigate to /stats' log half
 * anchored at that month. The note underneath edits in place instead — two targets,
 * two verbs, deliberately separate elements.
 *
 * IT FEEDS NOTHING. No figure on this screen enters adherence, the rings, the streak or
 * the score; it is a place to look at the year, not a fourth measurement of it.
 */

/** A wheel notch (deltaY 100) zooms by e^-0.25 — about a fifth. A trackpad pinch arrives
 *  as ctrl+wheel in small deltas, so it takes a steeper rate to feel like a pinch. */
const WHEEL_RATE = 0.0025;
const PINCH_RATE = 0.006;
/** The +/- buttons' step. */
const STEP = 1.25;
/** Screen pixels a pointer may travel and still be a TAP rather than a drag. */
const TAP_SLOP = 4;

/** 'YYYY-MM' -> "Jul", and the year when January or the first month needs to say so. */
const monthName = (ym: string) =>
  new Date(`${ym}-15T12:00:00`).toLocaleDateString("en-AU", { month: "short" });
const monthYear = (ym: string) => ym.slice(0, 4);

/** "2026-08-02" -> "2 Aug". Noon, never midnight: a bare ISO date parses as UTC and lands
 *  on the day before anywhere west of Greenwich. */
const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });

const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * One line of the owner's text, edited in place — ChapterName's contract at timeline
 * scale: blur saves, Enter blurs, Escape abandons, and an empty save clears the row so
 * the derived default shows again.
 */
function EditableText({
  value,
  placeholder,
  ariaLabel,
  display,
  input,
  center,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  ariaLabel: string;
  /** Classes for the reading state. */
  display: string;
  /** Classes for the writing state. */
  input: string;
  center?: boolean;
  onSave: (text: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value ?? "");
    setEditing(false);
  }, [value]);

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  const save = async () => {
    const next = draft.trim();
    setEditing(false);
    if (next === (value ?? "")) return; // nothing to write; no request spent on it
    setBusy(true);
    try {
      await onSave(next || null);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            // Abandon, not save. Reset first so the blur that follows sees no change.
            // Stopped here so the timeline's own Escape (return to the dashboard) does
            // not fire on the same key.
            e.stopPropagation();
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        maxLength={120}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={`border-b border-[var(--color-accent)] bg-transparent outline-none placeholder:text-[var(--color-placeholder)] ${center ? "text-center" : ""} ${input}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={busy}
      aria-label={ariaLabel}
      className={`underline decoration-transparent decoration-1 underline-offset-4 transition-colors hover:decoration-[var(--color-line-strong)] disabled:opacity-40 ${center ? "text-center" : "text-left"} ${display} ${value ? "" : "text-[var(--color-muted)]"}`}
    >
      {value || placeholder}
    </button>
  );
}

/**
 * A TEXT WINDOW'S EDITOR: the words, the swatch row, and the way to remove it.
 *
 * The draft is committed — PATCHed only if it changed — when the editor CLOSES, whatever
 * closes it: a tap outside, Escape, or the whole timeline unmounting under it. Not on
 * blur alone: browsers do not reliably fire blur on an element that is removed while
 * focused, and words typed a moment before RETURN TO DASHBOARD must still land.
 *
 * Everything printed here is INK. Muted grey fails 4.5:1 on any tint dark enough to read
 * as a colour (see WINDOW_TINTS), so the controls are ink and the swatches carry no
 * words — a swatch's name is its aria-label.
 */
function TextEditor({
  w,
  onText,
  onColor,
  onRemove,
  onClose,
}: {
  w: TimelineWindow;
  onText: (text: string) => void;
  onColor: (color: string | null) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(w.text);
  const [confirming, setConfirming] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  // The latest draft, readable from the unmount cleanup below.
  const latest = useRef({ draft, text: w.text, onText });
  latest.current = { draft, text: w.text, onText };

  const grow = useCallback(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    grow();
    const el = ta.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [grow]);

  // Commit on the way out, once, from wherever the close came.
  useEffect(
    () => () => {
      const { draft, text, onText } = latest.current;
      if (draft.trim() !== text) onText(draft.trim());
    },
    [],
  );

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation(); // not the timeline's own Escape
          onClose();
        }
      }}
    >
      <textarea
        ref={ta}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          grow();
        }}
        maxLength={WINDOW_TEXT_MAX}
        aria-label="Note"
        rows={1}
        className="block w-full resize-none bg-transparent font-serif text-small leading-snug text-[var(--color-ink)] outline-none"
      />
      {/* THE SWATCHES — paper first, behind a hairline, then the curated tints; the
          chosen one wears the ink rim. No hex field, ever. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onColor(null)}
          aria-pressed={w.color == null}
          aria-label="Paper"
          title="Paper"
          className="h-4 w-4 rounded-full border-2 transition-colors"
          style={{
            background: "var(--paper)",
            borderColor: w.color == null ? "var(--color-ink)" : "var(--color-line-strong)",
          }}
        />
        <span aria-hidden className="h-3 w-px bg-[var(--color-line-strong)]" />
        {WINDOW_TINTS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onColor(t.key)}
            aria-pressed={w.color === t.key}
            aria-label={t.name}
            title={t.name}
            className="h-4 w-4 rounded-full border-2 transition-colors"
            style={{
              background: t.hex,
              borderColor: w.color === t.key ? "var(--color-ink)" : "transparent",
            }}
          />
        ))}
      </div>
      {/* REMOVE, behind the app's own two-step when there are words to lose — never a
          native confirm(). An empty window goes on one tap: nothing is in it. */}
      {confirming ? (
        <div className="mt-2.5">
          <p className="text-micro text-[var(--color-ink)]">Remove this note?</p>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={onRemove}
              className="text-micro font-semibold text-[var(--color-ink)] underline underline-offset-4"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-micro text-[var(--color-ink)] underline-offset-4 hover:underline"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (draft.trim() ? setConfirming(true) : onRemove())}
          className="mt-2.5 text-micro text-[var(--color-ink)] underline-offset-4 hover:underline"
        >
          remove
        </button>
      )}
    </div>
  );
}

export default function Timeline({
  today,
  goals,
  onGoalDone,
}: {
  /** The real today — decides which month wears the accent and where the view opens. */
  today: string;
  /** The board's own goals, handed down so a subtask ticked on the board is the same
   *  object here. Which of them float is decided by timeline_windows, not by status: a
   *  goal is on the timeline while the owner has put it there. */
  goals: GoalView[];
  /** A goal note's tick box. done=true sets status 'done' (the engine stamps
   *  completed_at); false returns it to 'active' and clears the stamp. The caller owns the
   *  write and the refreshed `goals`, exactly as it owns the subtask ticks — this screen
   *  keeps no copy of a goal and must not start keeping one now. */
  onGoalDone: (id: number, done: boolean) => Promise<void>;
}) {
  const months = useMemo(() => timelineMonths(today), [today]);
  const groups = useMemo(() => timelineGroups(months), [months]);
  const thisMonth = today.slice(0, 7);
  const worldW = worldWidth(months.length);

  /** Month -> the x of its circle's centre, in world px. */
  const xOf = useCallback((ym: string) => monthX(months.indexOf(ym)), [months]);

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [windows, setWindows] = useState<TimelineWindow[]>([]);
  /** Which text window is open for writing, if any. */
  const [editing, setEditing] = useState<number | null>(null);
  /** The goal picker under "+ goal". */
  const [picking, setPicking] = useState(false);

  /** Replace state with the record — every write answers with the whole store. */
  const take = useCallback((d: { notes?: Record<string, string>; groups?: Record<string, string>; windows?: TimelineWindow[]; error?: string }) => {
    if (!d || d.error) return;
    setNotes(d.notes ?? {});
    setNames(d.groups ?? {});
    setWindows(d.windows ?? []);
  }, []);

  useEffect(() => {
    fetch("/api/timeline")
      .then((r) => r.json())
      .then(take)
      .catch(() => {});
  }, [take]);

  const saveText = useCallback(
    async (kind: "note" | "group", month: string, text: string | null) => {
      const d = await fetch("/api/timeline", json("POST", { kind, month, text }))
        .then((r) => r.json())
        .catch(() => null);
      if (d) take(d);
    },
    [take],
  );

  // ---------------------------------------------------------------- THE VIEW
  //
  // {x, y, s} in a ref, written straight onto the world's transform. `size` is the
  // viewport's box, kept by a ResizeObserver, and every set() clamps against it so the
  // world can be shoved about but never lost.
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 0, y: 0, s: 1 });
  const size = useRef({ w: 1, h: 1 });

  const apply = useCallback(() => {
    const v = view.current;
    if (world.current)
      world.current.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
  }, []);
  const set = useCallback(
    (v: View) => {
      view.current = clampView(v, size.current.w, size.current.h, worldW, WORLD_H);
      apply();
    },
    [apply, worldW],
  );
  /** Home: the current month at the viewport's centre, at 1:1. */
  const home = useCallback(() => {
    set(centreOn(xOf(thisMonth), LINE_Y, 1, size.current.w, size.current.h));
  }, [set, thisMonth, xOf]);

  // Open parked on the current month — the roadmap is read from where you are standing.
  // A JUMP, not a travel: the world has not been looked at yet. Layout effect so the
  // first paint is already there.
  useLayoutEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    size.current = { w: vp.clientWidth, h: vp.clientHeight };
    home();
    const ro = new ResizeObserver(() => {
      size.current = { w: vp.clientWidth, h: vp.clientHeight };
      set(view.current); // re-clamp; nothing else moves
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [home, set]);

  // THE WHEEL. A native listener because React's is passive and the page must not
  // scroll under the canvas. Vertical delta zooms about the cursor; horizontal delta
  // (a sideways trackpad swipe) pans; shift turns the vertical delta into a pan, the
  // convention every scroller already teaches.
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      const dx = e.deltaX * k;
      const dy = e.deltaY * k;
      let v = view.current;
      if (e.shiftKey) {
        set({ ...v, x: v.x - (dy || dx) });
        return;
      }
      if (dx) v = { ...v, x: v.x - dx };
      if (dy) {
        v = zoomAbout(
          v,
          e.clientX - r.left,
          e.clientY - r.top,
          Math.exp(-dy * (e.ctrlKey ? PINCH_RATE : WHEEL_RATE)),
        );
      }
      set(v);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [set]);

  // THE GROUND'S POINTERS — one pans, two pinch. Anything that is a window, a link or a
  // field keeps its own gesture; the ground only takes what nothing else claimed.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pinch = useRef<{ d: number; mx: number; my: number; v: View } | null>(null);
  const [panning, setPanning] = useState(false);

  const isGround = (t: EventTarget | null) =>
    !(t as HTMLElement | null)?.closest?.("[data-window], a, button, input, textarea");

  const groundDown = (e: React.PointerEvent) => {
    if (!isGround(e.target)) return;
    const vp = viewport.current;
    if (!vp) return;
    vp.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...pointers.current.values()];
    if (ps.length === 1) {
      pan.current = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y };
      setPanning(true);
    } else if (ps.length === 2) {
      const [a, b] = ps as [{ x: number; y: number }, { x: number; y: number }];
      const r = vp.getBoundingClientRect();
      pinch.current = {
        d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mx: (a.x + b.x) / 2 - r.left,
        my: (a.y + b.y) / 2 - r.top,
        v: view.current,
      };
      pan.current = null;
    }
  };
  const groundMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const vp = viewport.current;
    const p = pinch.current;
    if (p && pointers.current.size >= 2 && vp) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const r = vp.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      // Zoom about where the pinch BEGAN, from the view it began on, then carry the
      // midpoint's travel — so the world under two fingers follows both of them.
      const z = zoomAbout(p.v, p.mx, p.my, d / p.d);
      set({ ...z, x: z.x + (mx - p.mx), y: z.y + (my - p.my) });
      return;
    }
    const g = pan.current;
    if (g) set({ ...view.current, x: g.vx + e.clientX - g.x, y: g.vy + e.clientY - g.y });
  };
  const groundUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1) {
      // One finger lifted from a pinch: the other carries on as a pan from here.
      const [rest] = [...pointers.current.values()] as [{ x: number; y: number }];
      pan.current = { x: rest.x, y: rest.y, vx: view.current.x, vy: view.current.y };
    } else if (pointers.current.size === 0) {
      pan.current = null;
      setPanning(false);
    }
  };

  // ------------------------------------------------------------- THE WINDOWS
  const goalsById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
  /** Goals that could still be placed: in flight, and not already on the line. */
  const placeable = useMemo(() => {
    const on = new Set(windows.map((w) => w.goalId));
    return goals.filter((g) => g.status === "active" && !on.has(g.id));
  }, [goals, windows]);

  /**
   * Where a new window lands: the viewport's centre, in world px, nudged down-right past
   * any window already sitting there so two adds in a row do not stack into one.
   */
  const spotForNew = useCallback(() => {
    const v = view.current;
    let x = (size.current.w / 2 - v.x) / v.s - CARD_W / 2;
    let y = (size.current.h / 2 - v.y) / v.s - 48;
    const taken = (px: number, py: number) =>
      windows.some((w) => Math.abs(w.x - px) < 12 && Math.abs(w.y - py) < 12);
    for (let i = 0; i < 20 && taken(x, y); i++) {
      x += 24;
      y += 24;
    }
    return {
      x: Math.min(Math.max(x, 8), worldW - CARD_W - 8),
      y: Math.min(Math.max(y, 8), WORLD_H - 48),
    };
  }, [windows, worldW]);

  const addWindow = useCallback(
    async (w: { kind: "goal"; goalId: number } | { kind: "text" }) => {
      const at = spotForNew();
      const d = await fetch("/api/timeline/windows", json("POST", { ...w, ...at }))
        .then((r) => r.json())
        .catch(() => null);
      if (!d || d.error) return;
      take(d);
      if (w.kind === "text") setEditing(Number(d.id));
    },
    [spotForNew, take],
  );

  /** Move / rewrite / recolour — OPTIMISTIC, then the record's answer replaces it. */
  const patchWindow = useCallback(
    (id: number, patch: { x?: number; y?: number; text?: string; color?: string | null }) => {
      setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
      fetch("/api/timeline/windows", json("PATCH", { id, ...patch }))
        .then((r) => r.json())
        .then(take)
        .catch(() => {});
    },
    [take],
  );
  const removeWindow = useCallback(
    (id: number) => {
      setEditing((e) => (e === id ? null : e));
      setWindows((ws) => ws.filter((w) => w.id !== id));
      fetch("/api/timeline/windows", json("DELETE", { id }))
        .then((r) => r.json())
        .then(take)
        .catch(() => {});
    },
    [take],
  );

  // A tap anywhere outside the open editor (or the open picker) closes it. Pointerdown
  // rather than focus: a swatch tapped on a tablet may never take focus, and blur-based
  // closing would shut the editor on the first colour chosen.
  useEffect(() => {
    if (editing == null && !picking) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (editing != null && !t?.closest?.(`[data-window="${editing}"]`)) setEditing(null);
      if (picking && !t?.closest?.("[data-picker]")) setPicking(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [editing, picking]);

  /**
   * THE DRAG. Pointer capture on the window, deltas against the pointer-down position
   * DIVIDED BY THE SCALE (a screen pixel is 1/s world pixels), and the write happens
   * ONCE, on release — a position is where the window was put down, not every pixel it
   * passed through. A release that never travelled past TAP_SLOP is a TAP, which on a
   * text window opens the editor.
   */
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    moved: boolean;
  } | null>(null);
  const live = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const cardDown = (e: React.PointerEvent, w: TimelineWindow) => {
    // Links, fields and the editor's controls keep their own gestures.
    if ((e.target as HTMLElement).closest("a, button, input, textarea")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      id: w.id,
      startX: e.clientX,
      startY: e.clientY,
      baseX: w.x,
      baseY: w.y,
      moved: false,
    };
    live.current = { x: w.x, y: w.y };
    setDragging(w.id);
  };
  const cardMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dxs = e.clientX - d.startX;
    const dys = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dxs, dys) < TAP_SLOP) return;
    d.moved = true;
    const s = view.current.s;
    const x = Math.min(Math.max(d.baseX + dxs / s, 8), worldW - CARD_W - 8);
    const y = Math.min(Math.max(d.baseY + dys / s, 8), WORLD_H - 48);
    live.current = { x, y };
    setWindows((ws) => ws.map((w) => (w.id === d.id ? { ...w, x, y } : w)));
  };
  const cardUp = (w: TimelineWindow) => {
    const d = drag.current;
    const at = live.current;
    drag.current = null;
    live.current = null;
    setDragging(null);
    if (!d) return;
    if (!d.moved) {
      if (w.kind === "text") setEditing(w.id);
      return;
    }
    if (at) patchWindow(d.id, at);
  };

  const pill =
    "rounded-full border border-[var(--color-line-strong)] bg-[var(--color-panel)] px-3 py-1.5 text-micro font-semibold tracking-[0.14em] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40";

  return (
    // data-no-swipe: the phone's tab swipe must not fight a canvas whose whole point is
    // travel in every direction.
    <div className="relative h-full w-full" data-no-swipe>
      {/* THE TOOLS, over the canvas at the top corners: what goes ON the line at the
          left, how you look at it at the right. */}
      <div className="absolute left-0 top-0 z-20 flex items-start gap-2" data-picker>
        <div className="relative">
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            aria-expanded={picking}
            className={pill}
          >
            + GOAL
          </button>
          {picking && (
            <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-panel)] p-1.5">
              {placeable.length === 0 ? (
                <p className="px-2.5 py-1.5 text-micro text-[var(--color-muted)]">
                  every goal is placed
                </p>
              ) : (
                <ul className="flex flex-col">
                  {placeable.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPicking(false);
                          addWindow({ kind: "goal", goalId: g.id });
                        }}
                        className="block w-full rounded-lg px-2.5 py-1.5 text-left font-serif text-small leading-snug transition-colors hover:bg-[var(--color-panel-2)]"
                      >
                        {g.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <button type="button" onClick={() => addWindow({ kind: "text" })} className={pill}>
          + NOTE
        </button>
      </div>
      <div className="absolute right-0 top-0 z-20 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() =>
            set(zoomAbout(view.current, size.current.w / 2, size.current.h / 2, 1 / STEP))
          }
          aria-label="Zoom out"
          className={`${pill} w-9 px-0 text-center tracking-normal`}
        >
          −
        </button>
        <button type="button" onClick={home} className={pill}>
          TODAY
        </button>
        <button
          type="button"
          onClick={() =>
            set(zoomAbout(view.current, size.current.w / 2, size.current.h / 2, STEP))
          }
          aria-label="Zoom in"
          className={`${pill} w-9 px-0 text-center tracking-normal`}
        >
          +
        </button>
      </div>

      {/* THE VIEWPORT. touch-action none: the canvas owns every finger on it, and the
          page must not scroll or pinch underneath. overflow CLIP, not hidden: a hidden
          overflow is still a scroll container, and focus() or scrollIntoView() on a
          window half off the edge would scroll it — silently shifting the world away
          from the transform the maths thinks it is under. Clip is not scrollable at all. */}
      <div
        ref={viewport}
        onPointerDown={groundDown}
        onPointerMove={groundMove}
        onPointerUp={groundUp}
        onPointerCancel={groundUp}
        className={`h-full w-full overflow-clip ${panning ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ touchAction: "none" }}
      >
        {/* THE WORLD — moved by its transform alone, never re-laid-out. */}
        <div
          ref={world}
          className="relative"
          style={{
            width: worldW,
            height: WORLD_H,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          {/* THE LINE. One hairline through every circle's centre — the road itself. */}
          <div
            aria-hidden
            className="absolute left-0 right-0 h-px bg-[var(--color-line-strong)]"
            style={{ top: LINE_Y }}
          />

          {/* THE MONTHS. Circle and name are ONE button into that month's log; the note
              beneath edits in place. Past months solid, future months dashed — the app's
              standing word for "not yet" — and the current month alone wears the accent. */}
          {months.map((ym) => {
            const x = xOf(ym);
            const now = ym === thisMonth;
            const future = ym > thisMonth;
            const janOrFirst = ym.endsWith("-01") || ym === TIMELINE_START;
            return (
              <div
                key={ym}
                className="absolute flex flex-col items-center"
                style={{ left: x - MONTH_W / 2, width: MONTH_W, top: LINE_Y - 8 }}
              >
                <a
                  href={`/stats?view=log&month=${ym}`}
                  className="group flex flex-col items-center gap-1.5"
                  aria-label={`Open the log for ${monthName(ym)} ${monthYear(ym)}`}
                >
                  <span
                    aria-hidden
                    className="h-4 w-4 rounded-full transition-transform group-hover:scale-110"
                    style={
                      now
                        ? { background: "var(--color-accent)" }
                        : {
                            background: "var(--paper)",
                            border: future
                              ? "1.5px dashed var(--color-line-strong)"
                              : "1.5px solid var(--color-line-strong)",
                          }
                    }
                  />
                  <span
                    className={`text-small underline-offset-4 group-hover:underline ${
                      now
                        ? "font-semibold text-[var(--color-ink)]"
                        : "text-[var(--color-muted)]"
                    }`}
                  >
                    {monthName(ym)}
                    {/* The year, only where the eye needs a fresh anchor — each January,
                        and the strip's own first month. */}
                    {janOrFirst && (
                      <span className="ml-1 text-micro text-[var(--color-muted)]">
                        {monthYear(ym)}
                      </span>
                    )}
                  </span>
                </a>
                <div className="mt-0.5 w-[9rem]">
                  <EditableText
                    value={notes[ym] ?? null}
                    placeholder="add a note"
                    ariaLabel={`Note for ${monthName(ym)} ${monthYear(ym)}`}
                    display="block w-full text-micro leading-snug text-[var(--color-muted)]"
                    input="w-full text-micro leading-snug"
                    center
                    onSave={(t) => saveText("note", ym, t)}
                  />
                </div>
              </div>
            );
          })}

          {/* THE BRACKETS. Up from the start circle, across, down to the end circle —
              the owner's shape — alternating above and below the line so two groups
              meeting on one shared circle never collide. The name sits ON the run,
              on the page ground, and edits in place. */}
          {groups.map((g) => {
            const left = xOf(g.start);
            const width = xOf(g.end) - left;
            const up = g.side === "up";
            return (
              <div
                key={g.key}
                className="absolute"
                style={{
                  left,
                  width,
                  height: 34,
                  ...(up
                    ? {
                        top: LINE_Y - 14 - 34,
                        borderTop: "1px solid var(--color-line-strong)",
                      }
                    : {
                        top: LINE_Y + 96,
                        borderBottom: "1px solid var(--color-line-strong)",
                      }),
                  borderLeft: "1px solid var(--color-line-strong)",
                  borderRight: "1px solid var(--color-line-strong)",
                }}
              >
                <span
                  className="absolute left-1/2 -translate-x-1/2 bg-[var(--color-bg)] px-2"
                  style={up ? { top: "-0.7em" } : { bottom: "-0.7em" }}
                >
                  <EditableText
                    value={names[g.key] ?? null}
                    placeholder={g.label}
                    ariaLabel={`Name for ${g.label}`}
                    display="whitespace-nowrap text-micro font-semibold tracking-[0.08em] text-[var(--color-ink)]"
                    input="w-32 text-micro font-semibold tracking-[0.08em]"
                    center
                    onSave={(t) => saveText("group", g.key, t)}
                  />
                </span>
              </div>
            );
          })}

          {/* THE WINDOWS, floating. A goal window is the board's own goal (title,
              progress, the next unticked step) wherever it was last put down; a text
              window is the owner's words on a tint. Dragging and, for text, tapping to
              write are the only things this screen adds to either. */}
          {windows.map((w) => {
            const g = w.kind === "goal" && w.goalId != null ? goalsById.get(w.goalId) : null;
            if (w.kind === "goal" && !g) return null; // a goal that is no longer on the board
            const lifted = dragging === w.id || editing === w.id;
            const next = g?.subgoals.find((s) => !s.done) ?? null;
            const tint = w.kind === "text" ? tintHex(w.color) : null;
            return (
              <div
                key={w.id}
                data-window={w.id}
                onPointerDown={(e) => cardDown(e, w)}
                onPointerMove={cardMove}
                onPointerUp={() => cardUp(w)}
                onPointerCancel={() => cardUp(w)}
                className={`record-card absolute select-none p-3 ${lifted ? "z-20" : "z-10"} ${
                  dragging === w.id ? "cursor-grabbing" : "cursor-grab"
                }`}
                style={
                  {
                    width: CARD_W,
                    left: w.x,
                    top: w.y,
                    touchAction: "none",
                    ...(tint ? { "--card-bg": tint } : {}),
                  } as CSSProperties
                }
              >
                {g ? (
                  <>
                    <div className="flex items-start gap-2">
                      {/* THE TICK MARKS THE GOAL DONE, from the roadmap it is planned on —
                          the owner's ruling (spec §6). The note STAYS when it is ticked and
                          says when: a year you are standing back from is made of the things
                          that finished as much as the things still running, and a card that
                          vanished on completion would leave the line telling only half the
                          story. It unticks again too: a tick is a claim, and a claim has to
                          be correctable or it stops being made honestly.
                          cardDown already bails out on a button, so this can never start a
                          drag — and the gesture machinery below needs no change for it. */}
                      <button
                        type="button"
                        onClick={() => onGoalDone(g.id, g.status !== "done")}
                        aria-pressed={g.status === "done"}
                        aria-label={
                          g.status === "done"
                            ? `Reopen ${g.title}`
                            : `Mark ${g.title} done`
                        }
                        className="mt-0.5 shrink-0"
                      >
                        <HabitBox
                          done={g.status === "done"}
                          tone="var(--color-accent)"
                        />
                      </button>
                      <p
                        className={`min-w-0 flex-1 font-serif text-small leading-snug ${
                          g.status === "done" ? "text-[var(--color-muted)]" : ""
                        }`}
                      >
                        {g.title}
                      </p>
                      {/* Off the timeline, one tap: only the placement is forgotten, and
                          the goal is exactly where it was on the board. */}
                      <button
                        type="button"
                        onClick={() => removeWindow(w.id)}
                        aria-label="Remove from the timeline"
                        className="-mr-2 -mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-small leading-none text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2.5">
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-line)]">
                        {g.progress > 0 && (
                          <span
                            className="block h-full w-full origin-left rounded-full bg-[var(--color-accent)]"
                            style={{ transform: `scaleX(${g.progress})` }}
                          />
                        )}
                      </span>
                      <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                        {Math.round(g.progress * 100)}%
                      </span>
                    </div>
                    {/* The line that says what to do next — or, on a finished goal, WHEN it
                        finished. An undated completion still reads "✓ done": goals ticked
                        before completed_at was ever written have no date, and a fact with no
                        date is not a missing fact. */}
                    <p className="mt-1.5 text-micro leading-snug text-[var(--color-muted)]">
                      {g.status === "done" ? (
                        <>
                          ✓ done
                          {g.completedAt ? ` ${shortDate(g.completedAt)}` : ""}
                        </>
                      ) : g.count ? (
                        /* A COUNTED goal has no next subtask to name, so it says where it
                           is instead. The line is never blank and never claims a checklist
                           that does not exist. */
                        <span className="tabular-nums">
                          <span className="text-[var(--color-ink)]">
                            {g.count.done}
                          </span>{" "}
                          of {g.count.target}
                        </span>
                      ) : next ? (
                        <>
                          next ·{" "}
                          <span className="text-[var(--color-ink)]">{next.title}</span>
                        </>
                      ) : g.subgoals.length === 0 ? (
                        "no subtasks yet"
                      ) : (
                        "every step ticked"
                      )}
                    </p>
                  </>
                ) : editing === w.id ? (
                  <TextEditor
                    w={w}
                    onText={(text) => patchWindow(w.id, { text })}
                    onColor={(color) => patchWindow(w.id, { color })}
                    onRemove={() => removeWindow(w.id)}
                    onClose={() => setEditing(null)}
                  />
                ) : (
                  // The words, or — for a window with none yet — the tint alone, at a
                  // height a finger can find. Tap to write.
                  <p className="min-h-[1.25rem] whitespace-pre-wrap font-serif text-small leading-snug text-[var(--color-ink)]">
                    {w.text}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
