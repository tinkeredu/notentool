// Tendenz notation and scales. Pure functions only.

const WORDS: Record<string, number> = {
  "sehr gut": 1.0,
  gut: 2.0,
  befriedigend: 3.0,
  ausreichend: 4.0,
  mangelhaft: 5.0,
  "ungenügend": 6.0,
  ungenuengend: 6.0,
};

// Grid of suggestible tendency grades (D1): no x.5 values.
// 1, 1-, 2+, 2, 2-, 3+, 3, 3-, 4+, 4, 4-, 5+, 5, 5-, 6
const TENDENZ_GRID: { value: number; label: string }[] = [
  { value: 1.0, label: "1" },
  { value: 1.25, label: "1-" },
  { value: 1.75, label: "2+" },
  { value: 2.0, label: "2" },
  { value: 2.25, label: "2-" },
  { value: 2.75, label: "3+" },
  { value: 3.0, label: "3" },
  { value: 3.25, label: "3-" },
  { value: 3.75, label: "4+" },
  { value: 4.0, label: "4" },
  { value: 4.25, label: "4-" },
  { value: 4.75, label: "5+" },
  { value: 5.0, label: "5" },
  { value: 5.25, label: "5-" },
  { value: 6.0, label: "6" },
];

// Parse a German grade input into a decimal value, or null if invalid.
// Accepts: "2", "2-", "2+", "2/3", "2-3", "gut", "gut+", "gut-", numbers.
export function parseGrade(input: string): number | null {
  const t = input.trim().toLowerCase().replace(",", ".");
  if (!t) return null;
  for (const [word, base] of Object.entries(WORDS)) {
    if (t === word) return base;
    if (t === word + "+") return base - 0.25;
    if (t === word + "-") return base + 0.25;
  }
  const m = t.match(/^([1-6])(?:\s*([+-])|\s*\/\s*([1-6])|\s+([1-6]))?$/);
  if (!m) {
    const n = Number(t);
    if (Number.isFinite(n) && n >= 1 && n <= 6) return n;
    return null;
  }
  const base = Number(m[1]);
  if (m[2] === "+") return Math.max(1, base - 0.25);
  if (m[2] === "-") return Math.min(6, base + 0.25);
  const other = m[3] ?? m[4];
  if (other) {
    const lo = Math.min(base, Number(other));
    return lo + 0.5; // "2/3" or "2 3" -> 2.5
  }
  return base;
}

// Snap a decimal to the nearest tendency grade on the grid.
// Ties (exactly x.5) go to the worse grade — so 2.49 -> "2-" and 2.50 -> "3+".
export function snapToTendenz(v: number): { value: number; label: string } {
  let best = TENDENZ_GRID[0];
  let bestDist = Infinity;
  for (const g of TENDENZ_GRID) {
    const d = Math.abs(v - g.value);
    if (d < bestDist - 1e-9 || (Math.abs(d - bestDist) < 1e-9 && g.value > best.value)) {
      best = g;
      bestDist = d;
    }
  }
  return best;
}

// Format a stored decimal to its tendency label.
export function formatGrade(v: number): string {
  return snapToTendenz(v).label;
}

// Suggested grade label for a computed average (decision D1).
export function suggestLabel(avg: number): string {
  return formatGrade(avg);
}

// Points mode (0–15, Oberstufe): linear display mapping to the 1–6 scale.
export function pointsToGrade(points: number): number {
  // 15→1.0, 0→6.0 (linear)
  return 6 - (Math.min(15, Math.max(0, points)) / 15) * 5;
}

export function gradeToPoints(grade: number): number {
  const g = Math.min(6, Math.max(1, grade));
  return Math.round(((6 - g) / 5) * 15);
}

// Percent scale: given pct achieved and thresholds (sorted desc by pct),
// return the grade of the first threshold met; null if below all thresholds
// or the scale is empty.
export function applyScale(
  pct: number,
  thresholds: { pct: number; grade: number }[],
): number | null {
  const sorted = [...thresholds].sort((a, b) => b.pct - a.pct);
  for (const t of sorted) {
    if (pct >= t.pct) return t.grade;
  }
  return null;
}

// German default scale for grades mode (common thresholds).
export const DEFAULT_SCALE_GRADES = [
  { pct: 95, grade: 1.0 },
  { pct: 90, grade: 1.5 },
  { pct: 85, grade: 2.0 },
  { pct: 80, grade: 2.5 },
  { pct: 75, grade: 3.0 },
  { pct: 70, grade: 3.5 },
  { pct: 65, grade: 4.0 },
  { pct: 60, grade: 4.5 },
  { pct: 55, grade: 5.0 },
  { pct: 50, grade: 5.5 },
  { pct: 0, grade: 6.0 },
];

// Default scale for points mode (0–15, common Oberstufe mapping).
export const DEFAULT_SCALE_POINTS = [
  { pct: 95, grade: 15 },
  { pct: 90, grade: 14 },
  { pct: 85, grade: 13 },
  { pct: 80, grade: 12 },
  { pct: 75, grade: 11 },
  { pct: 70, grade: 10 },
  { pct: 65, grade: 9 },
  { pct: 60, grade: 8 },
  { pct: 55, grade: 7 },
  { pct: 50, grade: 6 },
  { pct: 45, grade: 5 },
  { pct: 40, grade: 4 },
  { pct: 33, grade: 3 },
  { pct: 27, grade: 2 },
  { pct: 20, grade: 1 },
  { pct: 0, grade: 0 },
];
