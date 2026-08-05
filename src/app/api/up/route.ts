export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness probe for Fly.
 *
 * It MUST NOT touch getDb(). getDb() runs the production-database assertion and a
 * readFileSync of schema.sql — so a probe that reached it would turn a configuration
 * mistake into a failing health check and then a restart loop, hiding the real error
 * behind a crashing machine. This answers "is the process up", nothing more.
 */
export function GET() {
  return Response.json({ ok: true });
}
