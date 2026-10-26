import { useMemo } from "react";
import { Link } from "react-router-dom";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import { displayAverage, distribution } from "../domain/calc";
import { formatGrade } from "../domain/grade";
import type { Course } from "../domain/types";

// Auswertung: gewichteter Durchschnitt + Notenvorschlag pro Schüler,
// Notenspiegel (Verteilung) pro Arbeit.

export function EvalPanel({ course }: { course: Course }) {
  useVault();
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

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-medium mb-2">Durchschnitt und Vorschlag</h2>
        <div className="overflow-auto bg-white border rounded-xl">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th className="border p-2 text-left text-sm bg-neutral-100">Schüler</th>
                <th className="border p-2 text-sm bg-neutral-100">Ø</th>
                <th className="border p-2 text-sm bg-neutral-100">Vorschlag</th>
                <th className="border p-2 text-sm bg-neutral-100"></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const avg = displayAverage(nodes, entries, s.id, course.gradingMode);
                return (
                  <tr key={s.id}>
                    <td className="border p-2 text-sm">{s.lastName}, {s.firstName}</td>
                    <td className="border p-2 text-sm text-center">
                      {avg === null ? "—" : avg.toFixed(2).replace(".", ",")}
                    </td>
                    <td className="border p-2 text-sm text-center font-medium">
                      {avg === null ? "—" : course.gradingMode === "points"
                        ? `${avg.toFixed(1)}`
                        : formatGrade(avg)}
                    </td>
                    <td className="border p-2 text-sm text-center">
                      <Link to={`/course/${course.id}/besprechung/${s.id}`}
                        className="text-blue-600"
                        title="Besprechungsmodus — nur diese Schülerin/dieser Schüler">
                        Besprechung
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-medium mb-2">Notenspiegel pro Arbeit</h2>
        {assessments.length === 0 ? (
          <p className="text-neutral-500 text-sm">Noch keine Arbeiten angelegt.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {assessments.map((a) => {
              const dist = distribution(entries, a.id, course.gradingMode);
              const total = [...dist.values()].reduce((x, y) => x + y, 0);
              const sorted = [...dist.entries()].sort((x, y) =>
                course.gradingMode === "points" ? y[0] - x[0] : x[0] - y[0]);
              return (
                <div key={a.id} className="bg-white border rounded-xl p-3">
                  <div className="font-medium text-sm mb-2">
                    {a.name} <span className="text-neutral-400">({total} Noten)</span>
                  </div>
                  {sorted.length === 0 ? (
                    <p className="text-xs text-neutral-400">Keine Einträge</p>
                  ) : (
                    <ul className="space-y-1">
                      {sorted.map(([v, count]) => (
                        <li key={v} className="flex items-center gap-2 text-sm">
                          <span className="w-12 text-right">
                            {course.gradingMode === "points" ? `${v} P.` : formatGrade(v)}
                          </span>
                          <span className="h-3 bg-blue-500 rounded"
                            style={{ width: `${(count / total) * 100}%`, minWidth: 4 }} />
                          <span className="text-xs text-neutral-500">{count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
