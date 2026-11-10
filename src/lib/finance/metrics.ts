/** Small, pure helpers for growth rates and margins. */

export function growth(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || !(prior > 0)) return null;
  return current / prior - 1;
}

export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

/** A margin is only meaningful against positive revenue. */
export function margin(item: number | null, revenue: number | null): number | null {
  if (item === null || revenue === null || !(revenue > 0)) return null;
  return item / revenue;
}
