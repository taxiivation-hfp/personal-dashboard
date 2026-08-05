// The coach's tool surface.
//
// Its job is pattern-spotting on DRIFT, not task management. Everything that created
// or completed work items is gone — there is no to-do list, and the coach does not
// score output. What it can do is read what actually happened and notice shapes in it.

import type { Client } from "../db/client";
import { todayISO, isISODate, addDays } from "../dates";
import { setHabit, setSkillState, TooManyActiveSkills } from "../engine";
import {
  createGoal,
  getDayView,
  listGoals,
  listSkills,
  habitsForDate,
  pillarMaps,
  updateGoal,
  type PillarKey,
} from "../queries";
import { getCalendarForDate, insertEvent } from "../google";

const PILLARS = ["social_capital", "physical", "portfolio"] as const;

export type ToolDef = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
};

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "get_day",
    description:
      "Read one day: its calendar blocks with their marks (adhered / drifted / skipped / unmarked), the adherence rate, and the non-negotiables. Call this first to ground yourself in what actually happened.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { date: { type: "string", format: "date", description: "YYYY-MM-DD; defaults to today" } },
      required: [],
    },
  },
  {
    name: "recent_blocks",
    description:
      "The last N days of marked blocks WITH their drift reasons. This is your main tool — it is what lets you notice things like 'Mandarin has drifted 3 of the last 5 nights'. Look for repetition in titles, in times of day, and in the reasons given.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { days: { type: "integer", description: "how many days back, 1-30. Defaults to 14." } },
      required: [],
    },
  },
  {
    name: "get_calendar",
    description: "The real Google Calendar events for a day. Blocks come from here — the app never invents them.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { date: { type: "string", format: "date" } },
      required: [],
    },
  },
  {
    name: "add_to_calendar",
    description:
      "Put a time block on the real calendar. Use when the user asks to move or schedule something — e.g. after noticing a block keeps drifting late, offering to move it earlier.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        date: { type: "string", format: "date" },
        time_start: { type: "string", description: "HH:MM" },
        time_end: { type: "string", description: "HH:MM" },
      },
      required: ["summary", "date", "time_start"],
    },
  },
  {
    name: "log_habit",
    description: "Tick or untick one of the daily non-negotiables. Binary — no states, no reasons.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        habit_id: { type: "integer", description: "real id from get_day — never guess" },
        date: { type: "string", format: "date" },
        done: { type: "boolean" },
      },
      required: ["habit_id"],
    },
  },
  {
    name: "list_goals",
    description: "The user's goals. Categorised by pillar; progress is set by hand, not derived from activity.",
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
  {
    name: "create_goal",
    description: "Create a goal under a pillar. Keep goals few and real.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pillar: { type: "string", enum: PILLARS },
        title: { type: "string" },
        target: { type: "string", description: "a human description of done" },
      },
      required: ["pillar", "title"],
    },
  },
  {
    name: "update_goal",
    description: "Update a goal's title, target, progress (0-1) or status.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "integer" },
        title: { type: "string" },
        target: { type: "string" },
        progress: { type: "number" },
        status: { type: "string", enum: ["active", "done", "paused", "dropped"] },
      },
      required: ["id"],
    },
  },
  {
    name: "list_skills",
    description:
      "The skill-rotation board: what is actively being levelled (max 2), what is parked, and how many days since each active one was touched.",
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
  {
    name: "set_skill_state",
    description:
      "Promote a parked skill to active or park an active one. HARD LIMIT of 2 active — a third is refused, and the right move is to park a stalled one first.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { id: { type: "integer" }, state: { type: "string", enum: ["active", "parked", "always_on"] } },
      required: ["id", "state"],
    },
  },
];

function asDate(v: unknown, fallback?: string): string {
  if (v === undefined || v === null) {
    if (fallback) return fallback;
    throw new Error("date required");
  }
  if (!isISODate(v)) throw new Error(`bad date '${v}' — expected YYYY-MM-DD`);
  return v;
}

export async function executeTool(db: Client, name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_day": {
      const date = asDate(input.date, todayISO());
      const cal = await getCalendarForDate(date);
      return getDayView(db, date, cal.events, cal.connected);
    }

    case "recent_blocks": {
      const days = Math.min(Math.max(Number(input.days ?? 14), 1), 30);
      const to = todayISO();
      const from = addDays(to, -(days - 1));
      const r = await db.execute({
        sql: `SELECT date,title,time_start,time_end,state,reason FROM block_marks
              WHERE date BETWEEN ? AND ? AND state != 'dismissed'
              ORDER BY date DESC, time_start`,
        args: [from, to],
      });
      return {
        from,
        to,
        marks: r.rows.map((m) => ({
          date: String(m.date),
          title: m.title == null ? null : String(m.title),
          time: m.time_start == null ? null : String(m.time_start),
          state: String(m.state),
          reason: m.reason == null ? null : String(m.reason),
        })),
      };
    }

    case "get_calendar":
      return getCalendarForDate(asDate(input.date, todayISO()));

    case "add_to_calendar": {
      const id = await insertEvent(db, {
        summary: String(input.summary),
        date: asDate(input.date, todayISO()),
        timeStart: String(input.time_start),
        timeEnd: (input.time_end as string) ?? null,
      });
      return { ok: true, event_id: id };
    }

    case "log_habit": {
      const date = asDate(input.date, todayISO());
      await setHabit(db, Number(input.habit_id), date, input.done !== false);
      return { ok: true, habits: await habitsForDate(db, date) };
    }

    case "list_goals":
      return { goals: await listGoals(db) };

    case "create_goal": {
      const { byKey } = await pillarMaps(db);
      const pid = byKey.get(String(input.pillar));
      if (pid == null) throw new Error(`unknown pillar '${input.pillar}'`);
      const id = await createGoal(db, {
        pillar_id: pid,
        title: String(input.title),
        target: (input.target as string) ?? null,
      });
      return { ok: true, id };
    }

    case "update_goal": {
      await updateGoal(db, Number(input.id), {
        title: input.title as string | undefined,
        target: input.target as string | undefined,
        progress: input.progress != null ? Number(input.progress) : undefined,
        status: input.status as string | undefined,
      });
      return { ok: true };
    }

    case "list_skills":
      return { skills: await listSkills(db) };

    case "set_skill_state": {
      try {
        await setSkillState(db, Number(input.id), input.state as "active" | "parked" | "always_on");
        return { ok: true };
      } catch (e) {
        if (e instanceof TooManyActiveSkills) return { ok: false, refused: e.message, active: e.active };
        throw e;
      }
    }

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
