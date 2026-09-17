# Graphite's productivity test

Parked verbatim from `src/lib/productivity.test.ts` at commit `c86f000` by the owner's ruling of 2026-09-18 (see README.md).
Each block below is an exact slice of that file; the heading gives its original line range.

## `src/lib/productivity.test.ts:89-94` — social hours score nothing here

```ts
// GRAPHITE IS NOT A TIER. Seeing people is a pillar, counted by the Social ring; paying it
// productivity points as well would make an evening out a thing you can be productive AT.
test("social hours score nothing here", () => {
  assert.equal(rateFor("8"), UNLISTED_RATE);
  assert.equal(day({ blocks: [{ minutes: 180, colorId: "8", state: "adhered" }] }).points, 0);
});
```
