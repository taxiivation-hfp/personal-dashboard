import { getDb } from "@/lib/db/client";
import { getAuthUrl, googleConfigured } from "@/lib/google";

export const runtime = "nodejs";

export async function GET() {
  if (!googleConfigured()) {
    return Response.json(
      {
        error:
          "Google not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local",
      },
      { status: 400 },
    );
  }
  const db = await getDb();
  const state = crypto.randomUUID();
  await db.execute({
    sql: "INSERT INTO app_meta (key,value) VALUES ('google_oauth_state',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    args: [state],
  });
  return Response.redirect(getAuthUrl(state), 302);
}
