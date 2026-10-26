// Weighted grade calculation over the grade tree. Pure functions.
//
// Recursive bottom-up weighted mean: each category computes the weighted
// mean of its children that have a value; the category's own weight applies
// once at the parent level, no matter how many leaves inside are counted.
// Status: 'graded' counts at face value, 'unexcused' counts as the worst
// possible result, 'excused' (or absent) is excluded entirely.

import type { GradeEntry, GradingMode, TreeNode } from "./types";
import { pointsToGrade } from "./grade";

// Normalize an entry to a number in unit space (grades-mode decimal, or
// points in points mode). null = excluded from averaging.
export function entryValue(
  entry: GradeEntry,
  mode: GradingMode,
): number | null {
  if (entry.status === "excused") return null;
  if (entry.status === "unexcused") return mode === "points" ? 0 : 6;
  if (mode === "points") return entry.points;
  return entry.value;
}

// Value of one node for one student, or null if it contributes nothing.
export function nodeValue(
  node: TreeNode,
  byParent: Map<string | null, TreeNode[]>,
  entryByNode: Map<string, GradeEntry>,
  mode: GradingMode,
): number | null {
  if (node.kind === "assessment") {
    const e = entryByNode.get(node.id);
    return e ? entryValue(e, mode) : null;
  }
  const parts: { value: number; weight: number }[] = [];
  for (const child of byParent.get(node.id) ?? []) {
    const v = nodeValue(child, byParent, entryByNode, mode);
    if (v !== null) parts.push({ value: v, weight: child.weight || 0 });
  }
  if (!parts.length) return null;
  const den = parts.reduce((a, p) => a + p.weight, 0);
  if (den === 0) return null;
  return parts.reduce((a, p) => a + p.value * p.weight, 0) / den;
}

export type RootResult = {
  average: number | null; // unit space
  missing: string[]; // root-level children without any value
};

export function weightedAverage(
  nodes: TreeNode[],
  entries: GradeEntry[],
  studentId: string,
  mode: GradingMode,
): number | null {
  const { byParent, entryByNode } = index(nodes, entries, studentId);
  const parts: { value: number; weight: number }[] = [];
  for (const root of byParent.get(null) ?? []) {
    const v = nodeValue(root, byParent, entryByNode, mode);
    if (v !== null) parts.push({ value: v, weight: root.weight || 0 });
  }
  if (!parts.length) return null;
  const den = parts.reduce((a, p) => a + p.weight, 0);
  return den === 0 ? null : parts.reduce((a, p) => a + p.value * p.weight, 0) / den;
}

function index(nodes: TreeNode[], entries: GradeEntry[], studentId: string) {
  const byParent = new Map<string | null, TreeNode[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parentId) ?? [];
    arr.push(n);
    byParent.set(n.parentId, arr);
  }
  const entryByNode = new Map(
    entries.filter((e) => e.studentId === studentId).map((e) => [e.nodeId, e]),
  );
  return { byParent, entryByNode };
}

// Average in display space (1–6 decimal) regardless of mode.
export function displayAverage(
  nodes: TreeNode[],
  entries: GradeEntry[],
  studentId: string,
  mode: GradingMode,
): number | null {
  const avg = weightedAverage(nodes, entries, studentId, mode);
  if (avg === null) return null;
  return mode === "points" ? pointsToGrade(avg) : avg;
}

// Grade distribution across the course for one assessment leaf.
export function distribution(
  entries: GradeEntry[],
  nodeId: string,
  mode: GradingMode,
): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of entries) {
    if (e.nodeId !== nodeId || e.status !== "graded") continue;
    const v = mode === "points" ? e.points : e.value;
    if (v === null) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return m;
}
