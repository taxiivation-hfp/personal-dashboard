// THE ONE `Sender` OVER FETCH, for saveDrawing (see journalSave.ts).
//
// journalSave.ts is import-free and takes its transport as an argument so its sequence can
// be tested without a network. This is the transport the app actually uses, kept in its own
// small file rather than inlined in each parent (the day's panel and the reader both save a
// drawing) — two copies of a fetch wrapper are two places for a header to go missing.
//
// Client-safe: fetch only, nothing from the server side of the app.

import type { Sender } from "./journalSave";

/**
 * Sends the request as JSON and resolves with `{ok, status, json}` whatever comes back.
 *
 * `json` is `{}` when the body is not JSON — a proxy's HTML error page, an empty 413 — so
 * saveDrawing can read `res.json.error` without a second try/catch and fall back to its own
 * wording. Network failure (fetch itself rejecting) is NOT swallowed: it is the one case
 * where nothing was said by the server, and saveDrawing's SaveError carries the message
 * through to the screen as it is.
 */
export const fetchSender: Sender = async ({ method, url, body }) => {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      json = parsed as Record<string, unknown>;
  } catch {
    // Not JSON — `{}` says so, and the caller's fallback wording takes over.
  }
  return { ok: res.ok, status: res.status, json };
};
