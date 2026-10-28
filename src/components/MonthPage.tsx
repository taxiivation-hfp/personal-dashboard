"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
} from "react";
import type { GoalView, TimelineData, TimelineWindow } from "@/lib/queries";
import { daysBetween } from "@/lib/dates";
import { dueStep } from "@/lib/due";
import {
  WINDOW_TEXT_MAX,
  WINDOW_TINTS,
  goalMonths,
  noteInMonth,
  timelineYears,
  tintHex,
} from "@/lib/timeline";
import GoalList from "./GoalList";

export type MonthPageProps = {
  /** YYYY-MM */
  month: string;
  /** YYYY-MM-DD */
  today: string;
  store: TimelineData;
  /** Apply a whole-store response, or an updater for an optimistic local edit. */
  onStore: (s: TimelineData | ((cur: TimelineData) => TimelineData)) => void;
  /** ALL goals; this page keeps those whose goalMonths include the month. */
  goals: GoalView[];
  /** Today's mutateGoals. */
  onGoals: (url: string, init: RequestInit) => Promise<void>;
  onBack: () => void;
  onRecords: () => void;
};

/** What the note menu edits before it closes. */
type MenuDraft = Pick<TimelineWindow, "color" | "months" | "allMonths">;

type Send = (url: string, method: string, body: unknown) => Promise<(TimelineData & { id?: number }) | null>;

const CARD_W = 232;
const COL_GAP = 270;
const ROW_GAP = 200;
const TOP = 74;

const lastDayOf = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y!, m!, 0).getDate()).padStart(2, "0")}`;
};

/** The staggered grid an unplaced item lands on: 3 columns, slight offsets by row/column. */
const autoSlot = (i: number): { x: number; y: number } => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  return {
    x: col * COL_GAP + (row % 2) * 30,
    y: TOP + row * ROW_GAP + (col === 1 ? 38 : 0),
  };
};

const dueWords = (due: string, today: string): string => {
  const d = daysBetween(today, due);
  if (d < 0) return "late";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d} days`;
};

/** The month's description, edited in place: blur saves, Enter blurs, Escape abandons,
 *  an empty save clears the row (the old Timeline EditableText contract). */
function EditableNote({
  value,
  onSave,
}: {
  value: string;
  onSave: (text: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  const save = async () => {
    const next = draft.trim();
    setEditing(false);
    if (next === value) return;
    await onSave(next || null);
  };

  const cls = "mt-3.5 w-full font-serif text-body";
  if (editing)
    return (
      <textarea
        ref={ref}
        value={draft}
        rows={3}
        maxLength={500}
        aria-label="Month note"
        placeholder="add a note"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) (e.target as HTMLElement).blur();
          if (e.key === "Escape") {
            e.stopPropagation();
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`${cls} resize-none border-b border-[var(--color-accent)] bg-transparent text-[var(--color-ink)] outline-none placeholder:text-[var(--color-placeholder)]`}
      />
    );
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label="Edit month note"
      className={`${cls} text-left ${value ? "text-[var(--color-ink)]" : "text-[var(--color-placeholder)]"}`}
    >
      {value || "add a note"}
    </button>
  );
}

type Item =
  | { key: string; kind: "goal"; goal: GoalView }
  | { key: string; kind: "note"; win: TimelineWindow };

export default function MonthPage({
  month,
  today,
  store,
  onStore,
  goals,
  onGoals,
  onBack,
  onRecords,
}: MonthPageProps) {
  const [year, mm] = month.split("-");
  const monthName = new Date(Number(year), Number(mm) - 1, 1).toLocaleDateString(
    "en-AU",
    { month: "long" },
  );
  const chapter = store.chapters[month];
  const lastDay = lastDayOf(month);

  const monthGoals = useMemo(
    () => goals.filter((g) => goalMonths(g, today).includes(month)),
    [goals, today, month],
  );
  const notes = useMemo(
    () => store.windows.filter((w) => w.kind === "text" && noteInMonth(w, month)),
    [store.windows, month],
  );
  // The years a note's month picker steps through: the timeline's own range.
  const years = useMemo(() => {
    const data = new Set<string>([month]);
    for (const m of Object.keys(store.chapters)) data.add(m);
    for (const m of Object.keys(store.notes)) data.add(m);
    for (const w of store.windows) if (w.kind === "text") for (const m of w.months) data.add(m);
    for (const g of goals) for (const m of goalMonths(g, today)) data.add(m);
    return timelineYears(today, [...data]);
  }, [store, goals, today, month]);
  const avg = monthGoals.length
    ? Math.round(
        (monthGoals.reduce((s, g) => s + g.progress, 0) / monthGoals.length) * 100,
      )
    : 0;

  // Every store route answers with the whole store, or { error }. Writes go out one at a
  // time in click order, so the server ends where the screen does, and only the newest
  // answer is applied: an older store landing late would undo an optimistic edit made since.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef(0);
  const send: Send = (url, method, body) => {
    const n = ++latest.current;
    const run = async () => {
      try {
        const r = await fetch(url, { method, body: JSON.stringify(body) });
        const d = await r.json();
        if (r.ok && !d.error) {
          if (n === latest.current) onStore(d as TimelineData);
          return d;
        }
      } catch {}
      // A refused write: put the screen back to what the server actually holds.
      if (n === latest.current)
        fetch("/api/timeline")
          .then((r) => r.json())
          .then((d) => d && !d.error && onStore(d as TimelineData))
          .catch(() => {});
      return null;
    };
    const p = queue.current.then(run);
    queue.current = p;
    return p;
  };
  // Show a note edit at once; the queued write's answer confirms it.
  const local = (id: number, change: Partial<TimelineWindow>) =>
    onStore((s) => ({
      ...s,
      windows: s.windows.map((w) => (w.id === id ? { ...w, ...change } : w)),
    }));

  // ---- board positions ----
  const saved = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const b of store.board) if (b.month === month) m.set(b.item, b);
    return m;
  }, [store.board, month]);

  const items: Item[] = useMemo(
    () => [
      ...monthGoals.map((g): Item => ({ key: `goal:${g.id}`, kind: "goal", goal: g })),
      ...notes.map((w): Item => ({ key: `note:${w.id}`, kind: "note", win: w })),
    ],
    [monthGoals, notes],
  );

  // Every card is independent: a saved card sits where it was put, an unplaced one on the
  // slot of its own place in the list. Neither looks at any other card.
  const pos = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>();
    items.forEach((it, i) => {
      const s = saved.get(it.key);
      out.set(it.key, s ? { x: s.x, y: s.y } : autoSlot(i));
    });
    return out;
  }, [items, saved]);

  // ---- drag (4px threshold so a click is still a click) ----
  const [drag, setDrag] = useState<{ key: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{
    key: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);

  const down = (key: string) => (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button,input,textarea,a")) return;
    const p = pos.get(key)!;
    dragRef.current = {
      key,
      sx: e.clientX,
      sy: e.clientY,
      ox: p.x,
      oy: p.y,
      moved: false,
      x: p.x,
      y: p.y,
    };
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId); // only a real drag captures, so a plain click still reaches the text
    d.moved = true;
    d.x = Math.max(0, d.ox + dx);
    d.y = Math.max(0, d.oy + dy);
    setDrag({ key: d.key, x: d.x, y: d.y });
  };
  const up = async () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d?.moved) return setDrag(null);
    await send("/api/timeline/board", "PATCH", {
      month,
      item: d.key,
      x: Math.round(d.x),
      y: Math.round(d.y),
    });
    setDrag(null);
  };

  const at = (key: string) =>
    drag?.key === key ? drag : (pos.get(key) ?? { x: 0, y: 0 });

  // ---- notes / goals ----
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const cancelled = useRef(false);

  const addNote = async () => {
    const d = await send("/api/timeline/windows", "POST", { kind: "text", x: 0, y: 0, month });
    if (d?.id != null) setEditingNote(d.id);
  };
  const addGoal = async () => {
    const t = cancelled.current ? "" : title.trim();
    cancelled.current = false;
    setAdding(false);
    setTitle("");
    if (!t) return;
    await onGoals("/api/goals", {
      method: "POST",
      body: JSON.stringify({ title: t, deadline: lastDay, targetCount: null }),
    });
  };

  let extentW = 820;
  let extentH = 600;
  for (const it of items) {
    const p = at(it.key);
    extentW = Math.max(extentW, p.x + CARD_W + 40);
    extentH = Math.max(extentH, p.y + 260);
  }

  return (
    <div className="absolute inset-0 flex gap-7 px-8 py-7">
      {/* LEFT: the month window */}
      <section className="window relative flex h-full w-[470px] flex-none flex-col rounded-[22px] bg-[var(--color-panel)] px-[30px] pt-[30px]">
        <button
          type="button"
          onClick={onBack}
          aria-label="Close and return to timeline"
          className="absolute right-6 top-[22px] flex h-8 w-8 items-center justify-center rounded-lg text-xl leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-ink)]"
        >
          ×
        </button>
        <div className="text-micro font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
          {year}
          {chapter ? ` · ${chapter}` : ""}
        </div>
        <h2 className="mt-2 font-serif text-hero font-medium tracking-tight">{monthName}</h2>
        <EditableNote
          value={store.notes[month] ?? ""}
          onSave={async (text) => {
            await send("/api/timeline", "POST", { kind: "note", month, text });
          }}
        />
        <div className="mt-[22px] flex items-center justify-between border-y border-[var(--color-line)] py-3 text-small text-[var(--color-ink)]">
          <span>Goals this month</span>
          <span className="text-[var(--color-muted)]">
            {monthGoals.length} {monthGoals.length === 1 ? "goal" : "goals"} · {avg}% avg
          </span>
        </div>
        <div className="-mr-3.5 min-h-0 flex-1 overflow-y-auto pb-24 pr-3.5">
          <GoalList goals={monthGoals} onGoals={onGoals} date={today} defaultDeadline={lastDay} />
        </div>
      </section>

      {/* RIGHT: the board */}
      <section aria-label={`${monthName} board`} className="relative min-w-0 flex-1">
        <div className="absolute left-0 right-0 top-1 z-10 flex items-center justify-between">
          <h3 className="font-serif text-[22px] font-medium">The board</h3>
          <div className="flex gap-2.5">
            <button type="button" className="pill pill-sm" onClick={() => setAdding(true)}>
              + Goal
            </button>
            <button type="button" className="pill pill-sm" onClick={addNote}>
              + Note
            </button>
          </div>
        </div>
        <div className="absolute inset-0 overflow-auto pb-24">
          <div className="relative" style={{ width: extentW, height: extentH }}>
            {items.map((it) => {
              const p = at(it.key);
              const dragging = drag?.key === it.key;
              const common = {
                onPointerDown: down(it.key),
                onPointerMove: move,
                onPointerUp: up,
                onPointerCancel: up,
                dragging,
                style: {
                  left: p.x,
                  top: p.y,
                  touchAction: "none",
                  zIndex: dragging ? 5 : undefined,
                } as CSSProperties,
              };
              if (it.kind === "goal")
                return (
                  <GoalCard
                    key={it.key}
                    goal={it.goal}
                    today={today}
                    onGoals={onGoals}
                    {...common}
                  />
                );
              return (
                <NoteCard
                  key={it.key}
                  win={it.win}
                  month={month}
                  years={years}
                  editing={editingNote === it.win.id}
                  setEditing={(v) => setEditingNote(v ? it.win.id : null)}
                  send={send}
                  local={local}
                  {...common}
                />
              );
            })}
            {adding && (
              <div
                className="board-card absolute left-0 top-0 rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-[18px]"
                style={{ width: CARD_W }}
              >
                <input
                  autoFocus
                  value={title}
                  maxLength={120}
                  aria-label="New goal title"
                  placeholder="new goal"
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={addGoal}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLElement).blur();
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      cancelled.current = true;
                      (e.target as HTMLElement).blur();
                    }
                  }}
                  className="w-full border-b border-[var(--color-accent)] bg-transparent font-serif text-body outline-none placeholder:text-[var(--color-placeholder)]"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="absolute bottom-7 right-8 z-20 flex gap-3">
        <button type="button" className="pill" onClick={onBack}>
          Return to timeline
        </button>
        <button type="button" className="pill pill-dark" onClick={onRecords}>
          Records
        </button>
      </div>
    </div>
  );
}

type DragProps = {
  onPointerDown: (e: RPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: RPointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  style: CSSProperties;
  dragging: boolean;
};

function GoalCard({
  goal: g,
  today,
  onGoals,
  dragging,
  style,
  ...handlers
}: Omit<DragProps, "dragging"> & {
  dragging: boolean;
  goal: GoalView;
  today: string;
  onGoals: (url: string, init: RequestInit) => Promise<void>;
}) {
  const done = g.status === "done";
  const next = g.subgoals.find((s) => !s.done);
  const step = next?.due ? dueStep(next.due, today) : null;
  const pct = Math.round(g.progress * 100);
  return (
    <div
      {...handlers}
      style={{ ...style, width: CARD_W }}
      className={`board-card absolute select-none rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-[18px] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Reopen ${g.title}` : `Mark ${g.title} done`}
          onClick={() =>
            onGoals(`/api/goals/${g.id}`, {
              method: "PATCH",
              body: JSON.stringify({ status: done ? "active" : "done" }),
            })
          }
          className={`mt-[3px] flex h-4 w-4 flex-none items-center justify-center rounded border-[1.5px] text-[10px] leading-none ${done ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white" : "border-[var(--color-line-strong)]"}`}
        >
          {done ? "✓" : ""}
        </button>
        <span
          className={`flex-1 font-serif text-body leading-snug ${done ? "text-[var(--color-muted)] line-through" : ""}`}
        >
          {g.title}
        </span>
        <button
          type="button"
          aria-label={`Drop ${g.title}`}
          onClick={() =>
            confirm(`Drop "${g.title}"? Its subtasks are kept.`) &&
            onGoals(`/api/goals/${g.id}`, { method: "DELETE" })
          }
          className="text-small leading-none text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
        >
          ×
        </button>
      </div>
      <div className="mt-3.5 flex items-center gap-2.5">
        <div className="h-1 flex-1 overflow-hidden rounded-sm bg-[var(--color-line)]">
          <div
            className="h-full rounded-sm bg-[var(--color-accent)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] text-[var(--color-muted)]">{pct}%</span>
      </div>
      {next && (
        <div className="mt-3 text-micro text-[var(--color-muted)]">
          next ·{" "}
          <span
            className="text-[var(--color-ink)]"
            style={step != null ? { color: `var(--color-due-${step})` } : undefined}
          >
            {next.title}
            {next.due && step != null ? ` · ${dueWords(next.due, today)}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

const MONTH_CHIPS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function NoteCard({
  win,
  month,
  years,
  editing,
  setEditing,
  send,
  local,
  dragging,
  style,
  ...handlers
}: DragProps & {
  win: TimelineWindow;
  /** The month of the board this card sits on. */
  month: string;
  years: number[];
  editing: boolean;
  setEditing: (v: boolean) => void;
  send: Send;
  local: (id: number, change: Partial<TimelineWindow>) => void;
}) {
  const [draft, setDraft] = useState(win.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setDraft(win.text), [win.text]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  // The menu edits a private copy (colour, months, all months): clicks only redraw, and
  // nothing reaches the server until the menu closes — then the whole change goes in one
  // write, and only if something actually changed.
  const [pick, setPick] = useState<MenuDraft | null>(null);
  const menu = pick !== null;
  const shown = pick ?? win;
  const hex = tintHex(shown.color);
  const [yr, setYr] = useState(Number(month.slice(0, 4)));
  const menuRef = useRef<HTMLDivElement>(null);
  const openMenu = () => {
    setYr(Number(month.slice(0, 4)));
    setPick({ color: win.color, months: win.months, allMonths: win.allMonths });
  };
  const closeMenu = () => {
    if (!pick) return;
    setPick(null);
    const change: Partial<TimelineWindow> = {};
    if (pick.color !== win.color) change.color = pick.color;
    if (pick.allMonths !== win.allMonths) change.allMonths = pick.allMonths;
    if (pick.months.join() !== win.months.join()) change.months = pick.months;
    if (!Object.keys(change).length) return;
    local(win.id, change);
    send("/api/timeline/windows", "PATCH", { id: win.id, ...change });
  };
  // The listeners below outlive renders; they reach the current closeMenu through this.
  const close = useRef(closeMenu);
  close.current = closeMenu;
  useEffect(() => {
    if (!menu) return;
    // Escape closes the menu and ONLY the menu: caught in the capture phase and stopped, so
    // Timeline's step-back listener on window never sees it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close.current();
    };
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) close.current();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [menu]);
  // Leaving the page with the menu still open keeps what was picked.
  useEffect(() => () => close.current(), []);
  const save = async () => {
    setEditing(false);
    if (draft !== win.text)
      await send("/api/timeline/windows", "PATCH", { id: win.id, text: draft });
  };
  const toggleMonth = (m: string) =>
    setPick((p) => {
      if (!p || p.allMonths) return p;
      const next = p.months.includes(m) ? p.months.filter((x) => x !== m) : [...p.months, m];
      if (!next.length) return p; // a note always keeps at least one month
      return { ...p, months: next.sort() };
    });
  const toggleAll = () =>
    setPick((p) =>
      !p
        ? p
        : p.allMonths && !p.months.length
          ? { ...p, allMonths: false, months: [month] }
          : { ...p, allMonths: !p.allMonths },
    );
  const remove = () => {
    if ((win.allMonths || win.months.length > 1) && !confirm("Delete this note from every month?"))
      return;
    send("/api/timeline/windows", "DELETE", { id: win.id });
  };

  return (
    <div
      {...handlers}
      style={{
        ...style,
        width: 236,
        background: hex ?? "var(--color-panel)",
        borderColor: hex
          ? `color-mix(in srgb, ${hex} 85%, #000)`
          : "var(--color-line)",
      }}
      className={`group absolute select-none rounded-2xl border px-[22px] py-5 font-serif text-[15px] leading-normal text-[var(--color-ink)] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
    >
      <div
        ref={menuRef}
        className="absolute right-2 top-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center gap-1 transition-opacity focus-within:opacity-100 group-hover:opacity-100 ${menu ? "opacity-100" : "opacity-0"}`}
        >
          <button
            type="button"
            onClick={() => (menu ? closeMenu() : openMenu())}
            aria-label="Note colour and months"
            aria-expanded={menu}
            className="h-3.5 w-3.5 rounded-full border border-[var(--color-line-strong)]"
            style={{ background: hex ?? "var(--color-panel)" }}
          />
          <button
            type="button"
            aria-label="Delete note"
            onClick={remove}
            className="px-1 text-small leading-none text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            ×
          </button>
        </div>
        {menu && (
          <div
            className="popover absolute right-0 top-6 w-[208px] cursor-default p-3 text-[var(--color-ink)]"
            style={{ position: "absolute" }}
          >
            <div className="flex flex-wrap gap-1.5">
              {WINDOW_TINTS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-label={t.name}
                  aria-pressed={t.key === shown.color}
                  onClick={() => setPick((p) => p && { ...p, color: t.key })}
                  className="h-4 w-4 rounded-full border border-[var(--color-line-strong)]"
                  style={{
                    background: t.hex,
                    outline: t.key === shown.color ? "2px solid var(--color-accent)" : undefined,
                    outlineOffset: 1,
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              aria-pressed={shown.allMonths}
              onClick={toggleAll}
              className={`mt-3 w-full rounded-lg border px-2 py-1 font-sans text-micro ${shown.allMonths ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-line)]"}`}
            >
              All months
            </button>
            <div className="mt-3 flex items-center justify-between font-sans text-micro">
              <button
                type="button"
                aria-label="Previous year"
                disabled={yr <= years[0]!}
                onClick={() => setYr((y) => y - 1)}
                className="px-1.5 disabled:opacity-30"
              >
                ‹
              </button>
              <span>{yr}</span>
              <button
                type="button"
                aria-label="Next year"
                disabled={yr >= years[years.length - 1]!}
                onClick={() => setYr((y) => y + 1)}
                className="px-1.5 disabled:opacity-30"
              >
                ›
              </button>
            </div>
            <div className={`mt-1.5 grid grid-cols-4 gap-1 ${shown.allMonths ? "opacity-60" : ""}`}>
              {MONTH_CHIPS.map((name, i) => {
                const m = `${yr}-${String(i + 1).padStart(2, "0")}`;
                const on = shown.allMonths || shown.months.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={shown.allMonths}
                    aria-pressed={on}
                    onClick={() => toggleMonth(m)}
                    className={`rounded-md border py-1 font-sans text-micro ${on ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-panel)]" : "border-[var(--color-line)]"}`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          ref={ref}
          value={draft}
          rows={4}
          maxLength={WINDOW_TEXT_MAX}
          aria-label="Note text"
          placeholder="write a note"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setDraft(win.text);
              setEditing(false);
            }
          }}
          className="w-full resize-none bg-transparent outline-none placeholder:text-[var(--color-placeholder)]"
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className={`min-h-[3rem] cursor-text whitespace-pre-wrap ${win.text ? "" : "text-[var(--color-placeholder)]"}`}
        >
          {win.text || "write a note"}
        </div>
      )}
    </div>
  );
}
