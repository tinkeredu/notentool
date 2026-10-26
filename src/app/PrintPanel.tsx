import { useMemo, useState } from "react";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import { formatGrade } from "../domain/grade";
import type { Course } from "../domain/types";

// Druck-/PDF-Ansichten: Notenspiegel einer Arbeit, Kursliste als
// Tischvorlage, Schülerbericht gefiltert auf eine Kategorie.

type View = "notenspiegel" | "tischvorlage" | "schuelerbericht";

export function PrintPanel({ course }: { course: Course }) {
  useVault();
  const [view, setView] = useState<View>("notenspiegel");
  const [assessmentId, setAssessmentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [studentId, setStudentId] = useState("");

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
  const assessments = nodes.filter((n) => n.kind === "assessment");
  const categories = nodes.filter((n) => n.kind === "category");

  const leavesUnder = (catId: string) => {
    const out: string[] = [];
    const walk = (id: string) => {
      for (const n of nodes.filter((x) => x.parentId === id)) {
        n.kind === "assessment" ? out.push(n.id) : walk(n.id);
      }
    };
    walk(catId);
    return out;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <select className="border rounded-lg px-3 py-2 min-h-11" value={view}
          onChange={(e) => setView(e.target.value as View)}>
          <option value="notenspiegel">Notenspiegel einer Arbeit</option>
          <option value="tischvorlage">Kursliste (Tischvorlage)</option>
          <option value="schuelerbericht">Schülerbericht pro Kategorie</option>
        </select>
        {view === "notenspiegel" && (
          <select className="border rounded-lg px-3 py-2 min-h-11" value={assessmentId}
            onChange={(e) => setAssessmentId(e.target.value)}>
            <option value="">Arbeit wählen…</option>
            {assessments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {view === "schuelerbericht" && (
          <>
            <select className="border rounded-lg px-3 py-2 min-h-11" value={studentId}
              onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Schüler wählen…</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>)}
            </select>
            <select className="border rounded-lg px-3 py-2 min-h-11" value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Kategorie wählen…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
        <button className="min-h-11 px-5 rounded-lg bg-blue-600 text-white font-medium"
          onClick={() => window.print()}>Drucken / PDF</button>
      </div>

      <div className="bg-white border rounded-xl p-6 print-area">
        {view === "notenspiegel" && assessmentId && (
          <>
            <h2 className="text-lg font-semibold mb-3">
              {course.name} — {assessments.find((a) => a.id === assessmentId)?.name}
            </h2>
            <table className="w-full border-collapse">
              <thead><tr>
                <th className="border p-2 text-left text-sm">Schüler</th>
                <th className="border p-2 text-sm">Note</th>
                <th className="border p-2 text-left text-sm">Kommentar</th>
              </tr></thead>
              <tbody>
                {students.map((s) => {
                  const e = [...vault.entries.values()].find(
                    (x) => x.studentId === s.id && x.nodeId === assessmentId,
                  );
                  return (
                    <tr key={s.id}>
                      <td className="border p-2 text-sm">{s.lastName}, {s.firstName}</td>
                      <td className="border p-2 text-sm text-center">
                        {!e ? "—" : e.status === "excused" ? "e"
                          : e.status === "unexcused" ? "u"
                          : course.gradingMode === "points" ? `${e.points ?? "?"} P.` : e.value !== null ? formatGrade(e.value) : "—"}
                      </td>
                      <td className="border p-2 text-sm">{e?.comment ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
        {view === "notenspiegel" && !assessmentId && <p className="text-neutral-400 text-sm">Arbeit wählen…</p>}

        {view === "tischvorlage" && (
          <>
            <h2 className="text-lg font-semibold mb-3">{course.name} — Namen &amp; Plätze</h2>
            <table className="w-full border-collapse">
              <thead><tr>
                <th className="border p-2 text-left text-sm">Schüler</th>
                {[1, 2, 3, 4, 5].map((i) => (
                  <th key={i} className="border p-2 text-sm text-neutral-400"> </th>
                ))}
              </tr></thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td className="border p-3 text-sm">{s.lastName}, {s.firstName}</td>
                    {[1, 2, 3, 4, 5].map((i) => <td key={i} className="border p-3"></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {view === "schuelerbericht" && studentId && categoryId && (() => {
          const s = vault.students.get(studentId)!;
          const leafIds = new Set(leavesUnder(categoryId));
          const rows = [...vault.entries.values()].filter(
            (e) => e.studentId === studentId && leafIds.has(e.nodeId),
          );
          return (
            <>
              <h2 className="text-lg font-semibold mb-1">
                {s.firstName} {s.lastName} — {categories.find((c) => c.id === categoryId)?.name}
              </h2>
              <p className="text-sm text-neutral-500 mb-3">{course.name}</p>
              <table className="w-full border-collapse">
                <thead><tr>
                  <th className="border p-2 text-left text-sm">Arbeit</th>
                  <th className="border p-2 text-sm">Note</th>
                  <th className="border p-2 text-left text-sm">Kommentar</th>
                </tr></thead>
                <tbody>
                  {[...leafIds].map((id) => {
                    const n = nodes.find((x) => x.id === id)!;
                    const e = rows.find((r) => r.nodeId === id);
                    return (
                      <tr key={id}>
                        <td className="border p-2 text-sm">{n.name}</td>
                        <td className="border p-2 text-sm text-center">
                          {!e ? "—" : e.status === "excused" ? "e"
                            : e.status === "unexcused" ? "u"
                            : course.gradingMode === "points" ? `${e.points ?? "?"} P.` : e.value !== null ? formatGrade(e.value) : "—"}
                        </td>
                        <td className="border p-2 text-sm">{e?.comment ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          );
        })()}
        {view === "schuelerbericht" && (!studentId || !categoryId) && (
          <p className="text-neutral-400 text-sm">Schüler und Kategorie wählen…</p>
        )}
      </div>
    </div>
  );
}
