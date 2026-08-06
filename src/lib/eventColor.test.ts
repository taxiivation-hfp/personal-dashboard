import { test } from "node:test";
import assert from "node:assert/strict";
import { GOOGLE_PROJECTED, projectedColour } from "./eventColor.ts";

// --- contrast, recomputed here so the table cannot rot silently -------------------------
// The projection's whole justification is that every value is certified against every
// surface. If someone retunes a hex by eye, this is what catches it.

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * srgbToLinear(((n >> 16) & 255) / 255) +
    0.7152 * srgbToLinear(((n >> 8) & 255) / 255) +
    0.0722 * srgbToLinear((n & 255) / 255)
  );
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Every surface a projected stroke can land on. */
const SURFACES = [
  "#ede7db", // bar
  "#f2ede4", // bg
  "#f7f3ee", // surface-3
  "#f9f7f3", // surface-2
  "#fdfbf8", // surface-1
  "#fdefdc", // recorded
  "#fcfbf9", // ahead
];

test("all eleven Google colours are mapped", () => {
  for (let i = 1; i <= 11; i++) assert.ok(GOOGLE_PROJECTED[String(i)], `colorId ${i} is mapped`);
  assert.equal(Object.keys(GOOGLE_PROJECTED).length, 11);
});

test("every projected value is a six-digit lowercase hex", () => {
  for (const [id, hex] of Object.entries(GOOGLE_PROJECTED))
    assert.match(hex, /^#[0-9a-f]{6}$/, `colorId ${id}`);
});

test("every projected colour clears the stroke floor on every surface", () => {
  for (const [id, hex] of Object.entries(GOOGLE_PROJECTED))
    for (const s of SURFACES)
      assert.ok(contrast(hex, s) >= 3, `colorId ${id} on ${s} is ${contrast(hex, s).toFixed(2)}`);
});

test("every projected colour clears The Chip Test with white on top", () => {
  for (const [id, hex] of Object.entries(GOOGLE_PROJECTED))
    assert.ok(
      contrast("#ffffff", hex) >= 4.5,
      `colorId ${id} is ${contrast("#ffffff", hex).toFixed(2)} with white`
    );
});

// Tomato is the whole reason the projection exists — the palette forbids red outright.
test("Tomato is no longer red", () => {
  const tomato = GOOGLE_PROJECTED["11"];
  assert.notEqual(tomato, "#d60000");
  const n = parseInt(tomato.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // A dusty rose-brown: red still leads, but only just. Signal red is r >> g,b by a mile.
  assert.ok(r - Math.max(g, b) < 40, "red does not dominate");
});

test("the three reds stay distinguishable from each other", () => {
  // Hue rotation was rejected precisely because it collapsed these into one stroke.
  const [flamingo, tangerine, tomato] = ["4", "6", "11"].map((k) => GOOGLE_PROJECTED[k]);
  assert.notEqual(flamingo, tangerine);
  assert.notEqual(tangerine, tomato);
  assert.notEqual(flamingo, tomato);
});

test("a near-grey source projects to a true grey", () => {
  const graphite = GOOGLE_PROJECTED["8"];
  const n = parseInt(graphite.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  assert.equal(r, g);
  assert.equal(g, b);
});

test("absence is the default, never a twelfth state", () => {
  assert.equal(projectedColour(null), null, "the calendar default gets no stroke");
  assert.equal(projectedColour("99"), null, "an unknown id gets no stroke");
  assert.equal(projectedColour(""), null);
});

test("a known id resolves to its projection", () => {
  assert.equal(projectedColour("11"), GOOGLE_PROJECTED["11"]);
});
