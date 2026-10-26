import { describe, it, expect } from "vitest";
import { weightedAverage, distribution } from "./calc";
import type { GradeEntry, TreeNode } from "./types";

const t = 0;
const dev = "dev";

function node(id: string, parentId: string | null, kind: TreeNode["kind"], weight = 1): TreeNode {
  return {
    id, courseId: "c1", parentId, name: id, weight, kind,
    date: null, maxPoints: null, scaleId: null,
    updatedAt: t, updatedBy: dev,
  };
}

function entry(studentId: string, nodeId: string, value: number, status: GradeEntry["status"] = "graded"): GradeEntry {
  return {
    id: `${studentId}-${nodeId}`, courseId: "c1", studentId, nodeId, status,
    value, points: null, comment: "", updatedAt: t, updatedBy: dev,
  };
}

// Tree: Schriftlich (w2) -> Klausur1, Klausur2
//       Mündlich   (w1) -> Mitarbeit
const tree = [
  node("schriftlich", null, "category", 2),
  node("k1", "schriftlich", "assessment"),
  node("k2", "schriftlich", "assessment"),
  node("muendlich", null, "category", 1),
  node("ma", "muendlich", "assessment"),
];

describe("weightedAverage", () => {
  it("recursive bottom-up: category weight applies once regardless of leaf count", () => {
    // schriftlich avg 3 (k1=2, k2=4), muendlich 2 → (2*3 + 1*2)/3 = 2.67
    const entries = [
      entry("s1", "k1", 2), entry("s1", "k2", 4), entry("s1", "ma", 2),
    ];
    expect(weightedAverage(tree, entries, "s1", "grades")).toBeCloseTo((2 * 3 + 2) / 3);
  });

  it("unexcused counts as 6, excused excluded", () => {
    const entries = [
      entry("s1", "k1", 2),
      { ...entry("s1", "k2", 1), status: "excused" as const },
      { ...entry("s1", "ma", 1), status: "unexcused" as const },
    ];
    // schriftlich = k1 only = 2; muendlich unexcused = 6 → (2*2+6)/3 = 10/3
    expect(weightedAverage(tree, entries, "s1", "grades")).toBeCloseTo(10 / 3);
  });

  it("missing leaves are excluded, parent weight still applies", () => {
    const entries = [entry("s1", "k1", 2), entry("s1", "ma", 4)];
    // schriftlich = 2, muendlich = 4 → (2*2+4)/3 = 8/3
    expect(weightedAverage(tree, entries, "s1", "grades")).toBeCloseTo(8 / 3);
  });

  it("nested depth works", () => {
    const deep = [
      node("a", null, "category", 1),
      node("b", "a", "category", 1),
      node("x", "b", "assessment"),
      node("y", "a", "assessment"),
    ];
    const entries = [entry("s1", "x", 2), entry("s1", "y", 4)];
    // b = 2, a = (2 + 4)/2 = 3
    expect(weightedAverage(deep, entries, "s1", "grades")).toBeCloseTo(3);
  });

  it("returns null with no countable entries", () => {
    expect(weightedAverage(tree, [], "s1", "grades")).toBeNull();
    expect(
      weightedAverage(tree, [{ ...entry("s1", "k1", 1), status: "excused" }], "s1", "grades"),
    ).toBeNull();
  });

  it("zero weights exclude branches", () => {
    const zeroed = tree.map((n) => (n.id === "muendlich" ? { ...n, weight: 0 } : n));
    const entries = [entry("s1", "k1", 2), entry("s1", "ma", 1)];
    expect(weightedAverage(zeroed, entries, "s1", "grades")).toBeCloseTo(2);
  });
});

describe("distribution", () => {
  it("counts graded values only", () => {
    const entries = [
      entry("s1", "k1", 2), entry("s2", "k1", 2), entry("s3", "k1", 4),
      { ...entry("s4", "k1", 1), status: "excused" as const },
      entry("s5", "k2", 1),
    ];
    const d = distribution(entries, "k1", "grades");
    expect(d.get(2)).toBe(2);
    expect(d.get(4)).toBe(1);
    expect(d.size).toBe(2);
  });
});
