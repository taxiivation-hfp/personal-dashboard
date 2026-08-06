// Projecting a Google Calendar colour into this app's register. PURE — zero imports.
//
// See The Foreign Hue Rule in DESIGN.md. A colour arriving from outside the app is never
// used as it arrives: Google's palette runs chroma 0.105–0.226, up to 2.3x this app's own
// accent, and colorId 11 is literal signal red — which the palette forbids outright.
//
// THE PROJECTION, applied once at build time to produce the table below:
//
//     (L, C, H) = oklch(googleHex)
//     Cout      = C < 0.02 ? 0 : 0.045      // a near-grey must stay a true grey
//     result    = oklch(0.56, Cout, H)      // hue survives; lightness and chroma do not
//
// L = 0.56 is not arbitrary. At 0.58 the worst case is 4.18:1 with white on top and fails
// The Chip Test; at 0.56 the minimum is 4.54:1 and passes, so every value is certified as
// both a stroke and a fill even though only the stroke ships. Chroma 0.045 is 46% of the
// accent, so a projected colour can never out-shout the one accent.
//
// Verified across all seven app surfaces: minimum 3.69:1 as a stroke (floor 3.0), minimum
// 4.54:1 with white on top (floor 4.5).
//
// HUE ROTATION WAS TRIED AND REJECTED. Rotating Flamingo (26°), Tomato (29°) and Tangerine
// (36°) out of the red band collapsed all three into one identical stroke, destroying the
// very categorisation the feature exists to provide. Clamping chroma alone solves the "no
// red" problem on its own: Tomato #d60000 projects to #8d6b65, a dusty rose-brown one hue
// degree from the app's own sanctioned "Rust", and unmistakably not an alarm colour.
//
// A precomputed literal rather than a runtime conversion: eleven known inputs do not need
// a colour-space library shipped to the client.

/** Google's eleven event colours, projected. Keys are Google's colorId. */
export const GOOGLE_PROJECTED: Record<string, string> = {
  "1": "#6c738f", // Lavender  #7986cb
  "2": "#5e7d6b", // Sage      #33b679
  "3": "#806c86", // Grape     #8e24aa
  "4": "#8d6b67", // Flamingo  #e67c73
  "5": "#807356", // Banana    #f6c026
  "6": "#8d6c62", // Tangerine #f5511d
  "7": "#5d788d", // Peacock   #039be5
  "8": "#747474", // Graphite  #616161 — near-grey in, true grey out
  "9": "#6b7390", // Blueberry #3f51b5
  "10": "#617c68", // Basil    #0b8043
  "11": "#8d6b65", // Tomato   #d60000 — signal red in, dusty rose-brown out
};

/**
 * The stroke colour for an event, or null when it has none.
 *
 * null for the calendar default (Google omits colorId for those) and for anything
 * unrecognised. Absence is the default, never a twelfth state — an event with no colour
 * simply gets no rule, which is also what happens if Google ever adds a colour this table
 * has not been taught.
 */
export const projectedColour = (colorId: string | null): string | null =>
  colorId == null ? null : (GOOGLE_PROJECTED[colorId] ?? null);
