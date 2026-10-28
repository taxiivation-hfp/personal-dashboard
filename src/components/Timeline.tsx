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
import type { GoalView, TimelineData, TimelineWindow } from "@/lib/queries";
import {
  BUBBLE_WORLD_W,
  bubbleLayout,
  bubbleRadius,
  goalMonths,
  noteInMonth,
  pushTargets,
  timelineYears,
  tintHex,
} from "@/lib/timeline";
import MonthPage from "./MonthPage";
import MonthRecords from "./MonthRecords";

/**
 * THE TIMELINE — every month as a bubble on one pannable, zoomable canvas, and the two
 * screens a month opens onto: its page (goals and notes) and its records (the log,
 * bounded to that month).
 *
 *   timeline  -> month  -> records
 *
 * THE CANVAS is a year block per year (4 x 3 grid, src/lib/timeline.ts owns the geometry)
 * with a curved link through the months in order. It is drawn ONCE by React and then moved
 * by a requestAnimationFrame loop that writes straight to the DOM: bubble positions and
 * radii ease toward their targets (a hovered bubble swells and shoves its neighbours),
 * each link is rebuilt from the bubbles' current centres, and a cursor crossing a link
 * plucks it. Nothing in that loop touches React state. The loop runs only while the canvas
 * is on screen and the layer is shown.
 *
 * PAN AND ZOOM are a translate + scale on the world, kept in a ref. A drag past 4px pans
 * (and is never a click); a plain wheel pans; Ctrl/Cmd + wheel zooms about the cursor.
 * Those wheel listeners are native and non-passive, on the viewport and on the layer root
 * (so Ctrl + wheel over the zoom bar or the month screens never zooms the BROWSER either),
 * and both are removed on unmount — there is no window-level listener.
 *
 * THE URL mirrors the screen with replaceState, extending Today's `?view=timeline`:
 * `&month=YYYY-MM` and, on records, `&screen=records`. Today passes the parsed values in
 * as `initialMonth` / `initialScreen` so a deep link lands on the right screen at once.
 * ESCAPE steps back one screen; on the canvas it is left to Today, which closes the layer.
 *
 * IT FEEDS NOTHING: no figure here enters adherence, the rings, the streak or the score.
 */

export type TimelineScreen = "timeline" | "month" | "records";

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;
const ZOOM_DEFAULT = 0.8;
const ZOOM_STEP = 0.1;
/** Pointer travel (px) before a press becomes a drag, and stops being a click. */
const DRAG_SLOP = 4;
/** Fraction of the remaining distance an animated value covers each frame. */
const EASE = 0.11;
/** How much of the world must stay inside the viewport, in px, so it can't be lost. */
const KEEP = 120;
const PREVIEW_MAX = 6;

const monthLabel = (ym: string) =>
  new Date(`${ym}-15T12:00:00`).toLocaleDateString("en-AU", { month: "long" });

const isMonth = (s: string | undefined | null): s is string =>
  !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

type Item =
  | { kind: "goal"; key: string; title: string; progress: number }
  | { kind: "note"; key: string; text: string; tint: string | null };

type Node = { x: number; y: number; R: number };
type Link = { E: number; t0: number; side: 1 | -1; ph: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The preview that fades in inside a hovered bubble: mini cards, then a footer line. */
function Preview({ items, width }: { items: Item[]; width: number }) {
  const shown = items.slice(0, PREVIEW_MAX);
  const more = items.length - shown.length;
  return (
    <>
      {shown.length > 0 && (
        <span className="tl-pv tl-pvgrid" style={{ width }}>
          {shown.map((it) => {
            const tint = it.kind === "note" ? it.tint : null;
            return (
              <span
                key={it.key}
                className="tl-pvcard"
                style={
                  tint
                    ? {
                        background: tint,
                        borderColor: `color-mix(in srgb, ${tint} 82%, var(--color-ink))`,
                      }
                    : undefined
                }
              >
                <span className="tl-pvt">
                  {it.kind === "goal" ? it.title : it.text.trim() || "Empty note"}
                </span>
                {it.kind === "goal" && (
                  <span className="tl-pvbar">
                    <i>
                      <b style={{ width: `${Math.round(it.progress * 100)}%` }} />
                    </i>
                    <em>{Math.round(it.progress * 100)}%</em>
                  </span>
                )}
              </span>
            );
          })}
        </span>
      )}
      <span className="tl-pv tl-pvfoot">
        {items.length === 0
          ? "Nothing pinned yet"
          : `${more > 0 ? `+${more} more · ` : ""}click to open →`}
      </span>
    </>
  );
}

export default function Timeline({
  today,
  goals,
  onGoals,
  shown = true,
  initialMonth,
  initialScreen,
  onScreen,
}: {
  /** The real today — decides which month wears the accent and where the view opens. */
  today: string;
  /** ALL the board's goals; each month keeps its own via goalMonths(). */
  goals: GoalView[];
  /** Today's mutateGoals, passed straight through to the month page. */
  onGoals: (url: string, init: RequestInit) => Promise<void>;
  /** False while the layer is fading out; the animation loop sleeps. */
  shown?: boolean;
  /** Deep link: `?month=YYYY-MM` and `&screen=records`, parsed by the page. */
  initialMonth?: string;
  initialScreen?: "records";
  /** Tells the host which screen is up, so it can hide its own controls and leave Escape
   *  to us on every screen but the canvas. */
  onScreen?: (screen: TimelineScreen) => void;
}) {
  const thisMonth = today.slice(0, 7);

  // ------------------------------------------------------------------ THE DATA
  const [store, setStore] = useState<TimelineData | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/timeline")
      .then((r) => r.json())
      .then((d) => {
        if (live && d && !d.error) setStore(d as TimelineData);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  // A whole store from the server, or an updater for an optimistic local edit.
  const onStore = useCallback(
    (s: TimelineData | ((cur: TimelineData) => TimelineData)) =>
      setStore((cur) => (typeof s === "function" ? (cur ? s(cur) : cur) : s)),
    [],
  );

  // ----------------------------------------------------------------- THE SCREEN
  const [month, setMonth] = useState<string>(isMonth(initialMonth) ? initialMonth : thisMonth);
  const [screen, setScreen] = useState<TimelineScreen>(
    isMonth(initialMonth) ? (initialScreen === "records" ? "records" : "month") : "timeline",
  );

  /** Move to a screen and mirror it in the address bar, keeping `date` and `view`. */
  const go = useCallback((next: TimelineScreen, m: string) => {
    setScreen(next);
    setMonth(m);
    const qs = new URLSearchParams(window.location.search);
    qs.set("view", "timeline");
    if (next === "timeline") {
      qs.delete("month");
      qs.delete("screen");
    } else {
      qs.set("month", m);
      if (next === "records") qs.set("screen", "records");
      else qs.delete("screen");
    }
    window.history.replaceState(null, "", `/?${qs}`);
  }, []);

  useEffect(() => {
    onScreen?.(screen);
  }, [screen, onScreen]);
  useEffect(() => () => onScreen?.("timeline"), [onScreen]);

  // Escape steps back one screen. The canvas is Today's: it closes the layer. A field that
  // handles Escape itself stops it before it reaches the window, so editing is safe.
  useEffect(() => {
    if (screen === "timeline") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // A field or a native <dialog> owns its own Escape. A dialog's cancel is the keydown's
      // default action, so at this bubble-phase listener it is still open: check for it.
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input,textarea,select,[contenteditable],dialog")) return;
      if (document.querySelector("dialog[open]")) return;
      go(screen === "records" ? "month" : "timeline", month);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, month, go]);

  // ------------------------------------------------------------ DERIVED PER MONTH
  const { layout, counts, items } = useMemo(() => {
    const itemsBy = new Map<string, Item[]>();
    const push = (m: string, it: Item) => {
      const l = itemsBy.get(m);
      if (l) l.push(it);
      else itemsBy.set(m, [it]);
    };
    const data = new Set<string>();
    for (const g of goals) {
      for (const m of goalMonths(g, today)) {
        data.add(m);
        push(m, { kind: "goal", key: `g${g.id}`, title: g.title, progress: g.progress });
      }
    }
    if (store) {
      for (const m of Object.keys(store.chapters)) data.add(m);
      for (const m of Object.keys(store.notes)) data.add(m);
      for (const w of store.windows as TimelineWindow[]) {
        if (w.kind !== "text") continue;
        // Only a note's own months widen the year range; an all-months note must not.
        for (const m of w.months) data.add(m);
      }
    }
    const years = timelineYears(today, [...data]);
    const lay = bubbleLayout(years);
    if (store) {
      for (const w of store.windows as TimelineWindow[]) {
        if (w.kind !== "text") continue;
        for (const s of lay.slots) {
          if (noteInMonth(w, s.month))
            push(s.month, { kind: "note", key: `n${w.id}`, text: w.text, tint: tintHex(w.color) });
        }
      }
    }
    const cnt = lay.slots.map((s) => itemsBy.get(s.month)?.length ?? 0);
    return { layout: lay, counts: cnt, items: itemsBy };
  }, [goals, store, today]);

  // -------------------------------------------------------------------- HOVER
  const [hover, setHover] = useState<number | null>(null);

  // What the animation loop reads, kept current without restarting it.
  const sim = useRef({ layout, counts, hover: null as number | null, thisMonth });
  useEffect(() => {
    sim.current = { layout, counts, hover, thisMonth };
  }, [layout, counts, hover, thisMonth]);

  // ---------------------------------------------------------------------- DOM REFS
  const root = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const pct = useRef<HTMLSpanElement>(null);
  const bubs = useRef<(HTMLButtonElement | null)[]>([]);
  const nms = useRef<(HTMLSpanElement | null)[]>([]);
  const tgs = useRef<(HTMLSpanElement | null)[]>([]);
  const paths = useRef<(SVGPathElement | null)[]>([]);

  // ------------------------------------------------------------------- PAN / ZOOM
  const view = useRef({ tx: 0, ty: 0, z: ZOOM_DEFAULT });
  /** Set once the user pans or zooms: from then on the view is theirs, never re-centred. */
  const touched = useRef(false);

  const apply = useCallback((animate: boolean) => {
    const w = world.current;
    if (!w) return;
    const vp = viewport.current;
    const v = view.current;
    if (vp) {
      const { layout: l } = sim.current;
      v.tx = clamp(v.tx, KEEP - l.width * v.z, vp.clientWidth - KEEP);
      v.ty = clamp(v.ty, KEEP - l.height * v.z, vp.clientHeight - KEEP);
    }
    w.style.transition = animate ? "transform 350ms var(--ease-out)" : "none";
    w.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.z})`;
    if (pct.current) pct.current.textContent = String(Math.round(v.z * 100));
  }, []);

  /** Zoom to z keeping the viewport point (cx, cy) fixed. */
  const zoomAt = useCallback(
    (z: number, cx: number, cy: number, animate: boolean) => {
      const v = view.current;
      touched.current = true;
      const nz = clamp(z, ZOOM_MIN, ZOOM_MAX);
      const k = nz / v.z;
      v.tx = cx - (cx - v.tx) * k;
      v.ty = cy - (cy - v.ty) * k;
      v.z = nz;
      apply(animate);
    },
    [apply],
  );

  /** "Today": default zoom, the grid centred across the viewport and the current month's
   *  row at its vertical centre. */
  const home = useCallback(
    (animate: boolean) => {
      const vp = viewport.current;
      if (!vp || !vp.clientWidth) return false;
      const { layout: l, thisMonth: now } = sim.current;
      const slot = l.slots.find((s) => s.month === now) ?? l.slots[0];
      if (!slot) return false;
      const v = view.current;
      v.z = ZOOM_DEFAULT;
      v.tx = (vp.clientWidth - BUBBLE_WORLD_W * v.z) / 2;
      v.ty = vp.clientHeight / 2 - slot.gy * v.z;
      apply(animate);
      return true;
    },
    [apply],
  );

  // Park on the current month once the canvas has a size (it may be hidden at mount when a
  // deep link opens straight onto a month), and again whenever the layout changes — the
  // stored data can add an earlier year after mount and shift every row — until the user
  // has panned or zoomed.
  useLayoutEffect(() => {
    if (screen !== "timeline" || touched.current) return;
    sim.current.layout = layout;
    sim.current.thisMonth = thisMonth;
    home(false);
  }, [screen, home, layout, thisMonth]);

  const zoomBy = (delta: number) => {
    const vp = viewport.current;
    if (!vp) return;
    const z = Math.round((view.current.z + delta) * 10) / 10;
    zoomAt(z, vp.clientWidth / 2, vp.clientHeight / 2, true);
  };

  // WHEELS. Native + non-passive so preventDefault holds. The viewport pans / zooms; the
  // root only swallows Ctrl/Cmd + wheel so the browser's page zoom stays off everywhere in
  // the layer. Both come off on unmount.
  useEffect(() => {
    const vp = viewport.current;
    const el = root.current;
    if (!vp || !el) return;
    const onVp = (e: WheelEvent) => {
      e.preventDefault();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vp.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) {
        const r = vp.getBoundingClientRect();
        zoomAt(
          view.current.z * Math.exp(-e.deltaY * k * 0.0025),
          e.clientX - r.left,
          e.clientY - r.top,
          false,
        );
        return;
      }
      let dx = e.deltaX * k;
      const dy = e.deltaY * k;
      if (e.shiftKey && !dx) dx = dy;
      touched.current = true;
      view.current.tx -= dx;
      view.current.ty -= e.shiftKey ? 0 : dy;
      apply(false);
    };
    const onRoot = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    vp.addEventListener("wheel", onVp, { passive: false });
    el.addEventListener("wheel", onRoot, { passive: false });
    return () => {
      vp.removeEventListener("wheel", onVp);
      el.removeEventListener("wheel", onRoot);
    };
  }, [apply, zoomAt]);

  // ----------------------------------------------------------------- THE ANIMATION
  const nodes = useRef<Node[]>([]);
  const links = useRef<Link[]>([]);
  const frame = useRef(0);
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const running = shown && screen === "timeline";
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let first = true;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { layout: l, counts: cnt, hover: h, thisMonth: now } = sim.current;
      const slots = l.slots;
      if (nodes.current.length !== slots.length) {
        nodes.current = slots.map((s, i) => ({
          x: s.gx,
          y: s.gy,
          R: bubbleRadius(cnt[i] ?? 0, s.month === now, false),
        }));
        first = true;
      }
      if (links.current.length !== slots.length - 1) {
        links.current = slots.slice(1).map(() => ({ E: 0, t0: 0.5, side: 1, ph: 0 }));
      }
      const ns = nodes.current;
      const base = slots.map((s, i) => ({
        x: s.gx,
        y: s.gy,
        R: bubbleRadius(cnt[i] ?? 0, s.month === now, i === h),
      }));
      const T = pushTargets(base, h);
      const f = reduced.current ? 1 : EASE;
      let moved = first;
      ns.forEach((n, i) => {
        const t = T[i]!;
        let changed = false;
        for (const k of ["x", "y", "R"] as const) {
          const d = t[k] - n[k];
          if (d === 0) continue;
          n[k] = Math.abs(d) > 0.3 ? n[k] + d * f : t[k];
          changed = true;
        }
        if (!changed && !first) return;
        moved = true;
        const el = bubs.current[i];
        if (!el) return;
        const s = el.style;
        s.left = `${n.x - n.R}px`;
        s.top = `${n.y - n.R}px`;
        s.width = s.height = `${n.R * 2}px`;
        const nm = nms.current[i];
        if (nm)
          nm.style.fontSize = `${
            i === h ? (slots[i]!.month === now ? 34 : 32) : Math.round(n.R * 0.27)
          }px`;
        const tg = tgs.current[i];
        if (tg) tg.style.maxWidth = `${Math.round(n.R * 1.5)}px`;
      });
      frame.current++;
      links.current.forEach((w, k) => {
        const decaying = w.E > 0;
        if (!moved && !decaying && !first) return;
        w.E *= 0.955;
        if (w.E < 0.01) w.E = 0;
        const a = ns[k]!;
        const b = ns[k + 1]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / len;
        const ny = dx / len;
        const bow = (k % 2 ? 1 : -1) * Math.min(22, len * 0.06);
        let d = "";
        for (let j = 0; j <= 28; j++) {
          const u = j / 28;
          const env = Math.exp(-(((u - w.t0) / 0.24) ** 2));
          const off =
            bow * Math.sin(Math.PI * u) +
            w.E *
              24 *
              w.side *
              Math.sin(Math.PI * u) *
              env *
              Math.cos((frame.current - w.ph) * 0.42);
          d += `${j ? " L" : "M"}${(a.x + dx * u + nx * off).toFixed(1)},${(a.y + dy * u + ny * off).toFixed(1)}`;
        }
        paths.current[k]?.setAttribute("d", d);
      });
      first = false;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  // ---------------------------------------------------------------------- POINTERS
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    tx: number;
    ty: number;
    started: boolean;
  } | null>(null);
  const moved = useRef(false);

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      tx: view.current.tx,
      ty: view.current.ty,
      started: false,
    };
    moved.current = false;
    // A release outside the viewport before the drag threshold is never captured, so also
    // listen on the window while the press is live.
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      endDrag(ev.pointerId);
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  /** Pluck any link the cursor has just crossed. */
  const pluck = (e: React.PointerEvent) => {
    if (reduced.current) return;
    const vp = viewport.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const v = view.current;
    const wx = (e.clientX - r.left - v.tx) / v.z;
    const wy = (e.clientY - r.top - v.ty) / v.z;
    const ns = nodes.current;
    links.current.forEach((L, k) => {
      const a = ns[k];
      const b = ns[k + 1];
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = clamp(((wx - a.x) * dx + (wy - a.y) * dy) / l2, 0, 1);
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      if (t > 0.08 && t < 0.92 && Math.hypot(wx - px, wy - py) < 30 && L.E < 0.35) {
        L.E = 1;
        L.t0 = t;
        L.ph = frame.current;
        L.side = dx * (wy - a.y) - dy * (wx - a.x) > 0 ? -1 : 1;
      }
    });
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.started && Math.abs(dx) + Math.abs(dy) > DRAG_SLOP) {
        d.started = true;
        touched.current = true;
        moved.current = true;
        viewport.current?.setPointerCapture(e.pointerId);
        viewport.current?.classList.add("tl-dragging");
        setHover(null);
      }
      if (d.started) {
        view.current.tx = d.tx + dx;
        view.current.ty = d.ty + dy;
        apply(false);
      }
      return;
    }
    if (e.pointerType === "mouse") pluck(e);
  };

  const endDrag = (pointerId: number) => {
    const d = drag.current;
    if (!d || d.id !== pointerId) return;
    drag.current = null;
    viewport.current?.classList.remove("tl-dragging");
    // After the click that follows this release has been swallowed.
    setTimeout(() => {
      moved.current = false;
    }, 0);
  };
  const onUp = (e: React.PointerEvent) => endDrag(e.pointerId);

  // ----------------------------------------------------------------------- RENDER
  const canvas = screen === "timeline";

  return (
    // data-no-swipe: the phone's tab swipe must not fight a canvas that travels everywhere.
    <div ref={root} className="relative h-full w-full" data-no-swipe>
      <div className={canvas ? "contents" : "hidden"}>
        <div
          ref={viewport}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="tl-viewport"
        >
          <div
            ref={world}
            className="tl-world"
            style={{ width: BUBBLE_WORLD_W, height: layout.height }}
          >
            {layout.yearLabels.map((y) => (
              <div key={y.year} className="tl-year" style={{ top: y.top }}>
                {y.year}
              </div>
            ))}
            <svg
              className="tl-links"
              width={layout.width}
              height={layout.height}
              aria-hidden
            >
              {layout.slots.slice(1).map((s, k) => (
                <path
                  key={s.month}
                  ref={(el) => {
                    paths.current[k] = el;
                  }}
                />
              ))}
            </svg>
            {layout.slots.map((s, i) => {
              const now = s.month === thisMonth;
              const hov = hover === i;
              const tagline = store?.notes[s.month] || store?.chapters[s.month];
              const style: CSSProperties = {
                left: s.gx - 62,
                top: s.gy - 62,
                width: 124,
                height: 124,
              };
              return (
                <button
                  key={s.month}
                  ref={(el) => {
                    bubs.current[i] = el;
                  }}
                  type="button"
                  className="tl-bub"
                  data-now={now ? "" : undefined}
                  data-hov={hov ? "" : undefined}
                  style={style}
                  aria-label={`${monthLabel(s.month)} ${s.month.slice(0, 4)}`}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "touch" && !drag.current?.started) setHover(i);
                  }}
                  onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                  onClick={() => {
                    if (moved.current) return;
                    setHover(null);
                    go("month", s.month);
                  }}
                >
                  <span className="tl-yr">{s.month.slice(0, 4)}</span>
                  <span
                    ref={(el) => {
                      nms.current[i] = el;
                    }}
                    className="tl-nm"
                  >
                    {monthLabel(s.month)}
                  </span>
                  <span
                    ref={(el) => {
                      tgs.current[i] = el;
                    }}
                    className="tl-tg"
                    data-empty={tagline ? undefined : ""}
                  >
                    {tagline || "add a note"}
                  </span>
                  {hov && (
                    <Preview
                      items={items.get(s.month) ?? []}
                      width={Math.round(bubbleRadius(counts[i] ?? 0, now, true) * 1.4)}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="absolute right-6 top-4 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => zoomBy(-ZOOM_STEP)}
            aria-label="Zoom out"
            className="pill pill-round"
          >
            −
          </button>
          <button type="button" onClick={() => home(true)} className="pill">
            Today · <span ref={pct}>{Math.round(ZOOM_DEFAULT * 100)}</span>%
          </button>
          <button
            type="button"
            onClick={() => zoomBy(ZOOM_STEP)}
            aria-label="Zoom in"
            className="pill pill-round"
          >
            +
          </button>
        </div>
        <p className="tl-hint">Drag to move · Ctrl + scroll to zoom</p>
      </div>

      {screen === "month" && (
        <div className="absolute inset-0 overflow-auto">
          <MonthPage
            month={month}
            today={today}
            store={store ?? EMPTY_STORE}
            onStore={onStore}
            goals={goals}
            onGoals={onGoals}
            onBack={() => go("timeline", month)}
            onRecords={() => go("records", month)}
          />
        </div>
      )}
      {screen === "records" && (
        <div className="absolute inset-0 overflow-auto">
          <MonthRecords month={month} today={today} onBack={() => go("month", month)} />
        </div>
      )}
    </div>
  );
}

const EMPTY_STORE: TimelineData = {
  notes: {},
  groups: {},
  windows: [],
  chapters: {},
  board: [],
};
