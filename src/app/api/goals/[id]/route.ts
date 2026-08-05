import { getDb } from "@/lib/db/client";
import { updateGoal } from "@/lib/queries";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "bad id" }, { status: 400 });
    const b = await req.json();
    await updateGoal(db, id, {
      title: b.title,
      target: b.target,
      progress: b.progress != null ? Number(b.progress) : undefined,
      status: b.status,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
