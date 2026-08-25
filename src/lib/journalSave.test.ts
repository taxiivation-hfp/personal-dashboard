import { test } from "node:test";
import assert from "node:assert/strict";
import { SaveError, saveDrawing, type Sender } from "./journalSave.ts";

const png = (n: number) => ({
  seq: n,
  image: `data:image/png;base64,${n}`,
  width: 10,
  height: 14,
});

/** A sender that records every request and answers from a script keyed by url. */
function fake(script: Record<string, { ok: boolean; json?: Record<string, unknown> }>) {
  const calls: { method: string; url: string; body: Record<string, unknown> }[] = [];
  const send: Sender = async (req) => {
    calls.push(req);
    const r = script[req.url] ?? { ok: true, json: {} };
    return { ok: r.ok, status: r.ok ? 200 : 500, json: r.json ?? {} };
  };
  return { calls, send };
}

test("a new page POSTs sheet 0 and PUTs every later sheet to the id it got, in order", async () => {
  const { calls, send } = fake({ "/api/journal": { ok: true, json: { id: 7 } } });
  const out = await saveDrawing(
    { id: null, date: "2026-08-25" },
    [png(2), png(0), png(1)],
    send,
  );
  assert.equal(out.id, 7);
  assert.deepEqual(
    calls.map((c) => [c.method, c.url]),
    [
      ["POST", "/api/journal"],
      ["PUT", "/api/journal/7/sheet/1"],
      ["PUT", "/api/journal/7/sheet/2"],
    ],
  );
  assert.equal(calls[0].body.kind, "drawing");
  assert.equal(calls[0].body.date, "2026-08-25");
  assert.equal(calls[0].body.image, "data:image/png;base64,0");
  assert.equal(calls[2].body.image, "data:image/png;base64,2");
});

test("adding to a page PUTs every sheet, sheet 0 included, and never POSTs", async () => {
  const { calls, send } = fake({});
  const out = await saveDrawing({ id: 3, date: "2026-08-25" }, [png(0), png(1)], send);
  assert.equal(out.id, 3);
  assert.deepEqual(
    calls.map((c) => [c.method, c.url]),
    [
      ["PUT", "/api/journal/3/sheet/0"],
      ["PUT", "/api/journal/3/sheet/1"],
    ],
  );
});

test("a failure halfway carries the created id and the sheets that landed", async () => {
  const { send } = fake({
    "/api/journal": { ok: true, json: { id: 9 } },
    "/api/journal/9/sheet/2": { ok: false, json: { error: "image too large" } },
  });
  await assert.rejects(
    saveDrawing({ id: null, date: "2026-08-25" }, [png(0), png(1), png(2)], send),
    (e: unknown) => {
      assert.ok(e instanceof SaveError);
      assert.equal(e.message, "image too large");
      assert.equal(e.id, 9, "the caller must retry against this id, not POST again");
      assert.deepEqual(e.saved, [0, 1]);
      return true;
    },
  );
});

test("the transport rejecting mid-sequence still carries the created id and what landed", async () => {
  // A network drop is `fetch` throwing, not a response — so `send` rejects rather than
  // answering. The id from the POST must survive that, or the retry POSTs a second page.
  let n = 0;
  const send: Sender = async () => {
    n += 1;
    if (n === 1) return { ok: true, status: 200, json: { id: 9 } };
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(
    saveDrawing({ id: null, date: "2026-08-25" }, [png(0), png(1)], send),
    (e: unknown) => {
      assert.ok(e instanceof SaveError, "a raw rejection must not escape");
      assert.equal(e.message, "Failed to fetch");
      assert.equal(e.id, 9, "the caller must retry against this id, not POST again");
      assert.deepEqual(e.saved, [0]);
      return true;
    },
  );
});

test("the transport rejecting on the POST itself leaves no id", async () => {
  const send: Sender = async () => {
    throw new Error("offline");
  };
  await assert.rejects(
    saveDrawing({ id: null, date: "2026-08-25" }, [png(0)], send),
    (e: unknown) =>
      e instanceof SaveError && e.message === "offline" && e.id === null && e.saved.length === 0,
  );
});

test("a failed POST leaves no id, so a retry creates the page", async () => {
  const { send } = fake({ "/api/journal": { ok: false, json: { error: "nope" } } });
  await assert.rejects(
    saveDrawing({ id: null, date: "2026-08-25" }, [png(0)], send),
    (e: unknown) => e instanceof SaveError && e.id === null && e.saved.length === 0,
  );
});

test("a new page cannot begin past sheet 0, and an empty save is refused", async () => {
  const { calls, send } = fake({});
  await assert.rejects(
    saveDrawing({ id: null, date: "2026-08-25" }, [png(1)], send),
    (e: unknown) => e instanceof SaveError && e.id === null,
  );
  assert.equal(calls.length, 0, "refused before anything was sent");
  await assert.rejects(saveDrawing({ id: 1, date: "2026-08-25" }, [], send));
});

test("a POST that answers without an id is a failure, not a page", async () => {
  const { send } = fake({ "/api/journal": { ok: true, json: {} } });
  await assert.rejects(
    saveDrawing({ id: null, date: "2026-08-25" }, [png(0)], send),
    (e: unknown) => e instanceof SaveError && e.id === null,
  );
});
