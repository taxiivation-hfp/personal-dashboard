import { getDb } from "@/lib/db/client";
import { googleConfigured, isConnected } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = googleConfigured();
  let connected = false;
  if (configured) connected = await isConnected(await getDb());
  return Response.json({ configured, connected });
}
