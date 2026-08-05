import { getDb } from "@/lib/db/client";
import { setSkillState, touchSkill, TooManyActiveSkills } from "@/lib/engine";

export const runtime = "nodejs";

const STATES = new Set(["always_on", "active", "parked"]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "bad id" }, { status: 400 });
    const b = await req.json();
    const db = await getDb();

    if (b.state !== undefined) {
      if (!STATES.has(String(b.state))) return Response.json({ error: "bad state" }, { status: 400 });
      await setSkillState(db, id, b.state);
    }
    if (b.progress !== undefined || b.touched) {
      await touchSkill(db, id, b.progress !== undefined ? Number(b.progress) : null);
    }
    return Response.json({ ok: true });
  } catch (e) {
    // 409, not 500: the pick-two rule is a deliberate refusal, not a malfunction, and
    // the caller (UI or coach) needs to be able to tell those apart.
    if (e instanceof TooManyActiveSkills) {
      return Response.json({ error: e.message, active: e.active }, { status: 409 });
    }
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
