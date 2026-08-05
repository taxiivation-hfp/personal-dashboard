"use client";

import { PILLAR_META, type PillarKey } from "@/lib/pillars";

type Ring = { pillar: PillarKey; name: string; closed: boolean };

function Ring({ ring }: { ring: Ring }) {
  const meta = PILLAR_META[ring.pillar];
  const size = 74;
  const cx = size / 2;
  const r = 29;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {/* faint always-visible track keeps each area's identity even when open */}
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={meta.hex} strokeWidth="8" opacity={0.16} />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={meta.hex}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={ring.closed ? 0 : c}
            style={{
              transition: "stroke-dashoffset 700ms cubic-bezier(.2,.7,.2,1)",
              filter: ring.closed ? `drop-shadow(0 0 7px ${meta.hex}55)` : "none",
            }}
          />
        </svg>
        {ring.closed && (
          <span className="absolute inset-0 flex items-center justify-center">
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
              <path d="M3.2 8.6l3 3 6.6-7.4" stroke={meta.hex} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>
      <span
        className="text-[11px] font-medium tracking-wide transition-colors"
        style={{ color: ring.closed ? meta.hex : "var(--color-muted)" }}
      >
        {meta.short}
      </span>
    </div>
  );
}

export default function Rings({ rings }: { rings: Ring[] }) {
  const closed = rings.filter((r) => r.closed).length;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-start justify-center gap-9">
        {rings.map((r) => (
          <Ring key={r.pillar} ring={r} />
        ))}
      </div>
      <p className="text-xs text-[var(--color-muted)]">
        {closed === 3 ? "All three areas touched today" : `${closed} of 3 areas touched`}
      </p>
    </div>
  );
}
