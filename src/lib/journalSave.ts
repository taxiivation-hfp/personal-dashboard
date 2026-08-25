// SAVING A HANDWRITTEN SCROLL — the request sequence, in one place.
//
// A page is several sheets and each sheet is its own request (see sheets.ts for why), so
// "save" is a sequence rather than a write, and a sequence can stop halfway. This module
// owns the order and what a halfway stop leaves behind; the two surfaces that save a
// drawing (the day's panel, writing a new page, and the reader, adding to one) call it
// rather than each keeping a copy of the loop.
//
// `send` is injected so the sequence is testable without a network. Import-free otherwise.

export type SheetImage = {
  seq: number;
  /** A PNG data URL — the sheet as the canvas flattened it. */
  image: string;
  width: number;
  height: number;
};

export type SaveResponse = { ok: boolean; status: number; json: Record<string, unknown> };
export type Sender = (req: {
  method: "POST" | "PUT";
  url: string;
  body: Record<string, unknown>;
}) => Promise<SaveResponse>;

/**
 * Thrown when the sequence stops. Carries what DID land so the caller can retry the rest
 * without creating a second page: `id` is the page the first request created (or the one
 * being added to), and `saved` are the sheets on the record when it stopped.
 */
export class SaveError extends Error {
  id: number | null;
  saved: number[];
  constructor(message: string, id: number | null, saved: number[]) {
    super(message);
    this.name = "SaveError";
    this.id = id;
    this.saved = saved;
  }
}

/**
 * Write `sheets` (in seq order) for the page `id`, or for a NEW page on `date` when `id`
 * is null. Resolves with the page's id.
 *
 * A new page is created by POSTing sheet 0 — the same request a one-sheet page always
 * made, which is what keeps every existing page a valid one-sheet scroll — and every
 * later sheet is PUT to its own seq. A page being added to PUTs each sheet, sheet 0
 * included: the row already exists and a POST would be a second page for the day.
 *
 * SEQUENTIAL, never parallel. The engine refuses a sheet with a gap before it, so sheet 2
 * must have landed before sheet 3 is sent; and a failure must leave a contiguous prefix on
 * the record, which parallel requests could not promise.
 */
export async function saveDrawing(
  target: { id: number | null; date: string },
  sheets: SheetImage[],
  send: Sender,
): Promise<{ id: number }> {
  const ordered = [...sheets].sort((a, b) => a.seq - b.seq);
  if (!ordered.length) throw new SaveError("nothing to save", target.id, []);

  let id = target.id;
  const saved: number[] = [];

  /**
   * EVERY REJECTION LEAVES AS A SaveError, never as whatever `send` threw. The transport is
   * allowed to reject outright (a network drop is `fetch` throwing a TypeError, with nothing
   * said by the server), and a raw rejection escaping this loop would take `id` and `saved`
   * with it — after a POST had already created the page. The caller would then see an error
   * it cannot read an id from, keep no draft, and its retry would POST a SECOND page for the
   * day with the same sheet 0, leaving the first as a one-sheet stub. That duplicate is the
   * exact thing `draftId` exists to prevent, so the id must survive the failure that most
   * often causes it: the connection going away halfway through.
   */
  const attempt = async (req: Parameters<Sender>[0]): Promise<SaveResponse> => {
    try {
      return await send(req);
    } catch (e) {
      throw new SaveError(
        e instanceof Error && e.message ? e.message : "could not save",
        id,
        saved,
      );
    }
  };

  for (const s of ordered) {
    const body = { image: s.image, width: s.width, height: s.height };
    let res: SaveResponse;
    if (id == null) {
      // The record can only begin with sheet 0. Anything else is a bug upstream, and the
      // engine would refuse it anyway; refuse it here so the message says what happened.
      if (s.seq !== 0)
        throw new SaveError("a new page must begin with sheet 0", null, saved);
      res = await attempt({
        method: "POST",
        url: "/api/journal",
        body: { date: target.date, kind: "drawing", ...body },
      });
      if (res.ok) {
        const got = Number(res.json.id);
        if (!Number.isInteger(got) || got <= 0)
          throw new SaveError("the page was created without an id", null, saved);
        id = got;
      }
    } else {
      res = await attempt({
        method: "PUT",
        url: `/api/journal/${id}/sheet/${s.seq}`,
        body,
      });
    }
    if (!res.ok) {
      const msg =
        typeof res.json.error === "string" ? res.json.error : "could not save";
      throw new SaveError(msg, id, saved);
    }
    saved.push(s.seq);
  }

  return { id: id as number };
}
