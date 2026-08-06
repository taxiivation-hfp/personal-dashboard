// The coach: a manual Anthropic tool-use loop over the 10 engine tools.
// Persists a clean text transcript (the in-turn tool exchange stays in memory);
// each turn the model re-grounds by calling get_today, so history stays lean.

import Anthropic from "@anthropic-ai/sdk";
import type { Client } from "../db/client";
import { todayISO, prettyDate, APP_TZ } from "../dates";
import { getDayView } from "../queries";
import { getCalendarForDate } from "../google";
import { executeTool, TOOL_DEFS } from "./tools";

// One-line swap via COACH_MODEL in .env.local. Coach runs on Sonnet 4.6 — Haiku 4.5 was
// tested first but missed/hallucinated tool calls, so it's reserved for cheap background jobs.
const MODEL = process.env.COACH_MODEL || "claude-sonnet-4-6";
const EFFORT = (process.env.COACH_EFFORT || "medium") as
  "low" | "medium" | "high" | "xhigh" | "max";
const MAX_TOOL_ITERS = 8;

// History is re-sent on EVERY call in the tool loop, so an unbounded transcript makes
// each turn quietly more expensive forever. Keep a sliding window; the model re-grounds
// via get_today anyway, so old chatter earns nothing. Stored as text-only blocks, so
// trimming can never orphan a tool_use/tool_result pair.
const HISTORY_LIMIT = Number(process.env.COACH_HISTORY_LIMIT || 30);

// Adaptive thinking + output_config.effort are only valid on 4.6+/Fable-class models.
// Haiku 4.5 (and other 4.5/older models) reject the effort param, so send a plain request there.
// NOTE: this list must include every model that supports adaptive thinking + effort.
// It previously omitted opus-5 and sonnet-5, so setting COACH_MODEL to either silently
// dropped BOTH thinking and effort with no error — a quiet downgrade, not a crash.
const ADAPTIVE_THINKING =
  /opus-5|sonnet-5|opus-4-[678]|sonnet-4-6|fable-5|mythos-5/.test(MODEL);

function systemPrompt(date: string): string {
  return `You are the coach inside a private single-user app built around ADHERENCE. Today is ${prettyDate(date)} (${date}, ${APP_TZ}).

The question this app answers is "did I do what I said I'd do?" — NEVER "how much did I get done?". Output and results are deliberately not tracked or scored anywhere. The problem being solved is drift and self-justification, not productivity. Working a block badly and working it brilliantly are the same event here: the block was adhered to.

Calendar blocks are marked adhered / drifted / skipped. Drifting means the person did something else in that time. Your job is PATTERN-SPOTTING on drift — reading recent_blocks, including the reasons given, and noticing shapes the person can't see from inside one day. For example: "Mandarin has drifted 3 of the last 5 nights, always after 9pm — worth moving it earlier?"

THE RULE THAT OUTRANKS EVERYTHING: never make drifting feel punishing.

A person who feels judged starts logging inaccurately, and inaccurate logs make every number in this app worthless. So:
- Never scold, never express disappointment, never imply a day was wasted.
- Do not congratulate high adherence either — praise for good numbers is what makes bad numbers feel shameful, and that is the same trap from the other side.
- Treat a drift exactly as you would treat an adherence: as information about how the week is actually shaped.
- Never suggest the person should have more discipline. If a block keeps drifting, the block is probably wrong — wrong time, wrong size, wrong day. Say that instead.
- No streak-protection language, no "don't break the chain", no urgency.

The current day is injected at the top of the user's turn inside <board>; read it there rather than calling get_day to start.

Tone: plain, warm, unhurried, and brief. One observation is worth more than five. If nothing stands out, say so and stop — you do not have to find something.`;
}

type Result = { text: string; offline?: boolean };

/** One NDJSON line on the wire. */
export type CoachEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "done"; text: string; offline?: boolean }
  | { type: "error"; message: string };

// Friendly names for tool activity live in ./labels (client-safe, imported by the UI).

async function loadHistory(db: Client): Promise<Anthropic.MessageParam[]> {
  const r = await db.execute({
    sql: "SELECT role, content FROM (SELECT id, role, content FROM coach_messages ORDER BY id DESC LIMIT ?) ORDER BY id",
    args: [HISTORY_LIMIT],
  });
  const msgs = r.rows.map((row) => ({
    role: String(row.role) as "user" | "assistant",
    content: JSON.parse(String(row.content)),
  }));
  // The window may start mid-turn; a leading assistant message is rejected by the API.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

async function saveTurn(
  db: Client,
  userText: string,
  assistantText: string,
): Promise<void> {
  await db.batch(
    [
      {
        sql: "INSERT INTO coach_messages (role, content) VALUES ('user', ?)",
        args: [JSON.stringify([{ type: "text", text: userText }])],
      },
      {
        sql: "INSERT INTO coach_messages (role, content) VALUES ('assistant', ?)",
        args: [JSON.stringify([{ type: "text", text: assistantText }])],
      },
    ],
    "write",
  );
}

/**
 * Run one coach turn, emitting events as they happen.
 *
 * Streaming through a MANUAL tool-use loop needs care: a turn can be several API
 * calls, and the user-visible answer usually only exists in the last one. So text
 * is streamed from every iteration and accumulated, which means what you watch
 * appear is byte-for-byte what gets persisted — the old code kept only the final
 * iteration's text, silently discarding any preamble the model wrote before it
 * reached for a tool.
 */
export async function runCoachStream(
  db: Client,
  userText: string,
  emit: (e: CoachEvent) => void,
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    emit({
      type: "done",
      offline: true,
      text: "I'm offline — add an ANTHROPIC_API_KEY to .env.local and restart to switch me on. Your goals, tasks, and rings all work without me in the meantime.",
    });
    return;
  }

  const client = new Anthropic();
  const date = todayISO();
  const system = systemPrompt(date);

  // Prefetch the board (a local sqlite read, ~1ms) and hand it to the model with the
  // turn. Previously the system prompt ordered "start by calling get_today", so every
  // single turn burned a full API round trip before it could emit one visible token.
  // Only the raw userText is persisted, so this snapshot never accumulates in history.
  const history = await loadHistory(db);
  const cal = await getCalendarForDate(date);
  const board = await getDayView(db, date, cal.events, cal.connected);
  const messages: Anthropic.MessageParam[] = [
    ...history,
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `<board date="${date}">${JSON.stringify(board)}</board>`,
        },
        { type: "text", text: userText },
      ],
    },
  ];

  let finalText = "";
  for (let i = 0; i < MAX_TOOL_ITERS; i++) {
    // Text can arrive in more than one iteration (a preamble, then the answer after
    // the tools resolve). Separate them so the accumulated transcript reads as prose.
    let firstDeltaOfIteration = true;
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      // Render order is tools -> system -> messages, so a single breakpoint on the
      // system block caches the entire fixed prefix (system + the 12 tool schemas,
      // ~3k tokens). Without this it is re-billed at full price on every iteration
      // of the loop below, which is the single largest line on the coach's bill.
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      tools: TOOL_DEFS as unknown as Anthropic.ToolUnion[],
      messages,
      // Second breakpoint, auto-placed on the last content block: each iteration reads
      // back the tool exchange the previous one wrote instead of paying for it again.
      cache_control: { type: "ephemeral" },
      ...(ADAPTIVE_THINKING
        ? { thinking: { type: "adaptive" }, output_config: { effort: EFFORT } }
        : {}),
    } as Anthropic.MessageStreamParams);

    stream.on("text", (delta) => {
      if (firstDeltaOfIteration) {
        firstDeltaOfIteration = false;
        if (finalText) {
          finalText += "\n\n";
          emit({ type: "text", delta: "\n\n" });
        }
      }
      finalText += delta;
      emit({ type: "text", delta });
    });

    const resp = await stream.finalMessage();
    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    // Announce before executing: the tool call is the slow part, so this is what
    // fills the gap between the preamble and the answer.
    for (const block of resp.content) {
      if (block.type === "tool_use") emit({ type: "tool", name: block.name });
    }
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      try {
        const out = await executeTool(
          db,
          block.name,
          (block.input ?? {}) as Record<string, unknown>,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(out),
        });
      } catch (e) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: ${e instanceof Error ? e.message : String(e)}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  finalText = finalText.trim();
  if (!finalText) finalText = "(no reply)";
  await saveTurn(db, userText, finalText);
  emit({ type: "done", text: finalText });
}

/** Non-streaming convenience wrapper — same code path, events discarded. */
export async function runCoach(db: Client, userText: string): Promise<Result> {
  let text = "";
  let offline = false;
  await runCoachStream(db, userText, (e) => {
    if (e.type === "done") {
      text = e.text;
      offline = Boolean(e.offline);
    }
  });
  return offline ? { text, offline } : { text };
}

export async function getCoachHistory(
  db: Client,
): Promise<{ role: string; text: string }[]> {
  const r = await db.execute(
    "SELECT role, content FROM coach_messages ORDER BY id",
  );
  return r.rows.map((row) => {
    const blocks = JSON.parse(String(row.content)) as {
      type: string;
      text?: string;
    }[];
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
    return { role: String(row.role), text };
  });
}
