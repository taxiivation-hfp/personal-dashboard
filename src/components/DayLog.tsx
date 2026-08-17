"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import Sheet from "./Sheet";
import { toneColor } from "./PillarRing";
import type { PillarKey } from "@/lib/rings";
import type { LogDay, LogEntry, LogKind } from "@/lib/dayLog";

/**
 * THE WRITTEN RECORD — every word this app holds, by the day it was written.
 *
 * The second half of the record, beside the stats. It exists because everything the owner
 * WRITES lived on a different screen from everything else they wrote: journal pages on
 * /journal, workouts on /sessions, skill sessions inside a pillar drill-down, drift reasons
 * nowhere at all. Each of those answers "show me my gym log". None answered "what did I write
 * down on the 12th", which is the question actually being asked.
 *
 * A GRID OF DAYS, the owner's ruling — the file-explorer shape, replacing the two-shape
 * scroll (a card for a journalled day, a chip row for the rest) that spent a screen of
 * height per day. The unit is a TILE: on a day with a page, the page IS the tile, the way
 * a file's icon is the file; on a day without one, the tile is card stock carrying what was
 * logged. Months are the folders, drawn full-width with the archive's own dividers, and a
 * month grows as more of it streams in.
 *
 * WHAT ELSE A DAY HOLDS IS DRAWN AS TABS — the owner's ruling, replacing a rail of bare
 * dots. A tab carries the attachment's own title on its kind's colour, the way a binder
 * tab names what it marks; a dot could only say THAT something happened, and the question
 * this screen answers is WHAT. Drift is the exception and stays unfilled: it is the one
 * entry that records something not going to plan, and this app does not colour that.
 *
 * ONE TAP OPENS THE DAY, as the journal-reader spread: the page at reading size in the
 * main pane and the day's logs beside it — the same two-pane document the workout dialog
 * is, where last week's sessions sit beside the one being written. Here the side pane is
 * the day's attachments, bodies unfolded, because the overlay IS the expansion.
 *
 * IT OWNS NOTHING. Every entry belongs to the surface that created it and this is a reader —
 * no writing, no editing, no deleting. A journal page opens in the journal, which is where a
 * page can be rewritten. That keeps the app's one rule about duplicated records intact: two
 * places that can change one row eventually disagree about it.
 *
 * Days holding nothing are omitted upstream (see dayLog.ts), so a quiet fortnight costs one
 * thin month rather than fourteen tiles saying you wrote nothing.
 */

/**
 * The pillar a kind belongs to, and its hue is resolved through `toneColor` — the OWNER'S
 * chosen colour from /colours winning over the CSS default, the exact resolution the
 * rings run. It was `var(--color-physical)` etc. here, which is only the default half of
 * that resolution, so a recoloured pillar left its ring one hue and its tabs another —
 * two screens disagreeing about what a colour means. The curated palette is certified
 * for white on top (the chip test in CLAUDE.md), which is what lets any of these fill a
 * tab behind white text. Drift is deliberately absent: it belongs to a calendar block
 * rather than to a pillar, and its tab is drawn unfilled.
 */
const KIND_PILLAR: Record<Exclude<LogKind, "drift">, PillarKey> = {
  journal: "portfolio",
  gym: "physical",
  skill: "portfolio",
  outreach: "social_capital",
};

/** Pillar key -> the owner's chosen colour, or null for the default. Fetched once from
 *  /api/pillars and threaded down; `toneColor` does the resolving. */
type PillarColors = Partial<Record<PillarKey, string | null>>;

/** What a kind is CALLED where its entry carries no meta of its own. */
const KIND_LABEL: Record<LogKind, string> = {
  journal: "journal",
  gym: "session",
  skill: "session",
  outreach: "outreach",
  drift: "drifted",
};

/** "2026-08-12" -> a Date at noon, never midnight: a bare ISO date parses as UTC and
 *  lands on the day before anywhere west of Greenwich. */
const onDay = (iso: string) => new Date(`${iso}T12:00:00`);

/** The overlay's head: the whole date, year included — the log runs across years and an
 *  overlay must say which one it means without leaning on a month divider it cannot see. */
const fullDay = (iso: string) =>
  onDay(iso).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** A tile's "filename": weekday and day only. The month is the section it sits in, and
 *  repeating it under every tile would print August thirty times per screen. */
const tileDay = (iso: string) =>
  onDay(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric" });

/** "2026-08" -> "August 2026", the month divider's own words — the archive's helper,
 *  restated for the same reason its date maths is: the two screens share an idiom, not a
 *  module, and a shared file for two three-line formatters would be a third thing. */
const monthHeading = (ym: string) =>
  onDay(`${ym}-15`).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });

/**
 * The words of an entry, split into the heading that is already printed and the rest.
 *
 * The first line is dropped ONLY when it IS the title — checked, not assumed. Two entries
 * carry a title that is not their first line: a drift's title is the BLOCK's name and its
 * body is the reason, two different facts; and a rescued gym session's title is STORED
 * (Discord history), so its first line is a real set that slicing would eat. Blank leading
 * lines are skipped the way firstLine skips them, or a note opening on a blank line would
 * keep its own title as the first line of its body.
 */
function bodyOf(e: LogEntry) {
  const lines = (e.body ?? "").split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim());
  const derived = at >= 0 && lines[at]!.trim() === e.title;
  const rest = derived ? lines.slice(at + 1) : lines;
  return { rest, meaningful: rest.some((l) => l.trim()) };
}

/** The owner's own words, in the serif the journal and the session dialogs use.
 *  `whitespace-pre-wrap` because a workout is a column of sets and reflowing it into a
 *  paragraph destroys the only structure it has. */
function Body({ lines }: { lines: string[] }) {
  return (
    <p className="whitespace-pre-wrap font-serif text-small leading-relaxed text-[var(--color-muted)]">
      {lines.join("\n").trim()}
    </p>
  );
}

/** The press feedback every tile and page link wears — the JournalPanel idiom, on the
 *  app's own tokens. Transform only, and no entrance animation: a grid you scroll through
 *  daily is not an occasion. */
const PRESS = {
  transitionDuration: "var(--dur-press)",
  transitionTimingFunction: "var(--ease-out)",
} as const;

/**
 * What a kind's TAB wears: its colour behind white text, the hue only categorising while
 * the title carries the meaning — the division of labour the workout dialog's heading
 * declares. White text is safe because every pillar hue is curated past the chip test.
 * DRIFT is the one kind drawn unfilled — ink on a hairline over panel, because colouring
 * the entry that records a plan not happening is the one thing this palette must never
 * do. The panel ground is not decoration: a tile's tabs expand OVER neighbouring cards,
 * and a transparent tab over someone else's page is unreadable.
 */
function tabSkin(
  e: LogEntry,
  colors: PillarColors,
): {
  className: string;
  style?: CSSProperties;
} {
  if (e.kind === "drift")
    return {
      className:
        "border border-[var(--color-line-strong)] bg-[var(--color-panel)] text-[var(--color-ink)]",
    };
  const pillar = KIND_PILLAR[e.kind];
  return {
    className: "text-white",
    style: { background: toneColor(pillar, colors[pillar] ?? null) },
  };
}

/** An attachment's words, for its tab: the title, or the kind's own noun when the owner
 *  left none. Never invented beyond that. */
const tabWords = (e: LogEntry) => e.title ?? e.meta ?? KIND_LABEL[e.kind];

/**
 * ONE ATTACHMENT, as a TAB: its own title on its kind's colour.
 *
 * Truncation is honest here: a tab is a handle, not the document, and the whole title is
 * one tap away in the day's reader.
 */
function AttachmentTab({
  e,
  colors,
  className = "",
}: {
  e: LogEntry;
  colors: PillarColors;
  className?: string;
}) {
  const skin = tabSkin(e, colors);
  return (
    <span
      className={`min-w-0 truncate font-serif text-micro leading-tight ${skin.className} ${className}`}
      style={skin.style}
    >
      {tabWords(e)}
    </span>
  );
}

/** How many tabs a card-stock tile shows before saying "+n". Four fits the sheet with air
 *  at every width the grid draws; the reader always holds the whole day, and the tile's
 *  spoken label counts it, so nothing is silently gone. */
const TILE_LINES = 4;

/**
 * ONE DAY, as a tile — the file-explorer unit.
 *
 * A day with a page shows the PAGE as its face, exactly as the archive draws one: ruled
 * with its own words as texture when typed, the PNG when drawn — and always at the tile's
 * full width. The other things logged that day sit FOLDED into its right edge as closed
 * binder tabs; a pointer over the tile unfolds them, out over the neighbouring cards,
 * each showing its title on its colour.
 *
 * A day without a page is CARD STOCK, deliberately not a blank sheet: a sheet-shaped tile
 * on a day with no page would claim a page exists. It has the room the thumbnail spends,
 * so its tabs run the tile's own width.
 *
 * The whole tile is ONE button. At this density the parts are too small to be targets of
 * their own, and a mis-tap that opens the wrong thing costs more than the tap the reader
 * adds.
 */
function DayTile({
  day,
  colors,
  onOpen,
}: {
  day: LogDay;
  colors: PillarColors;
  onOpen: () => void;
}) {
  const pages = day.entries.filter((e) => e.kind === "journal");
  const others = day.entries.filter((e) => e.kind !== "journal");
  const face = pages[0];

  const spoken = [
    pages.length > 0 &&
      `${pages.length} page${pages.length === 1 ? "" : "s"}`,
    others.length > 0 &&
      `${others.length} ${others.length === 1 ? "entry" : "entries"}`,
  ]
    .filter(Boolean)
    .join(", ");

  const hidden = face ? 0 : Math.max(0, others.length - TILE_LINES);
  const shown = face ? [] : others.slice(0, TILE_LINES);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${fullDay(day.date)} — ${spoken}. Open the day`}
      className="group flex w-full min-w-0 flex-col text-left"
    >
      {face ? (
        // The page at the tile's FULL width, never shrunk to make room — the owner's
        // ruling. The tabs overlay its right edge instead of taking a column from it.
        <span
          className="relative block w-full transition-transform group-active:scale-[0.98]"
          style={PRESS}
        >
          <Sheet
            rules={face.meta !== "drawing"}
            className="w-full rounded border border-[var(--color-line)]"
          >
            {face.meta === "drawing" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/journal/${face.id}/image`}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="sheet-text">{face.body || "…"}</div>
            )}
          </Sheet>
          {/* The attached logs, FOLDED into the card's right edge — closed binder tabs,
              a coloured stub each. A pointer over the tile unfolds them: the rail opens
              as a small PANEL — solid ground, a hairline round it — that sits over
              whatever tiles are beside it, so the titles read against paper rather than
              clashing with a neighbour's page. The growth is not animated — width is
              layout and this app animates transform and opacity only — so the ground and
              titles fade in while the panel simply is its new size. Hidden from a screen
              reader because the button's label already counts them, and a stack of
              clipped fragments read aloud is noise. */}
          {others.length > 0 && (
            <span
              aria-hidden
              className="absolute top-1.5 z-10 flex w-max flex-col items-start gap-1 rounded-lg border border-transparent p-1 transition-colors group-hover:z-20 group-hover:border-[var(--color-line)] group-hover:bg-[var(--color-panel)]"
              style={{
                left: "calc(100% - 1.5rem)",
                transitionDuration: "var(--dur-press)",
                transitionTimingFunction: "var(--ease-out)",
              }}
            >
              {others.map((e, i) => {
                const skin = tabSkin(e, colors);
                return (
                  <span
                    key={i}
                    className={`block max-w-5 overflow-hidden whitespace-nowrap rounded-l-sm rounded-r px-1.5 py-0.5 font-serif text-micro leading-tight group-hover:max-w-[10rem] ${skin.className}`}
                    style={skin.style}
                  >
                    <span
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      style={{
                        transitionDuration: "var(--dur-press)",
                        transitionTimingFunction: "var(--ease-out)",
                      }}
                    >
                      {tabWords(e)}
                    </span>
                  </span>
                );
              })}
            </span>
          )}
        </span>
      ) : (
        <span
          className="sheet-a4 flex w-full min-w-0 flex-col gap-1 overflow-hidden rounded border border-[var(--color-line)] bg-[var(--color-bg)] p-1.5 transition-transform group-active:scale-[0.98]"
          style={PRESS}
        >
          {shown.map((e, i) => (
            <AttachmentTab
              key={i}
              e={e}
              colors={colors}
              className="rounded px-1.5 py-0.5"
            />
          ))}
          {hidden > 0 && (
            <span className="pl-1.5 text-micro leading-tight text-[var(--color-muted)]">
              +{hidden}
            </span>
          )}
        </span>
      )}

      {/* The filename line. The date is the tile's name — out of the day's context it is
          the only thing that tells two Tuesdays apart — and the hover treatment lives on
          it, the same underline the archive's captions answer a pointer with. */}
      <span className="mt-1 flex w-full items-baseline justify-between gap-1">
        <span className="text-micro tabular-nums text-[var(--color-muted)] underline-offset-4 group-hover:text-[var(--color-ink)] group-hover:underline">
          {tileDay(day.date)}
        </span>
        {pages.length > 1 && (
          <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
            ×{pages.length}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * ONE DAY, open — the journal-reader spread with the day's logs beside it.
 *
 * The main pane is the page at READING size, exactly as the journal's own reader draws
 * one: a typed page grows past A4 with the writing on it, a drawing is shown whole and
 * never cropped — a thumbnail may cover, a reader may not. The side pane is the day's
 * attachments, each under its named tab with its body unfolded: the workout dialog's
 * spread, where the pane beside the document is the context it is read against.
 *
 * On a page-less day the attachments ARE the day, so they take the whole dialog rather
 * than sitting beside an empty pane — the same ruling the old card made about a page with
 * nothing beside it, mirrored.
 *
 * READER ONLY. The one control that leaves is the link into the journal, where a page can
 * actually be rewritten.
 */
function DayReader({
  day,
  colors,
  onClose,
}: {
  day: LogDay;
  colors: PillarColors;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  const pages = day.entries.filter((e) => e.kind === "journal");
  const others = day.entries.filter((e) => e.kind !== "journal");
  const spread = pages.length > 0 && others.length > 0;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="max-h-[92dvh] w-[min(94vw,920px)] overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
    >
      <div className="section-head">
        <h2 className="min-w-0 truncate font-serif text-body">
          {fullDay(day.date)}
        </h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-ink)]"
        >
          ×
        </button>
      </div>

      {/* A 1px rule between the panes, not a gap — one document in two columns, the
          spread the workout dialog and the day itself are built on. */}
      <div className={`mt-4 ${spread ? "lg:grid lg:grid-cols-[1.35fr_1fr]" : ""}`}>
        {pages.length > 0 && (
          <div className={spread ? "lg:pr-5" : ""}>
            {pages.map((p) => {
              const drawing = p.meta === "drawing";
              return (
                <div key={p.id} className="mb-5 last:mb-0">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-micro text-[var(--color-muted)]">
                      {drawing ? "handwritten" : "typed"}
                    </span>
                    <Link
                      href="/journal"
                      className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                    >
                      open in journal →
                    </Link>
                  </div>
                  {drawing ? (
                    <Sheet
                      rules={false}
                      className="w-full max-w-[30rem] rounded-xl border border-[var(--color-line)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/journal/${p.id}/image`}
                        alt={`Handwritten page from ${day.date}`}
                        className="block h-full w-full object-contain"
                      />
                    </Sheet>
                  ) : (
                    <Sheet
                      a4={false}
                      className="w-full max-w-[30rem] rounded-xl border border-[var(--color-line)]"
                    >
                      <div className="sheet-text sheet-page">{p.body}</div>
                    </Sheet>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {others.length > 0 && (
          <div
            className={
              spread
                ? "mt-5 lg:mt-0 lg:border-l lg:border-[var(--color-line)] lg:pl-5"
                : ""
            }
          >
            <div className="section-head">
              <h3 className="text-small font-semibold">That day&apos;s logs</h3>
            </div>
            <ul className="divide-y divide-[var(--color-line)]">
              {others.map((e) => {
                const { rest, meaningful } = bodyOf(e);
                return (
                  <li key={`${e.kind}${e.id}`} className="py-3">
                    <div className="flex items-center gap-2">
                      <AttachmentTab
                        e={e}
                        colors={colors}
                        className="rounded px-2 py-0.5"
                      />
                      {/* `meta` alone, never joined with the kind label — for outreach
                          and drift the two are the same word, and "drifted · drifted"
                          is the app stammering. */}
                      <span className="shrink-0 text-micro text-[var(--color-muted)]">
                        {e.meta ?? KIND_LABEL[e.kind]}
                      </span>
                    </div>
                    {meaningful && (
                      <div className="mt-1.5">
                        <Body lines={rest} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </dialog>
  );
}

export default function DayLog({ date }: { date: string }) {
  const [days, setDays] = useState<LogDay[]>([]);
  const [next, setNext] = useState<string | null>(date);
  const [done, setDone] = useState(false);
  /** null until the FIRST page answers. An empty list and an unanswered one are different
   *  facts, and printing "nothing written yet" during the wait states the wrong one. */
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The first page could not be read at all. A different fact from "the log is empty",
   *  and the empty-state must not state the wrong one over a full log. */
  const [failed, setFailed] = useState(false);
  /** The date whose tile was tapped, or null. The DAY is looked up from `days` on render,
   *  so a page arriving under an open reader cannot strand it on stale entries. */
  const [openDate, setOpenDate] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  /**
   * THE IN-FLIGHT GUARD, and it is a REF rather than the `busy` state beside it.
   *
   * `busy` drives the "reading…" line, so it has to be state. It cannot also be the guard:
   * a state update is not visible until React commits, so two calls arriving in the same
   * tick both read `busy === false` and both fetch the SAME page. The initial load and the
   * IntersectionObserver do exactly that on mount, and StrictMode's double-invoke does it
   * again — which appended one page twice and produced React's "two children with the same
   * key" on every date in it. A ref is written synchronously, so the second caller sees it.
   */
  const inFlight = useRef(false);
  /**
   * WHICH LOG a fetch belongs to. Bumped when the anchor date changes, captured as a
   * fetch leaves, checked before its answer is applied. The in-flight ref cannot say
   * this — it only serialises CONCURRENT fetches, and a date change is precisely the
   * moment a still-flying one stops being concurrent and starts being wrong: its days
   * would merge into the new date's list, its cursor would move the new scroll, and its
   * `finally` would mark a log loaded that was never fetched.
   */
  const epoch = useRef(0);

  /**
   * Month -> chapter name, for the dividers — the archive's own move. The grid divides
   * itself by month, which is exactly the unit a chapter names. READ-ONLY: the chapter is
   * edited where it is lived in, on Today, not in the record of what is already written.
   */
  const [chapters, setChapters] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/chapter")
      .then((r) => r.json())
      .then((d) => !d.error && setChapters(d.chapters ?? {}))
      .catch(() => {});
  }, []);

  /**
   * The owner's pillar colours, for the tabs — fetched once, resolved through
   * `toneColor` at the use site. Until (or unless) it answers, the map is empty and
   * every tab wears its CSS default, which is the same fallback the rings draw with.
   */
  const [pillarColors, setPillarColors] = useState<PillarColors>({});
  useEffect(() => {
    fetch("/api/pillars")
      .then((r) => r.json())
      .then((d) => {
        if (d.error || !Array.isArray(d.pillars)) return;
        const m: PillarColors = {};
        for (const p of d.pillars as { key: PillarKey; color: string | null }[])
          m[p.key] = p.color;
        setPillarColors(m);
      })
      .catch(() => {});
  }, []);

  const more = useCallback(async () => {
    if (inFlight.current || done || next == null) return;
    inFlight.current = true;
    const mine = epoch.current;
    setBusy(true);
    try {
      // null is a FAILED read — a different fact from an empty page, and the two must
      // not share a shape or the empty state ends up describing the wrong one.
      const d = await fetch(`/api/log?before=${next}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (epoch.current !== mine) return;
      if (d == null) {
        // The scroll stops — retrying forever against a dead server is worse — and
        // `failed` keeps what the foot and the empty state say about it honest.
        setFailed(true);
        setDone(true);
        return;
      }
      /**
       * Appended by DATE, never blindly concatenated.
       *
       * Belt to the ref's braces: a day already on screen must never be added a second
       * time, whatever races upstream of here. `key={d.date}` is what the grid is drawn
       * with, and React's response to a duplicate key is to drop or duplicate rows
       * silently — a log that quietly omits a Tuesday is worse than one that fails loudly.
       */
      setDays((prev) => {
        const seen = new Set(prev.map((x) => x.date));
        const fresh = ((d.days ?? []) as LogDay[]).filter(
          (x) => !seen.has(x.date),
        );
        return fresh.length ? [...prev, ...fresh] : prev;
      });
      setNext(d.nextBefore ?? null);
      // Only an EMPTY page ends the scroll. A short page is not the end: days with nothing
      // written are skipped, so a page can come back thin with years still behind it.
      if (d.done || d.nextBefore == null) setDone(true);
    } finally {
      // A stale fetch settles into silence: the date effect already reset every one of
      // these for the log that replaced it.
      if (epoch.current === mine) {
        inFlight.current = false;
        setBusy(false);
        setLoaded(true);
      }
    }
  }, [done, next]);

  // First page on mount, and again if the anchor date changes under it.
  useEffect(() => {
    // A fresh anchor is a fresh log. The epoch is what strands any fetch still in
    // flight; the ref is cleared as well so the new log's first fetch is not blocked
    // waiting on a `finally` that will now decline to touch it.
    epoch.current++;
    inFlight.current = false;
    setDays([]);
    setNext(date);
    setDone(false);
    setLoaded(false);
    setFailed(false);
    setOpenDate(null);
  }, [date]);

  useEffect(() => {
    if (!loaded && !busy && next === date) void more();
  }, [loaded, busy, next, date, more]);

  /**
   * Infinite scroll by INTERSECTION, not by a scroll listener.
   *
   * A scroll handler fires on every frame of every scroll and has to be told which element
   * it is measuring; an observer fires once when the foot of the list actually comes into
   * view, and works unchanged whether this is scrolling inside the record's pane or the
   * page itself. `rootMargin` starts the fetch a screen early so the next page is usually
   * already there by the time the last one runs out.
   */
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && void more(),
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [more, done]);

  /** Months, newest first, each holding its days in the order they arrived — which is
   *  newest first too, because the API pages backwards. A month keeps growing as later
   *  pages stream more of it in; grouping on render is what makes that seamless. */
  const byMonth = useMemo(() => {
    const m = new Map<string, LogDay[]>();
    for (const d of days) {
      const ym = d.date.slice(0, 7);
      if (!m.has(ym)) m.set(ym, []);
      m.get(ym)!.push(d);
    }
    return [...m.entries()];
  }, [days]);

  const openDay =
    openDate == null ? null : (days.find((d) => d.date === openDate) ?? null);

  return (
    // Full width of the record, not a reading column: a grid is not prose, and a 52rem
    // cap left a third of the window as blank margin either side of every month.
    <div className="w-full">
      <div className="flex flex-col gap-4">
        {byMonth.map(([ym, mine]) => (
          <section key={ym} className="record-card">
            <div className="section-head">
              <h2 className="min-w-0 text-small font-semibold">
                {monthHeading(ym)}
                {/* ALONGSIDE the month, not instead of it — the owner's ruling, made for
                    the archive and inherited whole: a chapter names a stretch of life,
                    the month is where it sits in a record you scan by date. */}
                {chapters[ym] && (
                  <span className="ml-2 font-serif font-normal text-[var(--color-muted)]">
                    {chapters[ym]}
                  </span>
                )}
              </h2>
              <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                {mine.length} day{mine.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="mt-3 grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-5 lg:grid-cols-7">
              {mine.map((d) => (
                <li key={d.date} className="min-w-0">
                  <DayTile
                    day={d}
                    colors={pillarColors}
                    onOpen={() => setOpenDate(d.date)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {loaded && days.length === 0 && (
        <p className="py-8 text-small leading-relaxed text-[var(--color-muted)]">
          {failed
            ? // A failed read is not an empty log, and saying "nothing written yet" over
              // a full one would be the record lying about itself.
              "The log could not be read just now. It is still there — try again in a moment."
            : "Nothing written yet. Journal pages, workouts, skill sessions and outreach all land here on the day you wrote them."}
        </p>
      )}

      {/* The foot. It carries the observer, so it must stay mounted while there is more. */}
      <div ref={sentinel} className="py-6 text-center">
        {busy && (
          <span className="text-micro text-[var(--color-muted)]">reading…</span>
        )}
        {done && days.length > 0 && (
          <span className="text-micro text-[var(--color-muted)]">
            {failed
              ? "the rest could not be read just now"
              : "that is the whole log"}
          </span>
        )}
      </div>

      {openDay && (
        <DayReader
          day={openDay}
          colors={pillarColors}
          onClose={() => setOpenDate(null)}
        />
      )}
    </div>
  );
}
