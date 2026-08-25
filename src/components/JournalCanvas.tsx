"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SheetImage } from "@/lib/journalSave";
import {
  INK,
  MARGIN_FRAC,
  MAX_DPR,
  PAPER,
  RULE,
  RULE_STRONG,
  SHEET_RATIO,
  lowestInkRow,
  ruleYs,
  sheetHeight,
  sheetOf,
  sheetsNeeded,
  sheetsToSave,
  type SheetSaveState,
} from "@/lib/sheets";

/**
 * Handwriting surface — A SCROLL OF SHEETS, written with a stylus.
 *
 * The owner's ruling, 2026-08-25 (see sheets.ts for the geometry and the reasons it is
 * split): the page starts as one A4 sheet and grows by a sheet whenever the ink on the last
 * one passes GROW_AT of its height. On screen that is ONE continuous ruled column inside a
 * scroller; on the record it is one PNG per sheet, and only the sheets touched this sitting
 * are written back.
 *
 * WRITING IS STYLUS-ONLY; A FINGER SCROLLS. The device is a Galaxy Tab with an S Pen, and a
 * page taller than the screen has to be scrollable by hand while the pen is the thing that
 * writes on it. So `pointerType === 'touch'` is returned from before anything is captured
 * and the browser is left to pan; pen and mouse (a desktop has no stylus) draw. Pointer
 * Events rather than mouse/touch listeners because they are the only API that reports
 * `pressure` and `pointerType` in one handler.
 *
 * STROKES LIVE IN SCROLL SPACE, NORMALISED BY THE COLUMN'S WIDTH — x/W, y/W, width/W — so
 * a rotation or a resize re-renders every stroke in place instead of leaving it drawn for a
 * column that no longer exists. In that space the column is exactly one unit wide, which is
 * why `sheetOf(y, 1)` and `sheetHeight(1)` are the right calls below: the sheet functions
 * take a width, and the width is 1.
 *
 * A page can be REOPENED and added to. `base` names the saved page; each of its sheets is
 * drawn under the pen and new strokes land on top. What the canvas cannot do is take a
 * stroke back OUT of the saved ink: only flat PNGs were ever stored, so yesterday's strokes
 * are pixels now. Undo and Clear are therefore about THIS SITTING.
 */

/** A stroke point, normalised by the column's width. `w` is the line width, also ÷ W. */
type Pt = { x: number; y: number; w: number };
type Stroke = Pt[];
type BaseState = "loading" | "ready" | "error";
/** A saved sheet as loaded: the image (null once it has failed) and how far down it its
 *  ink reaches, as a fraction of the SHEET's height. */
type BaseSheet = { img: HTMLImageElement | null; inkFrac: number | null };

/** A sheet's height in normalised space — the column is one unit wide. */
const UNIT_H = sheetHeight(1);
/** The offscreen copy a saved sheet is scanned at. Wide enough that a line of handwriting
 *  cannot vanish between samples, small enough that ten sheets scan in a blink. */
const SCAN_WIDTH = 240;
/** A mouse always reports pressure 0.5 (and 0 while hovering), so mouse input falls back to
 *  a fixed width — otherwise every mouse-drawn line would render at the same dead midpoint
 *  and look broken rather than deliberate. CSS px. */
const FIXED_WIDTH = 2.2;

/** Line width in CSS px. Pressure shapes a real stylus's line; everything else is fixed. */
function widthFor(pointerType: string, pressure: number): number {
  return pointerType === "pen" && pressure > 0 ? 0.6 + pressure * 4.4 : FIXED_WIDTH;
}

/**
 * The sheets a stroke's ink can reach — its y-range widened by half its thickest point, so
 * a round cap sitting on a seam is painted on BOTH sheets and neither side of the seam
 * shows half a dot. Also what decides which sheets a stroke made dirty: those pixels changed.
 */
function span(stroke: Stroke): [number, number] {
  if (!stroke.length) return [0, -1];
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of stroke) {
    const r = p.w / 2;
    if (p.y - r < lo) lo = p.y - r;
    if (p.y + r > hi) hi = p.y + r;
  }
  return [sheetOf(lo, 1), sheetOf(hi, 1)];
}

function segmentSpan(a: Pt, b: Pt): [number, number] {
  const r = Math.max(a.w, b.w) / 2;
  return [sheetOf(Math.min(a.y, b.y) - r, 1), sheetOf(Math.max(a.y, b.y) + r, 1)];
}

function touches(stroke: Stroke, seq: number): boolean {
  const [lo, hi] = span(stroke);
  return seq >= lo && seq <= hi;
}

/**
 * Where a saved sheet lands on the paper — FITTED, NEVER STRETCHED. Pages saved before the
 * A4 rule are whatever shape the dialog happened to be, and filling the sheet with one
 * would squash the owner's own hand, then flatten the squash into the row on the next
 * save, permanently. Letterboxed instead: the bars are blank because the ruling belongs to
 * the image, and a second set of rules through them would be two pages showing at once.
 * Returned in fractions of the sheet (x, width ÷ W; y, height ÷ H) so the ink scan and the
 * draw agree without either knowing the pixel size.
 */
function fit(img: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const ratio = img.naturalHeight / img.naturalWidth;
  if (!Number.isFinite(ratio) || ratio <= 0) return { x: 0, y: 0, w: 1, h: 1 };
  if (ratio <= SHEET_RATIO) {
    // Wider than A4: full width, bars above and below.
    const h = ratio / SHEET_RATIO;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  // Taller than A4: full height, bars either side.
  const w = SHEET_RATIO / ratio;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

/**
 * How far down its SHEET a saved image's ink reaches, or null when it holds none. Scanned
 * once on load, on a small offscreen copy — a page reopened at night with its last sheet
 * written to the foot must offer a fresh one before the pen arrives. Same-origin, so the
 * offscreen canvas is untainted and `getImageData` is allowed; if it is refused anyway
 * (a taint, a memory cap) the answer is "unknown", which growth treats as "no ink" — the
 * pen's own strokes still grow the page.
 */
function scanInk(img: HTMLImageElement): number | null {
  const scale = Math.min(1, SCAN_WIDTH / (img.naturalWidth || 1));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(img, 0, 0, w, h);
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
  const row = lowestInkRow(data, w, h, 2);
  if (row == null) return null;
  // A row of the IMAGE is not a row of the sheet when the image is letterboxed.
  const f = fit(img);
  return f.y + ((row + 1) / h) * f.h;
}

export default function JournalCanvas({
  base,
  live = true,
  onSave,
  onCancel,
  busy,
}: {
  /** The page being added to: its id, how many sheets it has, and a cache-buster.
   *  Undefined for a blank new page. */
  base?: { id: number; sheets: number; rev: number };
  /** Is the page being written for the real today? The title, and nothing else. */
  live?: boolean;
  /** Resolves when every sheet handed over has landed; rejects (with the message to show)
   *  otherwise. The parent runs saveDrawing. */
  onSave: (sheets: SheetImage[]) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  // Parents build `base` inline, so its identity changes every render; the effects below
  // key on its fields, or a re-render would refetch every sheet.
  const baseId = base?.id;
  const baseSheets = base ? Math.max(1, base.sheets) : 0;
  const baseRev = base?.rev;

  const colRef = useRef<HTMLDivElement>(null);
  const canvases = useRef<Map<number, HTMLCanvasElement>>(new Map());
  /** Strokes made THIS SITTING and not yet saved — what Undo and Clear act on. */
  const sitting = useRef<Stroke[]>([]);
  /**
   * Strokes saved earlier this sitting. They are on the record now, so they are out of
   * Undo's reach, but the canvas still has to know them: a resize or an Undo redraws a sheet
   * from its base plus its strokes, and a base that was loaded BEFORE those strokes were
   * saved does not hold them. Dropping them on save would make the next full redraw erase
   * ink the record already has.
   */
  const settled = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const pointerId = useRef<number | null>(null);
  /** The saved sheets, by seq, once each has arrived. A ref because redraw reads them and
   *  nothing on screen branches on the object itself. */
  const bases = useRef<Map<number, BaseSheet>>(new Map());
  /** Seqs that exist on the record — the base's sheets, plus whatever this sitting saved. */
  const savedSeqs = useRef<Set<number>>(new Set());
  /** The column's CSS width, and the backing-store scale, as last fitted. */
  const widthRef = useRef(0);
  const dprRef = useRef(1);
  /** `sheetCount` for the pointer handlers, which must not read a stale closure. */
  const countRef = useRef(Math.max(1, baseSheets));
  /** Read synchronously by the touchstart guard — state would arrive a render late. */
  const penDownRef = useRef(false);
  const mounted = useRef(true);

  const [sheetCount, setSheetCount] = useState(countRef.current);
  /**
   * Has each saved sheet actually ARRIVED?
   *
   * The most dangerous state this component can be in is one where it looks like it is
   * adding to a page and is in fact holding a blank one. Save flattens a sheet and PUTs it
   * over the row, so a stroke drawn while a base was still in flight — or after it failed
   * outright — would replace the only copy of some handwriting with paper, rules and that
   * stroke. There is no undo for that anywhere in this app.
   *
   * So arrival is tracked per sheet and Save is gated on all of them, rather than on
   * `hasInk` alone. 'error' is a separate answer from 'loading' because the two need
   * different words: one is a wait and the other is a wall.
   */
  const [baseStates, setBaseStates] = useState<Record<number, BaseState>>(() => {
    const init: Record<number, BaseState> = {};
    for (let s = 0; s < baseSheets; s++) init[s] = "loading";
    return init;
  });
  const [hasInk, setHasInk] = useState(false);
  /** A pen stroke is down: the palm guard. */
  const [penDown, setPenDown] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const setCount = useCallback((n: number) => {
    countRef.current = n;
    setSheetCount(n);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** A sheet's context with the column's scroll space mapped onto it: dpr scaling, and the
   *  sheet's own top pulled up to y = 0. The canvas clips whatever falls off its sheet. */
  const sheetCtx = useCallback((seq: number) => {
    const c = canvases.current.get(seq);
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return null;
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, -seq * sheetHeight(widthRef.current) * dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    return ctx;
  }, []);

  const paintDot = useCallback(
    (p: Pt, onSheet?: (seq: number) => CanvasRenderingContext2D | null) => {
      // A tap is a dot; without this a single point would leave no mark at all.
      const W = widthRef.current;
      const [lo, hi] = span([p]);
      for (let seq = Math.max(0, lo); seq <= hi; seq++) {
        const ctx = (onSheet ?? sheetCtx)(seq);
        if (!ctx) continue;
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * W, (p.w * W) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [sheetCtx],
  );

  const paintSegment = useCallback(
    (a: Pt, b: Pt, onSheet?: (seq: number) => CanvasRenderingContext2D | null) => {
      // Segment-by-segment so each one carries its own pressure-derived width, and on
      // every sheet the segment crosses — a stroke over a seam is one stroke on two PNGs.
      const W = widthRef.current;
      const [lo, hi] = segmentSpan(a, b);
      for (let seq = Math.max(0, lo); seq <= hi; seq++) {
        const ctx = (onSheet ?? sheetCtx)(seq);
        if (!ctx) continue;
        ctx.beginPath();
        ctx.lineWidth = ((a.w + b.w) / 2) * W;
        ctx.moveTo(a.x * W, a.y * W);
        ctx.lineTo(b.x * W, b.y * W);
        ctx.stroke();
      }
    },
    [sheetCtx],
  );

  /** FULL redraw of one sheet: paper, then its base or its ruling, then every stroke that
   *  reaches it. Resize, Undo, Clear and a base arriving are the only callers; a stroke in
   *  progress paints incrementally instead, because redrawing ten sheets per pointer sample
   *  is what makes a stylus lag. */
  const drawSheet = useCallback(
    (seq: number) => {
      const c = canvases.current.get(seq);
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      const W = widthRef.current;
      const H = sheetHeight(W);
      const dpr = dprRef.current;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, c.width, c.height);

      const b = bases.current.get(seq);
      if (b?.img) {
        // THE SHEET AS IT WAS SAVED, ruling and all: the PNG carries its own rules, so a
        // second set under it would be a second set showing through the paper.
        const f = fit(b.img);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.drawImage(b.img, f.x * W, f.y * H, f.w * W, f.h * H);
      } else {
        // RULED LINES. Handwriting is markedly easier on a lined page — without them the
        // hand drifts and lines wander. Drawn in device pixels so a rule is one crisp
        // pixel, and from the sheet's own width, so a sheet ruled here matches one ruled
        // by CSS at any size on any display. Sheet 1 onward also rules its top edge —
        // `ruleYs` explains why the seam needs it.
        const margin = W * MARGIN_FRAC * dpr;
        ctx.strokeStyle = RULE;
        ctx.lineWidth = 1;
        for (const y of ruleYs(seq, W)) {
          const py = Math.round(y * dpr) + 0.5;
          ctx.beginPath();
          ctx.moveTo(margin, py);
          ctx.lineTo(c.width, py);
          ctx.stroke();
        }
        // A single margin rule, the way a notebook has one. Warm tan, never red.
        ctx.strokeStyle = RULE_STRONG;
        ctx.beginPath();
        ctx.moveTo(Math.round(margin) + 0.5, 0);
        ctx.lineTo(Math.round(margin) + 0.5, c.height);
        ctx.stroke();
      }

      // Only this sheet's context, whichever sheets a stroke also reaches: the others
      // redraw themselves when it is their turn.
      const only = (s: number) => (s === seq ? sheetCtx(seq) : null);
      for (const list of [settled.current, sitting.current]) {
        for (const stroke of list) {
          if (!touches(stroke, seq)) continue;
          if (stroke.length < 2) {
            if (stroke[0]) paintDot(stroke[0], only);
            continue;
          }
          for (let i = 1; i < stroke.length; i++) paintSegment(stroke[i - 1], stroke[i], only);
        }
      }
    },
    [sheetCtx, paintDot, paintSegment],
  );

  /**
   * GROWTH. After a stroke ends and after a base sheet arrives: how far down the LAST sheet
   * does the ink reach — the deepest of every stroke on it (saved this sitting or not) and
   * of its base's own scan — and does `sheetsNeeded` want another? Sheets are only ever
   * added; a sheet that turned out blank is simply never written (see `sheetsToSave`).
   */
  const grow = useCallback(() => {
    const count = countRef.current;
    const top = (count - 1) * UNIT_H;
    let frac: number | null = bases.current.get(count - 1)?.inkFrac ?? null;
    for (const list of [settled.current, sitting.current]) {
      for (const stroke of list) {
        for (const p of stroke) {
          const y = p.y + p.w / 2 - top;
          if (y <= 0) continue;
          // A stroke that ran off the bottom of the column (capture keeps it alive) counts
          // as the foot of the sheet: the next sheet will show its tail.
          const f = Math.min(1, y / UNIT_H);
          if (frac == null || f > frac) frac = f;
        }
      }
    }
    const need = sheetsNeeded(frac, count);
    if (need > count) setCount(need);
  }, [setCount]);

  /**
   * Size every sheet's backing store to the column's width × min(DPR, MAX_DPR), or
   * handwriting is soft on the high-DPI screen a stylus gets used on — and redraw the ones
   * whose size changed. Idempotent: called on resize, and after a sheet is appended, when
   * the only canvas with the wrong size is the new one.
   */
  const fitAll = useCallback(() => {
    const col = colRef.current;
    if (!col) return;
    const W = col.getBoundingClientRect().width;
    if (!W) return; // not laid out yet
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    widthRef.current = W;
    dprRef.current = dpr;
    const bw = Math.round(W * dpr);
    const bh = Math.round(sheetHeight(W) * dpr);
    for (const [seq, c] of canvases.current) {
      if (c.width === bw && c.height === bh) continue;
      c.width = bw;
      c.height = bh;
      drawSheet(seq);
    }
  }, [drawSheet]);

  useEffect(() => {
    fitAll();
    const col = colRef.current;
    if (typeof ResizeObserver === "function" && col) {
      // Fires once on observe, which replaces the old "wait 50ms for layout" guess, and
      // again when the column changes shape — a rotation, or a sheet being appended.
      const ro = new ResizeObserver(() => fitAll());
      ro.observe(col);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", fitAll);
    return () => window.removeEventListener("resize", fitAll);
  }, [fitAll]);

  // The fallback for a browser without ResizeObserver: a new sheet's canvas still has to
  // be sized. With one, this is a no-op — every canvas already matches.
  useEffect(() => {
    fitAll();
  }, [fitAll, sheetCount]);

  // The saved sheets, fetched as real images rather than handed over as base64 in a JSON
  // envelope — same-origin, so the canvases stay untainted and toDataURL still works.
  // Guarded with `alive` because React 19 runs effects twice in development: the first
  // run's images must not land on the second run's state.
  useEffect(() => {
    bases.current.clear();
    savedSeqs.current = new Set();
    if (baseId == null || baseSheets === 0) {
      setBaseStates({});
      return;
    }
    const init: Record<number, BaseState> = {};
    for (let s = 0; s < baseSheets; s++) {
      init[s] = "loading";
      savedSeqs.current.add(s);
    }
    setBaseStates(init);
    if (countRef.current < baseSheets) setCount(baseSheets);

    let alive = true;
    for (let seq = 0; seq < baseSheets; seq++) {
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        bases.current.set(seq, { img, inkFrac: scanInk(img) });
        setBaseStates((p) => ({ ...p, [seq]: "ready" }));
        drawSheet(seq);
        grow();
      };
      // A sheet that cannot be fetched must not become a sheet that can be overwritten.
      img.onerror = () => {
        if (!alive) return;
        bases.current.set(seq, { img: null, inkFrac: null });
        setBaseStates((p) => ({ ...p, [seq]: "error" }));
        drawSheet(seq);
      };
      img.src = `/api/journal/${baseId}/sheet/${seq}?v=${baseRev}`;
    }
    return () => {
      alive = false;
    };
  }, [baseId, baseSheets, baseRev, drawSheet, grow, setCount]);

  /**
   * THE PEN'S OWN TOUCHSTART, and the palm's.
   *
   * On Chrome for Android a stylus is delivered through the touch pipeline, so
   * `touch-action: pan-y` on the scroller would let the browser take a vertical pen stroke
   * as a scroll and cancel the pointer — and the class flip below is too late for that,
   * because the allowed actions are settled before the pointerdown handler runs. What is
   * NOT too late is a non-passive touchstart listener: Chrome waits for it. pointerdown
   * fires before touchstart for the same contact, so by the time this runs the pen has
   * already said it is down, and preventing the default keeps the whole sequence — the
   * pen's, and a palm that lands mid-stroke — off the scroller. A finger arriving with no
   * pen down is left alone, and the browser scrolls.
   */
  useEffect(() => {
    const col = colRef.current;
    if (!col) return;
    const guard = (ev: TouchEvent) => {
      if (penDownRef.current) ev.preventDefault();
    };
    col.addEventListener("touchstart", guard, { passive: false });
    return () => col.removeEventListener("touchstart", guard);
  }, []);

  function pointFrom(
    ev: { clientX: number; clientY: number; pointerType: string; pressure: number },
    rect: DOMRect,
  ): Pt {
    // The column's own rect already moves with the scroll, so this IS scroll space.
    return {
      x: (ev.clientX - rect.left) / rect.width,
      y: (ev.clientY - rect.top) / rect.width,
      w: widthFor(ev.pointerType, ev.pressure) / rect.width,
    };
  }

  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (busy) return;
    // A FINGER SCROLLS. Not captured, not prevented: the browser pans the scroller.
    if (e.pointerType === "touch") return;
    if (current.current) return; // one pen at a time
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    // Capture so a fast stroke that leaves the column still finishes cleanly.
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerId.current = e.pointerId;
    penDownRef.current = true;
    setPenDown(true);
    const p = pointFrom(e, e.currentTarget.getBoundingClientRect());
    current.current = [p];
    sitting.current.push(current.current);
    setHasInk(true);
    setSaveError(null);
    paintDot(p);
  }

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const stroke = current.current;
    if (!stroke || e.pointerId !== pointerId.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // Coalesced events recover the full sample rate of a high-frequency stylus; without
    // them a fast stroke is drawn from far fewer points and looks angular.
    const events =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [];
    const pts = events.length ? events.map((ev) => pointFrom(ev, rect)) : [pointFrom(e, rect)];
    for (const p of pts) {
      const prev = stroke[stroke.length - 1];
      stroke.push(p);
      if (prev) paintSegment(prev, p);
    }
  }

  function up(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerId !== pointerId.current) return;
    current.current = null;
    pointerId.current = null;
    penDownRef.current = false;
    setPenDown(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Already released — a cancel after an up.
    }
    grow();
  }

  function redrawSpan(lo: number, hi: number) {
    const last = countRef.current - 1;
    for (let seq = Math.max(0, lo); seq <= Math.min(hi, last); seq++) drawSheet(seq);
  }

  /**
   * NOTHING ACTS ON A STROKE STILL BEING MADE. `down()` pushes the live stroke onto
   * `sitting` at its first point, so Undo would pop it and Clear would drop it while
   * `move()` kept painting into the detached array — ink on screen that is in no list,
   * `hasInk` false over visible ink, the next full redraw erasing it — and Save would
   * flatten the sheets before the tail was drawn, then close the dialog with that tail
   * lost. The buttons are reachable mid-stroke on a desktop (a focused button and Space,
   * the mouse still held) and on any touchscreen that delivers a finger tap while the pen
   * is down, so the three are refused HERE rather than disabled in the render: dimming
   * them on every pen-down would flicker the header for the whole of every stroke.
   */
  const midStroke = () => current.current != null;

  function undo() {
    if (midStroke()) return;
    const s = sitting.current.pop();
    if (!s) return;
    setHasInk(sitting.current.length > 0);
    const [lo, hi] = span(s);
    redrawSpan(lo, hi);
  }

  function clear() {
    if (midStroke() || !sitting.current.length) return;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of sitting.current) {
      const [a, b] = span(s);
      if (a < lo) lo = a;
      if (b > hi) hi = b;
    }
    sitting.current = [];
    setHasInk(false);
    redrawSpan(lo, hi);
  }

  const adding = baseSheets > 0;
  const states = Object.values(baseStates);
  const anyError = states.includes("error");
  const loading = !anyError && states.includes("loading");
  /** Every saved sheet is present, or there was never one to wait for. Anything else and
   *  this canvas is not what it appears to be — see baseStates. */
  const safeToSave = !anyError && !loading;

  /**
   * SAVE: only the sheets that need writing (`sheetsToSave` says which, and why), each
   * flattened from its own canvas. On success those seqs join the record's set and this
   * sitting's strokes become settled, so a second save in the same sitting re-sends only
   * what changed since — the whole reason the page is split.
   */
  async function save() {
    if (!hasInk || !safeToSave || busy || midStroke()) return;
    const count = countRef.current;
    const table: SheetSaveState[] = [];
    for (let seq = 0; seq < count; seq++) {
      const dirty = sitting.current.some((s) => touches(s, seq));
      const inked =
        dirty ||
        settled.current.some((s) => touches(s, seq)) ||
        bases.current.get(seq)?.inkFrac != null;
      table.push({ seq, saved: savedSeqs.current.has(seq), dirty, inked });
    }
    const chosen = sheetsToSave(table);
    const list: SheetImage[] = [];
    for (const seq of chosen) {
      const c = canvases.current.get(seq);
      if (!c) {
        setSaveError("A sheet is not on screen. Close and reopen.");
        return;
      }
      list.push({ seq, image: c.toDataURL("image/png"), width: c.width, height: c.height });
    }
    if (!list.length) return;
    setSaveError(null);
    try {
      await onSave(list);
    } catch (e) {
      if (mounted.current)
        setSaveError(e instanceof Error && e.message ? e.message : "Could not save.");
      return;
    }
    if (!mounted.current) return;
    for (const seq of chosen) savedSeqs.current.add(seq);
    settled.current.push(...sitting.current);
    sitting.current = [];
    setHasInk(false);
  }

  const seqs: number[] = [];
  for (let s = 0; s < sheetCount; s++) seqs.push(s);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* The same chrome as the typed page, down to the rule under the title: two ways in to
          one artefact must not look like two products. The pen tools sit on the rule; the
          status line sits under it, where a change of wording can't shove the buttons. */}
      <div className="min-w-0">
        <div className="section-head">
          <h2 className="text-small font-semibold">
            {adding ? "This page" : live ? "Tonight's page" : "That day's page"}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={undo}
              disabled={!hasInk || busy}
              className="rounded-full border border-[var(--color-line-strong)] px-3.5 py-1.5 text-small transition-colors hover:bg-[var(--color-panel-2)] disabled:opacity-40"
            >
              Undo
            </button>
            <button
              onClick={clear}
              disabled={!hasInk || busy}
              className="rounded-full border border-[var(--color-line-strong)] px-3.5 py-1.5 text-small transition-colors hover:bg-[var(--color-panel-2)] disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>
        {/* Which of three things is true, and never a claim that the saved ink is present
            before it is. Weight 600 on the failure, not a hue: there is no red in this
            system, and this is the one line here that must not be missed. */}
        <p
          className={`mt-2 text-micro ${anyError ? "font-semibold" : "text-[var(--color-muted)]"}`}
          role={anyError ? "alert" : undefined}
        >
          {anyError
            ? "The page could not be loaded. Close and reopen."
            : loading
              ? "Fetching the page…"
              : `Pen writes · finger scrolls${sheetCount > 1 ? ` · ${sheetCount} sheets` : ""}`}
        </p>
      </div>

      {/* THE SCROLLER. `touch-pan-y` is what lets a finger scroll a page taller than the
          screen; while a pen stroke is down it becomes `touch-none` so a palm landing
          mid-word cannot drag the paper (touch-action is read at touch start, so the flip
          on pointerdown is in time for the palm; the pen's own contact is handled by the
          touchstart guard above). `overscroll-contain` keeps a flick at the bottom of the
          page from becoming a pull-to-refresh of the whole app. */}
      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${penDown ? "touch-none" : "touch-pan-y"}`}
      >
        {/* The paper: rounded and bordered ONCE, on the outside. The sheets inside are
            border-less and gap-less, so the scroll reads as one continuous ruled column
            and never confesses to being several pieces of paper. The border sits on this
            wrapper rather than on the pointer target below it, so a pointer's offset from
            the column's rect is the offset from the paper's edge, border and all. */}
        <div
          className="overflow-hidden rounded-2xl border border-[var(--color-line)]"
          style={{ background: PAPER }}
        >
          <div
            ref={colRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            className="relative w-full select-none"
            style={{ cursor: "crosshair" }}
          >
            {seqs.map((seq) => (
              <canvas
                key={seq}
                ref={(el) => {
                  if (el) canvases.current.set(seq, el);
                  else canvases.current.delete(seq);
                }}
                className="block w-full"
                style={{ aspectRatio: `1 / ${SHEET_RATIO}` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-micro ${saveError ? "font-semibold" : "text-[var(--color-muted)]"}`}
          role={saveError ? "alert" : undefined}
        >
          {saveError
            ? saveError
            : busy
              ? "Saving…"
              : anyError
                ? "Cannot save."
                : loading
                  ? "Waiting for the page…"
                  : hasInk
                    ? "Ready to save."
                    : adding
                      ? "Nothing added yet."
                      : "Empty page."}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-[var(--color-line-strong)] px-3.5 py-1.5 text-small transition-colors hover:bg-[var(--color-panel-2)] disabled:opacity-40"
          >
            Close
          </button>
          <button
            onClick={save}
            disabled={!hasInk || busy || !safeToSave}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Saving…" : adding ? "Save" : "Save page"}
          </button>
        </div>
      </div>
    </div>
  );
}
