import { useMemo, useState } from "react";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import { toCsv } from "../data/csv";
import { downloadBlob } from "../data/exchange";
import { displayAverage } from "../domain/calc";
import { formatGrade } from "../domain/grade";
import type { Course } from "../domain/types";

// Selektiver CSV-Export: Auswahl von Kursen, Spalten (Arbeiten) und Schülern.

export function ExportPanel({ course }: { course: Course }) {
  useVault();
  const [allCourses, setAllCourses] = useState(false);
  const [selCourses, setSelCourses] = useState<Set<string>>(new Set([course.id]));
  const [selNodes, setSelNodes] = useState<Set<string> | null>(null); // null = all
  const [selStudents, setSelStudents] = useState<Set<string> | null>(null);

  const nodes = useMemo(
    () => [...vault.nodes.values()].filter(
      (n) => n.kind === "assessment" && selCourses.has(n.courseId),
    ),
    [vault.nodes, selCourses],
  );
  const students = useMemo(
    () => [...vault.students.values()].filter((s) => selCourses.has(s.courseId)),
    [vault.students, selCourses],
  );

  const nodeOn = (id: string) => selNodes === null || selNodes.has(id);
  const studentOn = (id: string) => selStudents === null || selStudents.has(id);

  const doExport = () => {
    const cols = nodes.filter((n) => nodeOn(n.id));
    const header = ["Kurs", "Nachname", "Vorname", ...cols.map((c) => c.name), "Durchschnitt", "Vorschlag"];
    const rows = students.filter((s) => studentOn(s.id)).map((s) => {
      const c = vault.courses.get(s.courseId)!;
      const cNodes = [...vault.nodes.values()].filter((n) => n.courseId === c.id);
      const allEntries = [...vault.entries.values()].filter(
        (e) => e.studentId === s.id && e.courseId === c.id,
      );
      const avg = displayAverage(cNodes, allEntries, s.id, c.gradingMode);
      return [
        c.name, s.lastName, s.firstName,
        ...cols.map((n) => {
          const e = [...vault.entries.values()].find(
            (x) => x.studentId === s.id && x.nodeId === n.id,
          );
          if (!e) return "";
          if (e.status === "excused") return "e";
          if (e.status === "unexcused") return "u";
          return c.gradingMode === "points" ? String(e.points ?? "") : e.value !== null ? formatGrade(e.value) : "";
        }),
        avg === null ? "" : avg.toFixed(2).replace(".", ","),
        avg === null ? "" : c.gradingMode === "points" ? avg.toFixed(1) : formatGrade(avg),
      ];
    });
    const blob = new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `noten-export-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allCourses}
          onChange={(e) => {
            setAllCourses(e.target.checked);
            if (e.target.checked) setSelCourses(new Set([...vault.courses.keys()]));
            else setSelCourses(new Set([course.id]));
          }} />
        Alle Kurse einbeziehen
      </label>
      {allCourses && (
        <div className="flex flex-wrap gap-2">
          {[...vault.courses.values()].map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-sm border rounded-lg px-3 py-2">
              <input type="checkbox" checked={selCourses.has(c.id)}
                onChange={(e) => {
                  const s = new Set(selCourses);
                  e.target.checked ? s.add(c.id) : s.delete(c.id);
                  setSelCourses(s);
                }} />
              {c.name}
            </label>
          ))}
        </div>
      )}
      <div>
        <h3 className="text-sm font-medium mb-1">Spalten (Arbeiten)</h3>
        <div className="flex flex-wrap gap-2">
          <button className="text-xs text-blue-600 underline" onClick={() => setSelNodes(null)}>alle</button>
          <button className="text-xs text-blue-600 underline" onClick={() => setSelNodes(new Set())}>keine</button>
          {nodes.map((n) => (
            <label key={n.id} className="flex items-center gap-1.5 text-sm border rounded-lg px-3 py-2">
              <input type="checkbox" checked={nodeOn(n.id)}
                onChange={(e) => {
                  const s = new Set(selNodes ?? nodes.map((x) => x.id));
                  e.target.checked ? s.add(n.id) : s.delete(n.id);
                  setSelNodes(s);
                }} />
              {n.name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-1">Schüler</h3>
        <div className="flex flex-wrap gap-2">
          <button className="text-xs text-blue-600 underline" onClick={() => setSelStudents(null)}>alle</button>
          <button className="text-xs text-blue-600 underline" onClick={() => setSelStudents(new Set())}>keine</button>
          {students.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm border rounded-lg px-3 py-2">
              <input type="checkbox" checked={studentOn(s.id)}
                onChange={(e) => {
                  const x = new Set(selStudents ?? students.map((y) => y.id));
                  e.target.checked ? x.add(s.id) : x.delete(s.id);
                  setSelStudents(x);
                }} />
              {s.lastName}, {s.firstName}
            </label>
          ))}
        </div>
      </div>
      <button className="min-h-11 px-5 rounded-lg bg-blue-600 text-white font-medium" onClick={doExport}>
        CSV exportieren
      </button>
    </div>
  );
}
