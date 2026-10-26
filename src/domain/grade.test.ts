import { describe, it, expect } from "vitest";
import {
  parseGrade,
  formatGrade,
  snapToTendenz,
  applyScale,
  pointsToGrade,
  gradeToPoints,
} from "./grade";

describe("parseGrade", () => {
  it("parses plain grades", () => {
    expect(parseGrade("1")).toBe(1);
    expect(parseGrade("6")).toBe(6);
  });
  it("parses tendencies (D1: 2- stored as 2.25)", () => {
    expect(parseGrade("2-")).toBe(2.25);
    expect(parseGrade("2+")).toBe(1.75);
    expect(parseGrade("3-")).toBe(3.25);
  });
  it("parses half steps", () => {
    expect(parseGrade("2/3")).toBe(2.5);
    expect(parseGrade("2 3")).toBe(2.5);
  });
  it("parses words", () => {
    expect(parseGrade("gut")).toBe(2);
    expect(parseGrade("gut+")).toBe(1.75);
    expect(parseGrade("ausreichend")).toBe(4);
  });
  it("accepts decimals and commas", () => {
    expect(parseGrade("2,5")).toBe(2.5);
    expect(parseGrade("3.7")).toBe(3.7);
  });
  it("rejects invalid", () => {
    expect(parseGrade("7")).toBeNull();
    expect(parseGrade("abc")).toBeNull();
    expect(parseGrade("")).toBeNull();
  });
});

describe("snapToTendenz / suggest (D1)", () => {
  it("2.49 -> 2-, 2.50 -> 3+", () => {
    expect(formatGrade(2.49)).toBe("2-");
    expect(formatGrade(2.5)).toBe("3+");
    expect(snapToTendenz(2.5).value).toBe(2.75);
  });
  it("snaps each grid point", () => {
    for (const [v, label] of [
      [1.0, "1"], [1.25, "1-"], [1.75, "2+"], [2.0, "2"], [2.25, "2-"],
      [2.75, "3+"], [3.0, "3"], [3.25, "3-"], [3.75, "4+"], [4.0, "4"],
      [4.25, "4-"], [4.75, "5+"], [5.0, "5"], [5.25, "5-"], [6.0, "6"],
    ] as const) {
      expect(formatGrade(v)).toBe(label);
    }
  });
  it("clamps extremes", () => {
    expect(formatGrade(0.5)).toBe("1");
    expect(formatGrade(6.9)).toBe("6");
  });
});

describe("points mode", () => {
  it("maps points to grade linearly", () => {
    expect(pointsToGrade(15)).toBeCloseTo(1);
    expect(pointsToGrade(0)).toBeCloseTo(6);
    expect(pointsToGrade(7.5)).toBeCloseTo(3.5);
  });
  it("round-trips gradeToPoints at grid points", () => {
    expect(gradeToPoints(1)).toBe(15);
    expect(gradeToPoints(6)).toBe(0);
  });
});

describe("applyScale", () => {
  const scale = [
    { pct: 90, grade: 1 },
    { pct: 80, grade: 2 },
    { pct: 0, grade: 6 },
  ];
  it("returns first met threshold", () => {
    expect(applyScale(95, scale)).toBe(1);
    expect(applyScale(87.5, scale)).toBe(2);
    expect(applyScale(80, scale)).toBe(2);
    expect(applyScale(50, scale)).toBe(6);
  });
  it("handles unordered thresholds", () => {
    const u = [...scale].reverse();
    expect(applyScale(95, u)).toBe(1);
  });
});
