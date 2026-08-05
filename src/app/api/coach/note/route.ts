import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/lib/db/client";
import { isISODate, todayISO, addDays } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A background observation, so it runs on the cheap model.
const MODEL = process.env.NOTE_MODEL || "claude-haiku-4-5";

const SYSTEM = `You write ONE short observation a day for a private adherence app.

The person marks their calendar blocks adhered / drifted / skipped. Drifted means they did something else in that time. You are looking for PATTERNS across days — repeated titles, repeated times of day, repeated reasons.

THE RULE THAT OUTRANKS EVERYTHING: never make drifting feel punishing. A person who feels judged logs inaccurately, and then this data is worthless.

- Never scold, never express disappointment, never imply a day was wasted.
- Do NOT praise high adherence either. Praise for good numbers is what makes bad numbers feel shameful.
- If a block keeps drifting, treat the BLOCK as the problem — wrong time, wrong size, wrong day — never the person's discipline.
- No streak language, no "don't break the chain", no urgency, no exclamation marks.

Write ONE sentence, maybe two. Plain and unhurried. If there is no real pattern yet, say so plainly in a few words — "Not enough logged yet to see a shape." Never invent a pattern to seem useful.`;

export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date") ?? todayISO();
    if (!isISODate(date)) return Response.json({ error: "bad date" }, { status: 400 });

    const db = await getDb();

    // Cached per day: this is a once-a-day observation, not something to regenerate on
    // every page load — which would also make it flicker and cost money each refresh.
    const cached = await db.execute({ sql: "SELECT value FROM app_meta WHERE key=?", args: [`note:${date}`] });
    if (cached.rows.length) return Response.json({ note: String(cached.rows[0].value), cached: true });

    if (!process.env.ANTHROPIC_API_KEY) return Response.json({ note: null });

    const from = addDays(date, -13);
    const marks = await db.execute({
      sql: `SELECT date,title,time_start,state,reason FROM block_marks
            WHERE date BETWEEN ? AND ? AND state != 'dismissed' ORDER BY date, time_start`,
      args: [from, date],
    });
    // Nothing to see a pattern in yet — don't spend a call to say so.
    if (marks.rows.length < 4) return Response.json({ note: null });

    const lines = marks.rows
      .map((m) => `${m.date} ${m.time_start ?? ""} "${m.title ?? ""}" ${m.state}${m.reason ? ` — ${m.reason}` : ""}`)
      .join("\n");

    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM,
      messages: [{ role: "user", content: `Marks from ${from} to ${date}:\n\n${lines}` }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const note = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!note) return Response.json({ note: null });

    await db.execute({
      sql: "INSERT INTO app_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      args: [`note:${date}`, note],
    });
    return Response.json({ note });
  } catch (e) {
    // A missing observation is not worth showing an error over.
    return Response.json({ note: null, error: e instanceof Error ? e.message : String(e) });
  }
}
