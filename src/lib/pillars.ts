// Client-safe pillar presentation metadata (no server imports).

export type PillarKey = "social_capital" | "physical" | "portfolio";

export const PILLAR_META: Record<PillarKey, { label: string; short: string; hex: string }> = {
  social_capital: { label: "Social Capital & Career", short: "Social", hex: "#e0b341" },
  physical: { label: "Physical Embodiment", short: "Physical", hex: "#4ec9a8" },
  portfolio: { label: "Portfolio Expansion", short: "Portfolio", hex: "#8a7df0" },
};

export const pillarHex = (k: PillarKey | null | undefined): string =>
  k ? PILLAR_META[k].hex : "#6b6b78";
