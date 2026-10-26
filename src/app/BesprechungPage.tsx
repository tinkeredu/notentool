import type { ReactNode } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import { displayAverage, nodeValue } from "../domain/calc";
import { formatGrade } from "../domain/grade";
import type { TreeNode } from "../domain/types";

// Notenbesprechungs-Modus: zeigt ausschließlich die Noten eines Schülers —
// geeignet für Beamer und Einzelgespräch, ohne Fremddaten.

export function BesprechungPage() {
  useVault();
  const { courseId, studentId } = useParams();
  const course = courseId ? vault.courses.get(courseId) : undefined;
  const student = studentId ? vault.students.get(studentId) : undefined;
  if (!course || !student || student.courseId !== course.id) return <Navigate to="/" />;

  const nodes = [...vault.nodes.values()].filter((n) => n.courseId === course.id);
  const entries = [...vault.entries.values()].filter(
    (e) => e.courseId === course.id && e.studentId === student.id,
  );
  const byParent = new Map<string | null, TreeNode[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parentId) ?? [];
    arr.push(n);
    byParent.set(n.parentId, arr);
  }
  const entryByNode = new Map(entries.map((e) => [e.nodeId, e]));
  const avg = displayAverage(nodes, entries, student.id, course.gradingMode);

  const render = (parentId: string | null): ReactNode =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => {
        if (n.kind === "category") {
          const catVal = nodeValue(n, byParent, entryByNode, course.gradingMode);
          return (
            <div key={n.id} className="mt-5">
              <h3 className="font-semibold text-lg">
                {n.name}
                {catVal !== null && (
                  <span className="ml-3 font-normal text-neutral-500">
                    Ø {course.gradingMode === "points" ? `${catVal.toFixed(1)} P.` : catVal.toFixed(2).replace(".", ",")}
                  </span>
                )}
              </h3>
              <div className="ml-4">{render(n.id)}</div>
            </div>
          );
        }
        const e = entryByNode.get(n.id);
        const status = e?.status;
        const shown = !e || status === "excused" ? "—"
          : status === "unexcused" ? "unentschuldigt"
          : course.gradingMode === "points" ? `${e.points ?? "?"} P.`
          : e.value !== null ? formatGrade(e.value) : "—";
        return (
          <div key={n.id} className="flex items-baseline gap-4 py-1.5 border-b border-neutral-200">
            <span className="flex-1 text-lg">{n.name}{e?.comment ? <span className="text-sm text-neutral-500"> — {e.comment}</span> : null}</span>
            <span className={`text-xl font-medium ${status === "unexcused" ? "text-red-600" : ""}`}>{shown}</span>
          </div>
        );
      });

  return (
    <div className="min-h-dvh bg-white p-8 max-w-3xl mx-auto">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold">{student.firstName} {student.lastName}</h1>
        <Link to={`/course/${course.id}/auswertung`} className="text-sm text-neutral-400 print:hidden">← zurück</Link>
      </div>
      <p className="text-neutral-500 mt-1">
        {course.name} · {avg !== null && (
          <>Ø {avg.toFixed(2).replace(".", ",")} — Vorschlag:{" "}
            <strong>{course.gradingMode === "points" ? `${avg.toFixed(1)} P.` : formatGrade(avg)}</strong></>
        )}
      </p>
      <div className="mt-6">{render(null)}</div>
    </div>
  );
}
