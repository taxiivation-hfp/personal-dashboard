import { getDb } from "@/lib/db/client";
import {
  runCoachStream,
  getCoachHistory,
  type CoachEvent,
} from "@/lib/coach/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    const db = await getDb();
    return Response.json({ messages: await getCoachHistory(db) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * Streams the turn as newline-delimited JSON (one CoachEvent per line).
 *
 * NDJSON rather than SSE because EventSource can't POST, so the client reads the
 * body with a stream reader either way — and this keeps the wire format trivial.
 */
export async function POST(req: Request) {
  let message: string;
  try {
    const b = await req.json();
    message = String(b.message ?? "").trim();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!message)
    return Response.json({ error: "message required" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: CoachEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const db = await getDb();
        await runCoachStream(db, message, send);
      } catch (e) {
        // The turn already began streaming, so a mid-turn failure can't become an
        // HTTP status — it has to arrive as an event the client can render.
        send({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no", // don't let a proxy sit on the chunks
    },
  });
}
