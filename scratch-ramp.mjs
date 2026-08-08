// scratch — colour maths only. Not part of the app.

const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const rgbToHex = (rgb) =>
  "#" + rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0")).join("");

const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(srgbToLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// sRGB <-> Oklab (Björn Ottosson)
function srgbToOklab(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToRgbLin(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const oklabToHex = (L, a, b) => {
  const lin = oklabToRgbLin(L, a, b);
  const out = lin.map(linToSrgb);
  const clipped = out.some((c) => c < -0.0005 || c > 1.0005);
  return { hex: rgbToHex(out), clipped };
};

const toLCH = (hex) => {
  const [L, a, b] = srgbToOklab(hex);
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
};
const fromLCH = (L, C, h) => oklabToHex(L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180));

const PALETTE = [
  ["Moss", "#467c6c"],
  ["Olive", "#6d7a45"],
  ["Clay", "#8c7434"],
  ["Rust", "#9a6448"],
  ["Plum", "#7d5a72"],
  ["Iris", "#67609b"],
  ["Slate", "#5b6b7c"],
  ["Teal", "#3f7d80"],
];

const SURFACES = [
  ["page  bg", "#f2ede4"],
  ["panel   ", "#fbf9f5"],
  ["surf-1  ", "#fffdf9"],
  ["surf-2  ", "#f2f1f5"],
  ["surf-3  ", "#f5e9dd"],
  ["bar     ", "#eee7da"],
];

console.log("=== SURFACES, by luminance (worst case for a dark stroke = lowest L) ===");
for (const [n, h] of [...SURFACES].sort((a, b) => lum(a[1]) - lum(b[1])))
  console.log(n, h, "Y=" + lum(h).toFixed(4), "L=" + toLCH(h).L.toFixed(4), "h=" + toLCH(h).h.toFixed(1));

console.log("\n=== ACCENT / INK ===");
for (const [n, h] of [["accent", "#9a6a2e"], ["ink", "#23201b"], ["muted", "#6e675d"], ["line-strong", "#cfc5b2"], ["line-edge", "#bfb49f"]]) {
  const { L, C, h: hh } = toLCH(h);
  console.log(n.padEnd(12), h, `L=${L.toFixed(4)} C=${C.toFixed(4)} h=${hh.toFixed(1)}`);
}

console.log("\n=== PALETTE in OKLCH, + contrast on each surface ===");
for (const [name, hex] of PALETTE) {
  const { L, C, h } = toLCH(hex);
  const cs = SURFACES.map(([n, s]) => `${n.trim()}:${contrast(hex, s).toFixed(2)}`).join(" ");
  console.log(name.padEnd(7), hex, `L=${L.toFixed(4)} C=${C.toFixed(4)} h=${h.toFixed(1)}`, "|", cs, "| white:", contrast(hex, "#ffffff").toFixed(2));
}
