export interface PriceChange {
  direction: "up" | "down";
  previous: number;
  current: number;
  /** Signed percent change, rounded to a whole number. */
  percent: number;
}

/** Compare a watched listing's price at save time with its current price. */
export function getPriceChange(previous: number | undefined, current: number): PriceChange | null {
  if (previous === undefined || previous <= 0 || previous === current) return null;
  return {
    direction: current < previous ? "down" : "up",
    previous,
    current,
    percent: Math.round(((current - previous) / previous) * 100),
  };
}
