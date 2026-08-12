"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Stroke = { x: number; y: number; w: number }[];

/**
 * Handwriting surface.
 *
 * Pointer Events rather than mouse/touch listeners: it's the only API that reports
 * `pressure` and `pointerType`, and it unifies pen, finger and mouse in one handler.
 *
 * Width is driven by pressure so a real stylus produces natural line variation. A
 * mouse always reports pressure 0.5 (and 0 while hovering), so mouse and finger input
 * fall back to a fixed width — otherwise every mouse-drawn line would render at the
 * same dead midpoint and look broken rather than deliberate.
 *
 * A page can be REOPENED and added to. `base` is the saved page, drawn under the pen; new
 * strokes land on top and Save replaces the row with the fuller page. What it cannot do is
 * take a stroke back OUT of the saved ink: only a flat PNG was ever stored, so yesterday's
 * strokes are pixels now and there is nothing to pop. Undo and Clear are therefore about
 * THIS SITTING, and the note under the title says so rather than leaving it to be
 * discovered by a tap that does nothing.
 */

/**
 * The ruling, and the ONLY place the canvas states it.
 *
 * Eighteen lines to a page, whatever the page measures — the same rule `.sheet` draws in
 * CSS for the typed page, the thumbnail and the reader. It used to be a flat 34px here and
 * a flat 34px there, two constants agreeing by hand, which meant a canvas laid out at a
 * different height quietly ruled itself tighter than the page beside it.
 */
const SHEET_RATIO = 1.4142;
const SHEET_LINES = 18;
/** The margin rule, as a fraction of the page's width — 13cqw in `.sheet`. */
const MARGIN_FRAC = 0.13;

export default function JournalCanvas({
  base,
  live = true,
  onSave,
  onCancel,
  busy,
}: {
  /** The saved page, as a URL, when one is being added to. Null for a blank sheet. */
  base?: string | null;
  /** Is the page being written for the real today? The title, and nothing else. */
  live?: boolean;
  onSave: (dataUrl: string, w: number, h: number) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  /** The saved page, once it has arrived. A ref because redraw reads it every frame and
   *  nothing on screen branches on the object itself. */
  const baseImg = useRef<HTMLImageElement | null>(null);
  /**
   * Has the saved page actually ARRIVED?
   *
   * The most dangerous state this component can be in is one where it looks like it is
   * adding to a page and is in fact holding a blank one. Save flattens the canvas and
   * PATCHes it over the row, so a stroke drawn while the base was still in flight — or
   * after the image failed outright — would replace the only copy of some handwriting with
   * paper, rules and that stroke. There is no undo for that anywhere in this app.
   *
   * So the state is tracked and Save is gated on it, rather than gated on `hasInk` alone.
   * 'error' is a separate answer from 'loading' because the two need different words: one
   * is a wait and the other is a wall.
   */
  const [baseState, setBaseState] = useState<"none" | "loading" | "ready" | "error">(
    base ? "loading" : "none",
  );
  const [hasInk, setHasInk] = useState(false);
  const [penType, setPenType] = useState<string>("");

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fdfbf6"; // paper — --paper in globals.css
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (baseImg.current) {
      // THE PAGE AS IT WAS SAVED, ruling and all: the PNG already carries its own rules,
      // so drawing a second set under it would be a second set showing through the paper.
      //
      // FITTED, NEVER STRETCHED, and this is handwriting so it matters more than it looks.
      // Pages saved before the A4 rule landed are whatever shape the dialog happened to be,
      // and filling the canvas with one would squash the owner's own hand — then flatten
      // the squash into the row on the next save, permanently. Letterboxed onto the paper
      // instead: the bars are blank because the ruling belongs to the image, and a second
      // set of rules running through them would be two pages showing at once.
      const img = baseImg.current;
      const scale = Math.min(
        canvas.width / img.width,
        canvas.height / img.height,
      );
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    } else {
      // RULED LINES. Handwriting is markedly easier on a lined page — without them the
      // hand drifts and lines wander. Drawn in device pixels before the DPR transform is
      // reapplied, and derived from the canvas's own width, so a page ruled here matches
      // one ruled by CSS at any size on any display.
      const gap = (canvas.width * SHEET_RATIO) / SHEET_LINES;
      const margin = canvas.width * MARGIN_FRAC;
      // Canvas cannot read CSS variables, so the paper palette is mirrored here. Keep these
      // in step with globals.css: PAPER #fdfbf6, RULE --color-line, INK --color-ink.
      ctx.strokeStyle = "#e2dbcd"; // --color-line
      ctx.lineWidth = 1;
      for (let y = gap; y < canvas.height; y += gap) {
        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      // A single margin rule, the way a notebook has one. Warm tan rather than the old
      // pinkish red — this app has no red anywhere, deliberately.
      ctx.strokeStyle = "#cfc5b2"; // --color-line-strong
      ctx.beginPath();
      ctx.moveTo(margin, 0);
      ctx.lineTo(margin, canvas.height);
      ctx.stroke();
    }
    ctx.restore();

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#23201b"; // --color-ink
    for (const stroke of strokes.current) {
      if (stroke.length < 2) {
        // A tap is a dot; without this a single point would leave no mark at all.
        const p = stroke[0];
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
        ctx.fillStyle = "#23201b"; // --color-ink
        ctx.fill();
        continue;
      }
      // Segment-by-segment so each one can carry its own pressure-derived width.
      for (let i = 1; i < stroke.length; i++) {
        ctx.beginPath();
        ctx.lineWidth = (stroke[i].w + stroke[i - 1].w) / 2;
        ctx.moveTo(stroke[i - 1].x, stroke[i - 1].y);
        ctx.lineTo(stroke[i].x, stroke[i].y);
        ctx.stroke();
      }
    }
  }, []);

  // The saved page, fetched as a real image rather than handed over as base64 in a JSON
  // envelope — it is same-origin, so the canvas stays untainted and toDataURL still works.
  useEffect(() => {
    if (!base) {
      baseImg.current = null;
      setBaseState("none");
      redraw();
      return;
    }
    let alive = true;
    setBaseState("loading");
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      baseImg.current = img;
      setBaseState("ready");
      redraw();
    };
    // A page that cannot be fetched must not become a page that can be overwritten.
    img.onerror = () => {
      if (!alive) return;
      baseImg.current = null;
      setBaseState("error");
      redraw();
    };
    img.src = base;
    return () => {
      alive = false;
    };
  }, [base, redraw]);

  // Size the backing store to the device pixel ratio, or handwriting is soft on a
  // retina/high-DPI screen — which is exactly where a stylus gets used.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // Skip if not laid out yet
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    setTimeout(fit, 50);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [redraw]);

  function widthFor(e: React.PointerEvent): number {
    // pressure is 0 for a hovering pen and exactly 0.5 for devices that don't report it.
    if (e.pointerType === "pen" && e.pressure > 0)
      return 0.6 + e.pressure * 4.4;
    return 2.2;
  }

  function pointFrom(e: React.PointerEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      w: widthFor(e),
    };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (busy) return;
    // Capture so a fast stroke that leaves the canvas still finishes cleanly.
    e.currentTarget.setPointerCapture(e.pointerId);
    setPenType(e.pointerType);
    current.current = [pointFrom(e)];
    strokes.current.push(current.current);
    setHasInk(true);
    redraw();
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!current.current) return;
    // Coalesced events recover the full sample rate of a high-frequency stylus;
    // without this a fast stroke is drawn from far fewer points and looks angular.
    const events =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [];
    if (events.length) {
      const rect = e.currentTarget.getBoundingClientRect();
      for (const ev of events) {
        current.current.push({
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
          w:
            ev.pointerType === "pen" && ev.pressure > 0
              ? 0.6 + ev.pressure * 4.4
              : 2.2,
        });
      }
    } else {
      current.current.push(pointFrom(e));
    }
    redraw();
  }

  function up() {
    current.current = null;
  }

  function undo() {
    strokes.current.pop();
    setHasInk(strokes.current.length > 0);
    redraw();
  }

  function clear() {
    strokes.current = [];
    setHasInk(false);
    redraw();
  }

  const adding = Boolean(base);
  /** The saved page is present, or there was never one to wait for. Anything else and this
   *  canvas is not what it appears to be — see baseState. */
  const safeToSave = baseState === "none" || baseState === "ready";

  function save() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk || !safeToSave) return;
    onSave(canvas.toDataURL("image/png"), canvas.width, canvas.height);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* The same chrome as the typed page, down to the rule under the title: two ways in to
          one artefact must not look like two products. The pen tools sit on the rule; the
          line about what the pen is doing sits under it, where a change of wording can't
          shove the buttons around. */}
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
        {/* The note says which of three things is true, and it never claims the saved ink
            is present before it is. Weight 600 on the failure, not a hue: there is no red
            in this system, and this is the one message here that must not be missed. */}
        <p
          className={`mt-2 text-micro ${baseState === "error" ? "font-semibold" : "text-[var(--color-muted)]"}`}
          role={baseState === "error" ? "alert" : undefined}
        >
          {baseState === "error"
            ? "This page could not be loaded, so there is nothing to add to. Close and try again — saving now would replace what is stored with a blank sheet."
            : baseState === "loading"
              ? "Fetching the page you wrote…"
              : adding
                ? "What you wrote before is under the pen. Undo and Clear only take back what you add now — the saved ink was flattened when it was saved."
                : penType === "pen"
                  ? "Stylus detected — pressure is shaping the line."
                  : "Write with a stylus, finger, or mouse. It gets saved as handwriting, not text."}
        </p>
      </div>

      {/* A4 PORTRAIT, 1:1.414. The page used to be whatever shape the dialog happened to
          be, which meant a saved page had no consistent proportions. Letterboxed inside
          the dialog so the shape is the paper's, not the window's. */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          // touch-none stops the browser scrolling the page instead of drawing on a tablet.
          className="max-h-full max-w-full touch-none rounded-2xl border border-[var(--color-line)]"
          style={{
            aspectRatio: "1 / 1.4142",
            height: "100%",
            background: "#fdfbf6",
            cursor: "crosshair",
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-micro text-[var(--color-muted)]">
          {busy
            ? "Saving…"
            : !safeToSave
              ? baseState === "error"
                ? "Cannot save over a page it could not read."
                : "Waiting for the page…"
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
