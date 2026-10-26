import { useMemo, useState } from "react";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import { displayAverage, distribution, nodeValue, weightedAverage } from "../domain/calc";
import { formatGrade, parseGrade } from "../domain/grade";
import type { Course, GradeEntry, TreeNode } from "../domain/types";

// V3 Analyse: Leistungsverlauf (Notenkurve), Was-wäre-wenn-Rechner,
// Kursstatistik und Histogramm pro Arbeit.

export function AnalysisPanel({ course }: { course: Course }) {
  useVault();
  const [studentId, setStudentId] = useState("");
  const [targetText, setTargetText] = useState("2");
  const [histNodeId, setHistNodeId] = useState("");

  const students = useMemo(
    () => [...vault.students.values()]
      .filter((s) => s.courseId === course.id)
      .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [course.id, vault.students],
  );
  const nodes = useMemo(
    () => [...vault.nodes.values()].filter((n) => n.courseId === course.id),
    [course.id, vault.nodes],
  );
  const entries = useMemo(
    () => [...vault.entries.values()].filter((e) => e.courseId === course.id),
    [course.id, vault.entries],
  );
  const assessments = nodes.filter((n) => n.kind === "assessment");
  const byParent = useMemo(() => {
    const m = new Map<string | null, TreeNode[]>();
    for (const n of nodes) {
      const arr = m.get(n.parentId) ?? [];
      arr.push(n);
      m.set(n.parentId, arr);
    }
    return m;
  }, [nodes]);
  const roots = useMemo(
    () => (byParent.get(null) ?? []).filter((n) => n.kind === "category"),
    [byParent],
  );

  const student = studentId ? vault.students.get(studentId) : null;

  // ---------- Leistungsverlauf ----------
  const curve = useMemo(() => {
    if (!student) return [];
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const graded = entries
      .filter((e) => e.studentId === student.id && e.status !== "excused")
      .map((e) => ({
        e,
        t: nodeById.get(e.nodeId)?.date
          ? Date.parse(nodeById.get(e.nodeId)!.date!)
          : e.updatedAt,
      }))
      .sort((a, b) => a.t - b.t);
    const pts: { t: number; v: number; run: number; name: string }[] = [];
    for (const { e, t } of graded) {
      const v = course.gradingMode === "points"
        ? (e.status === "unexcused" ? 0 : e.points)
        : (e.status === "unexcused" ? 6 : e.value);
      if (v === null) continue;
      const soFar = entries.filter((x) => {
        const xt = nodeById.get(x.nodeId)?.date ? Date.parse(nodeById.get(x.nodeId)!.date!) : x.updatedAt;
        return x.studentId === student.id && xt <= t;
      });
      const run = weightedAverage(nodes, soFar, student.id, course.gradingMode);
      pts.push({ t, v, run: run ?? v, name: nodeById.get(e.nodeId)?.name ?? "" });
    }
    return pts;
  }, [student?.id, entries, nodes, course.gradingMode]);

  const lo = course.gradingMode === "points" ? 0 : 1;
  const hi = course.gradingMode === "points" ? 15 : 6;
  const W = 640, H = 260, PAD = 36;
  const px = (i: number) => curve.length <= 1 ? W / 2 : PAD + (i / (curve.length - 1)) * (W - 2 * PAD);
  const py = (v: number) =>
    course.gradingMode === "points"
      ? H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD)
      : PAD + ((v - lo) / (hi - lo)) * (H - 2 * PAD); // grades: 1 oben

  // ---------- Was-wäre-wenn ----------
  const target = course.gradingMode === "points"
    ? Number(targetText.replace(",", "."))
    : parseGrade(targetText);
  const www = useMemo(() => {
    if (!student || target === null || !Number.isFinite(target)) return [];
    const entryByNode = new Map(
      entries.filter((e) => e.studentId === student.id).map((e) => [e.nodeId, e]),
    );
    const rootsAll = byParent.get(null) ?? [];
    return rootsAll.map((r) => {
      const cur = nodeValue(r, byParent, entryByNode, course.gradingMode);
      const den = rootsAll.reduce((a, x) => a + (x.weight || 0), 0);
      // others: current value, or target when still ungraded
      const otherSum = rootsAll.reduce((a, x) =>
        x.id === r.id ? a
        : a + (x.weight || 0) * (nodeValue(x, byParent, entryByNode, course.gradingMode) ?? target),
        0);
      const needed = den === 0 || !r.weight ? null
        : (target * den - otherSum) / r.weight;
      const range = course.gradingMode === "points" ? [0, 15] : [1, 6];
      const possible = needed === null ? null
        : needed >= range[0] && needed <= range[1];
      return { node: r, cur, needed, possible };
    });
  }, [student?.id, target, entries, byParent, course.gradingMode]);

  // ---------- Kursstatistik ----------
  const catStats = useMemo(() => roots.map((r) => {
    const vals = students.map((s) => {
      const ebn = new Map(entries.filter((e) => e.studentId === s.id).map((e) => [e.nodeId, e]));
      return nodeValue(r, byParent, ebn, course.gradingMode);
    }).filter((v): v is number => v !== null);
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { node: r, mean, n: vals.length };
  }), [roots, students, entries, byParent, course.gradingMode]);

  const assessStats = useMemo(() => assessments.map((a) => {
    const vals = entries
      .filter((e) => e.nodeId === a.id && e.status === "graded")
      .map((e) => (course.gradingMode === "points" ? e.points : e.value))
      .filter((v): v is number => v !== null);
    return {
      node: a,
      mean: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null,
      min: vals.length ? Math.min(...vals) : null,
      max: vals.length ? Math.max(...vals) : null,
      n: vals.length,
    };
  }).filter((s) => s.n > 0), [assessments, entries, course.gradingMode]);

  // ---------- Histogramm ----------
  const histNode = histNodeId ? nodes.find((n) => n.id === histNodeId) : null;
  const hist = histNode ? distribution(entries, histNode.id, course.gradingMode) : new Map();
  const histTotal = [...hist.values()].reduce((a, b) => a + b, 0);
  const histSorted = [...hist.entries()].sort((a, b) =>
    course.gradingMode === "points" ? b[0] - a[0] : a[0] - b[0]);

  const fmt = (v: number | null, digits = 2) =>
    v === null ? "—" : v.toFixed(digits).replace(".", ",");
  const label = (v: number) => course.gradingMode === "points" ? `${v}` : formatGrade(v);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-medium mb-2">Leistungsverlauf</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <select className="border rounded-lg px-3 py-2 min-h-11" value={studentId}
            onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Schüler wählen…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>)}
          </select>
        </div>
        {student && curve.length === 0 && (
          <p className="text-neutral-500 text-sm">Noch keine bewerteten Arbeiten.</p>
        )}
        {curve.length > 0 && (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl bg-white border rounded-xl">
            {[lo, (lo + hi) / 2, hi].map((g) => (
              <g key={g}>
                <line x1={PAD} x2={W - PAD} y1={py(g)} y2={py(g)} stroke="#e5e5e5" />
                <text x={6} y={py(g) + 4} fontSize="11" fill="#737373">{label(g)}</text>
              </g>
            ))}
            <polyline fill="none" stroke="#93c5fd" strokeWidth="2" strokeDasharray="4 3"
              points={curve.map((p, i) => `${px(i)},${py(p.run)}`).join(" ")} />
            {curve.map((p, i) => (
              <g key={i}>
                <circle cx={px(i)} cy={py(p.v)} r="5" fill="#2563eb" />
                <text x={px(i)} y={py(p.v) - 9} fontSize="10" textAnchor="middle" fill="#1e3a8a">
                  {label(p.v)}
                </text>
                <text x={px(i)} y={H - 8} fontSize="9" textAnchor="middle" fill="#737373">
                  {new Date(p.t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                </text>
              </g>
            ))}
            <text x={W - PAD} y={16} fontSize="10" textAnchor="end" fill="#93c5fd">gestrichelt: Gesamt-Ø</text>
          </svg>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-2">Was-wäre-wenn-Rechner</h2>
        {!student ? (
          <p className="text-neutral-500 text-sm">Oben einen Schüler wählen.</p>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm mb-3">
              Ziel{course.gradingMode === "points" ? "punkte" : "note"}
              <input className="border rounded-lg px-3 py-2 min-h-11 w-28"
                value={targetText} onChange={(e) => setTargetText(e.target.value)}
                placeholder={course.gradingMode === "points" ? "0–15" : "z. B. 2 oder 2-"} />
            </label>
            {target === null || !Number.isFinite(target) ? (
              <p className="text-sm text-red-600">Ziel nicht lesbar.</p>
            ) : (
              <div className="overflow-auto bg-white border rounded-xl">
                <table className="min-w-full border-collapse">
                  <thead><tr>
                    <th className="border p-2 text-left text-sm bg-neutral-100">Kategorie</th>
                    <th className="border p-2 text-sm bg-neutral-100">Aktuell</th>
                    <th className="border p-2 text-sm bg-neutral-100">Benötigt für {course.gradingMode === "points" ? target : formatGrade(target)}</th>
                    <th className="border p-2 text-left text-sm bg-neutral-100">Bewertung</th>
                  </tr></thead>
                  <tbody>
                    {www.map(({ node, cur, needed, possible }) => (
                      <tr key={node.id}>
                        <td className="border p-2 text-sm">{node.name} <span className="text-neutral-400">(×{node.weight})</span></td>
                        <td className="border p-2 text-sm text-center">{cur === null ? "—" : fmt(cur)}</td>
                        <td className="border p-2 text-sm text-center font-medium">
                          {needed === null ? "—" : fmt(needed)}
                        </td>
                        <td className="border p-2 text-sm">
                          {possible === null ? "—"
                            : possible ? (cur !== null && (course.gradingMode === "points" ? cur >= target : cur <= target)
                              ? "erreicht" : "erreichbar")
                              : "nicht mehr erreichbar"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-2">Kursstatistik</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="bg-white border rounded-xl p-3">
            <h3 className="text-sm font-medium mb-2">Durchschnitt pro Kategorie</h3>
            <table className="w-full border-collapse">
              <tbody>
                {catStats.map(({ node, mean, n }) => (
                  <tr key={node.id}>
                    <td className="border p-2 text-sm">{node.name}</td>
                    <td className="border p-2 text-sm text-center">{fmt(mean)}</td>
                    <td className="border p-2 text-xs text-neutral-500 text-center">{n} Werte</td>
                  </tr>
                ))}
                {catStats.length === 0 && (
                  <tr><td className="p-2 text-sm text-neutral-400">Keine Kategorien.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-white border rounded-xl p-3">
            <h3 className="text-sm font-medium mb-2">Arbeiten im Vergleich</h3>
            <table className="w-full border-collapse">
              <thead><tr>
                <th className="border p-2 text-left text-xs">Arbeit</th>
                <th className="border p-2 text-xs">Ø</th>
                <th className="border p-2 text-xs">Min</th>
                <th className="border p-2 text-xs">Max</th>
                <th className="border p-2 text-xs">n</th>
              </tr></thead>
              <tbody>
                {assessStats.map(({ node, mean, min, max, n }) => (
                  <tr key={node.id}>
                    <td className="border p-2 text-sm">{node.name}</td>
                    <td className="border p-2 text-sm text-center">{fmt(mean)}</td>
                    <td className="border p-2 text-sm text-center">{min === null ? "—" : label(min)}</td>
                    <td className="border p-2 text-sm text-center">{max === null ? "—" : label(max)}</td>
                    <td className="border p-2 text-sm text-center">{n}</td>
                  </tr>
                ))}
                {assessStats.length === 0 && (
                  <tr><td colSpan={5} className="p-2 text-sm text-neutral-400">Noch keine Noten.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-medium mb-2">Histogramm (Plausibilitätsprüfung)</h2>
        <select className="border rounded-lg px-3 py-2 min-h-11 mb-3" value={histNodeId}
          onChange={(e) => setHistNodeId(e.target.value)}>
          <option value="">Arbeit wählen…</option>
          {assessments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {histNode && (
          <div className="bg-white border rounded-xl p-4 max-w-xl">
            {histTotal === 0 ? (
              <p className="text-sm text-neutral-400">Keine Noten eingetragen.</p>
            ) : (
              <ul className="space-y-1.5">
                {histSorted.map(([v, count]) => (
                  <li key={v} className="flex items-center gap-2 text-sm">
                    <span className="w-14 text-right font-medium">{label(v)}</span>
                    <span className="h-5 bg-blue-500 rounded flex items-center justify-end pr-1 text-white text-xs"
                      style={{ width: `${(count / histTotal) * 100}%`, minWidth: 28 }}>
                      {count}
                    </span>
                    <span className="text-xs text-neutral-500">{Math.round((count / histTotal) * 100)} %</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
