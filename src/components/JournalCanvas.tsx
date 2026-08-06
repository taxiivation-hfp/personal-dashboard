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
 */
export default function JournalCanvas({
  onSave,
  onCancel,
  busy,
}: {
  onSave: (dataUrl: string, w: number, h: number) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [penType, setPenType] = useState<string>("");

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fdfbf6"; // paper
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // RULED LINES. Handwriting is markedly easier on a lined page — without them the
    // hand drifts and lines wander. Drawn in device pixels before the DPR transform is
    // reapplied, so spacing is consistent on any display.
    const gap = 34 * dpr; // ~34 CSS px: comfortable for adult handwriting
    ctx.strokeStyle = "#dfd6c4";
    ctx.lineWidth = 1;
    for (let y = gap * 1.5; y < canvas.height; y += gap) {
      ctx.beginPath();
      ctx.moveTo(24 * dpr, y);
      ctx.lineTo(canvas.width - 24 * dpr, y);
      ctx.stroke();
    }
    // A single margin rule, the way a notebook has one.
    ctx.strokeStyle = "#e8d3cc";
    ctx.beginPath();
    ctx.moveTo(56 * dpr, 0);
    ctx.lineTo(56 * dpr, canvas.height);
    ctx.stroke();
    ctx.restore();

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#141418";
    for (const stroke of strokes.current) {
      if (stroke.length < 2) {
        // A tap is a dot; without this a single point would leave no mark at all.
        const p = stroke[0];
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
        ctx.fillStyle = "#141418";
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

  // Size the backing store to the device pixel ratio, or handwriting is soft on a
  // retina/high-DPI screen — which is exactly where a stylus gets used.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [redraw]);

  function widthFor(e: React.PointerEvent): number {
    // pressure is 0 for a hovering pen and exactly 0.5 for devices that don't report it.
    if (e.pointerType === "pen" && e.pressure > 0) return 0.6 + e.pressure * 4.4;
    return 2.2;
  }

  function pointFrom(e: React.PointerEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: widthFor(e) };
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
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    if (events.length) {
      const rect = e.currentTarget.getBoundingClientRect();
      for (const ev of events) {
        current.current.push({
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
          w: ev.pointerType === "pen" && ev.pressure > 0 ? 0.6 + ev.pressure * 4.4 : 2.2,
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

  function save() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    onSave(canvas.toDataURL("image/png"), canvas.width, canvas.height);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-wide">Tonight&apos;s page</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            {penType === "pen"
              ? "Stylus detected — pressure is shaping the line."
              : "Write with a stylus, finger, or mouse. It gets saved as handwriting, not text."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={undo}
            disabled={!hasInk || busy}
            className="rounded-xl border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
          >
            Undo
          </button>
          <button
            onClick={clear}
            disabled={!hasInk || busy}
            className="rounded-xl border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
          >
            Clear
          </button>
        </div>
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
          style={{ aspectRatio: "1 / 1.4142", height: "100%", background: "#fdfbf6", cursor: "crosshair" }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--color-muted)]">
          {busy ? "Saving and reading it…" : hasInk ? "Ready to save." : "Empty page."}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-[var(--color-line)] px-3.5 py-2 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
          >
            Close
          </button>
          <button
            onClick={save}
            disabled={!hasInk || busy}
            className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save page"}
          </button>
        </div>
      </div>
    </div>
  );
}
