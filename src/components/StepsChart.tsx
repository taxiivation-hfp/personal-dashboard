"use client";

import DayChart, { type ChartPoint } from "./DayChart";
import { STEPS_FLOOR } from "@/lib/rings";

/**
 * The step record, as a chart. ONE component, drawn in two places — the record's own card
 * and the dialog the Today row opens — so the two can never end up being two charts.
 *
 * It owns no data and no window. Every decision that makes a step chart a step chart
 * lives here and nowhere else:
 *
 *   BARS, from zero. Steps accumulate through a day and start again at midnight, which is
 *   the calorie shape exactly — a line would imply Tuesday's walking flowed into
 *   Wednesday's. Weight gets a line because a body persists between readings; a step count
 *   does not persist, it resets.
 *
 *   THE FLOOR LINE at 7,000, read from the registry so the chart, the checklist row and
 *   the Physical ring cannot disagree about where the line is. It is a floor and not a
 *   target: 15k steps is the same qualifying day as 7k, so there is no ceiling to draw and
 *   nothing above the line to be measured against.
 *
 *   A DAY THE PHONE NEVER PUSHED DRAWS NOTHING. Not a zero-height bar. The phone is the
 *   instrument; a day it did not report is a day nobody measured, which is a gap in the
 *   record and not a day spent motionless. This is the same rule weight and calories draw
 *   by and it matters more here, because the source is a device that can simply be left on
 *   a desk.
 *
 * Still a record, not a verdict: no average, no streak of floor days, no comparison
 * between windows. The bar is what happened.
 */
export default function StepsChart({
  points,
  height,
  emptyNote = "No steps pushed in this window.",
}: {
  points: ChartPoint[];
  height?: number;
  emptyNote?: string;
}) {
  return (
    <DayChart
      points={points}
      form="bars"
      unit="steps"
      marker={STEPS_FLOOR}
      // Health's own hue, the same one the Health ring wears by default. Steps are one
      // pillar's business and the colour says which.
      // DELIBERATELY THE TOKEN, not the owner's chosen hue: this is a chart of a BODY, not
      // a checklist tick, and --color-physical IS Health's default. Spec §5 moves only the
      // Steps and Calories tick BOXES onto the resolved tone. Do not "finish the job" here.
      colour="var(--color-physical)"
      height={height}
      emptyNote={emptyNote}
    />
  );
}
