import { getDb } from "@/lib/db/client";
import { disconnect } from "@/lib/google";

export const runtime = "nodejs";

export async function POST() {
  await disconnect(await getDb());
  return Response.json({ ok: true });
}
