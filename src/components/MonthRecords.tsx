"use client";

import Dashboard from "./Dashboard";

/** The record view for one month: the log, anchored at the month's last day (or today, for
 *  the current month) and bounded below at its first. */
export default function MonthRecords({
  month,
  today,
  onBack,
}: {
  /** YYYY-MM */
  month: string;
  /** YYYY-MM-DD */
  today: string;
  onBack: () => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const last = `${month}-${String(new Date(y!, m!, 0).getDate()).padStart(2, "0")}`;
  const anchor = last < today ? last : today;
  const name = new Date(y!, m! - 1, 1).toLocaleDateString("en-AU", { month: "long" });
  return (
    <div className="absolute inset-0">
      <Dashboard
        date={anchor}
        today={today}
        initialView="log"
        logAnchor={anchor}
        logAfter={`${month}-01`}
        onClose={onBack}
      />
      <div className="absolute bottom-7 right-8 z-20">
        <button type="button" className="pill" onClick={onBack}>
          Back to {name}
        </button>
      </div>
    </div>
  );
}
