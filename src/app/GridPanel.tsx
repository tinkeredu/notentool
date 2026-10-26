import { useMemo, useState, useSyncExternalStore } from "react";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import { pushUndo, undoLast, canUndo, peekLabel, subscribeUndo } from "../data/undo";
import { parseGrade, formatGrade, applyScale } from "../domain/grade";
import { displayAverage } from "../domain/calc";
import type { Course, GradeEntry, Student, TreeNode } from "../domain/types";

// Teacher-calendar-style input grid: rows = students, columns = assessments.
// Every grade change is undoable; a per-cell status cycles
// bewertet → entschuldigt → unentschuldigt; each cell has a comment field.

function assessmentsOf(courseId: string): TreeNode[] {
  const nodes = [...vault.nodes.values()].filter((n) => n.courseId === courseId);
  const out: TreeNode[] = [];
  const walk = (parentId: string | null) => {
    for (const n of nodes.filter((x) => x.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name))) {
      if (n.kind === "assessment") out.push(n);
      else walk(n.id);
    }
  };
  walk(null);
  return out;
}

export function GridPanel({ course }: { course: Course }) {
  useVault();
  useSyncExternalStore(subscribeUndo, () => (canUndo() ? peekLabel() : "") ?? "");
  const [undoMsg, setUndoMsg] = useState("");
  const students = useMemo(
    () => [...vault.students.values()]
      .filter((s) => s.courseId === course.id)
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    [course.id, vault.students],
  );
  const assessments = useMemo(() => assessmentsOf(course.id), [course.id, vault.nodes]);
  const courseNodes = useMemo(
    () => [...vault.nodes.values()].filter((n) => n.courseId === course.id),
    [course.id, vault.nodes],
  );
  const courseEntries = useMemo(
    () => [...vault.entries.values()].filter((e) => e.courseId === course.id),
    [course.id, vault.entries],
  );
  const entryBy = useMemo(() => {
    const m = new Map<string, GradeEntry>();
    for (const e of courseEntries) m.set(`${e.studentId}:${e.nodeId}`, e);
    return m;
  }, [courseEntries]);

  if (!students.length) return <p className="text-neutral-500">Zuerst Schüler im Tab „Schüler" anlegen.</p>;
  if (!assessments.length) return <p className="text-neutral-500">Zuerst Arbeiten im Tab „Notenbaum" anlegen.</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          className="min-h-11 px-4 rounded-lg border text-sm disabled:opacity-40"
          disabled={!canUndo()}
          onClick={async () => {
            const label = await undoLast();
            setUndoMsg(label ? `Rückgängig: ${label}` : "");
            setTimeout(() => setUndoMsg(""), 3000);
          }}
        >
          ↩ Rückgängig{peekLabel() ? `: ${peekLabel()}` : ""}
        </button>
        {undoMsg && <span className="text-sm text-neutral-500">{undoMsg}</span>}
      </div>
      <div className="overflow-auto bg-white border rounded-xl">
        <table className="border-collapse min-w-full">
          <thead>
            <tr>
              <th className="sticky left-0 bg-neutral-100 border p-2 text-left text-sm font-medium z-10">Schüler</th>
              {assessments.map((a) => (
                <th key={a.id} className="border p-2 text-sm font-medium min-w-24 bg-neutral-100">
                  {a.name}
                  {a.maxPoints ? <div className="text-xs font-normal text-neutral-500">/{a.maxPoints} P.</div> : null}
                </th>
              ))}
              <th className="border p-2 text-sm font-medium bg-neutral-100">Ø</th>
              <th className="border p-2 text-sm font-medium bg-neutral-100">Vorschlag</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <th className="sticky left-0 bg-white border p-2 text-left text-sm font-normal whitespace-nowrap z-10">
                  {s.lastName}, {s.firstName}
                </th>
                {assessments.map((a) => (
                  <Cell
                    key={a.id} course={course} student={s} node={a}
                    entry={entryBy.get(`${s.id}:${a.id}`)}
                  />
                ))}
                <AvgCell course={course} student={s} nodes={courseNodes} entries={courseEntries} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AvgCell({ course, student, nodes, entries }: {
  course: Course; student: Student; nodes: TreeNode[]; entries: GradeEntry[];
}) {
  const avg = displayAverage(nodes, entries, student.id, course.gradingMode);
  return (
    <>
      <td className="border p-2 text-center text-sm">{avg === null ? "—" : avg.toFixed(2).replace(".", ",")}</td>
      <td className="border p-2 text-center text-sm font-medium">
        {avg === null ? "—" : course.gradingMode === "points" ? avg.toFixed(1) : formatGrade(avg)}
      </td>
    </>
  );
}

function Cell({ course, student, node, entry }: {
  course: Course; student: Student; node: TreeNode; entry?: GradeEntry;
}) {
  const [text, setText] = useState<string | null>(null);
  const [comment, setComment] = useState(entry?.comment ?? "");
  const [invalid, setInvalid] = useState(false);
  const [showComment, setShowComment] = useState(!!entry?.comment);

  const status = entry?.status ?? null;
  const displayText = text ?? (entry
    ? entry.status === "excused" ? "e" : entry.status === "unexcused" ? "u"
      : course.gradingMode === "points" ? String(entry.points ?? "")
      : entry.value !== null ? formatGrade(entry.value) : ""
    : "");

  const save = async (patch: Partial<GradeEntry>, _label?: string) => {
    const prev = entry;
    const next: GradeEntry = {
      id: prev?.id ?? crypto.randomUUID(),
      courseId: course.id, studentId: student.id, nodeId: node.id,
      status: "graded", value: null, points: null, comment: comment,
      ...prev, ...patch, updatedAt: 0, updatedBy: "",
    };
    await vault.put("entries", next);
    pushUndo({
      label: `${student.lastName} · ${node.name}`,
      undo: async () => {
        if (prev) await vault.put("entries", prev);
        else await vault.remove("entries", next.id);
      },
    });
  };

  const commitText = async () => {
    const t = (text ?? "").trim();
    setText(null);
    if (!t) {
      if (entry) await save({ status: "excused", value: null, points: null }, "leer");
      setInvalid(false);
      return;
    }
    if (t === "e") { await save({ status: "excused", value: null, points: null }, "entschuldigt"); return; }
    if (t === "u") { await save({ status: "unexcused", value: null, points: null }, "unentschuldigt"); return; }
    if (node.maxPoints) {
      const p = Number(t.replace(",", "."));
      if (!Number.isFinite(p) || p < 0 || p > node.maxPoints) { setInvalid(true); return; }
      const scaleId = node.scaleId ?? course.scaleId;
      const scale = scaleId ? vault.scales.get(scaleId) : null;
      const pct = (p / node.maxPoints) * 100;
      const g = scale ? applyScale(pct, scale.thresholds) : null;
      if (course.gradingMode === "points") {
        await save({ status: "graded", points: g, value: null }, `${p} P. → ${g ?? "?"} P.`);
      } else {
        await save({ status: "graded", value: g, points: null }, `${p} P. → ${g ? formatGrade(g) : "?"}`);
      }
      setInvalid(false);
      return;
    }
    if (course.gradingMode === "points") {
      const p = Number(t.replace(",", "."));
      if (!Number.isFinite(p) || p < 0 || p > 15) { setInvalid(true); return; }
      await save({ status: "graded", points: p, value: null }, `${p} P.`);
    } else {
      const v = parseGrade(t);
      if (v === null) { setInvalid(true); return; }
      await save({ status: "graded", value: v, points: null }, formatGrade(v));
    }
    setInvalid(false);
  };

  const border = status === "unexcused" ? "border-red-300" : status === "excused" ? "border-amber-300" : "";
  return (
    <td className={`border p-1 align-top ${border}`}>
      <input
        className={`w-20 min-h-11 text-center text-sm rounded ${invalid ? "outline outline-2 outline-red-500 bg-red-50" : ""}`}
        value={displayText}
        placeholder={node.maxPoints ? "Pkt." : course.gradingMode === "points" ? "0–15" : ""}
        title="Note · 'e' = entschuldigt · 'u' = unentschuldigt"
        onFocus={(e) => { setText(entry?.status === "excused" || entry?.status === "unexcused" ? "" : e.target.value); e.target.select(); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <div className="flex gap-1 justify-center mt-0.5">
        <button
          className={`text-xs px-1.5 rounded ${status === "excused" ? "bg-amber-200" : "text-neutral-400"}`}
          title="Entschuldigt fehlend"
          onClick={() => save({ status: status === "excused" ? "graded" : "excused", value: null, points: null }, "entschuldigt")}
        >e</button>
        <button
          className={`text-xs px-1.5 rounded ${status === "unexcused" ? "bg-red-200" : "text-neutral-400"}`}
          title="Unentschuldigt fehlend"
          onClick={() => save({ status: status === "unexcused" ? "graded" : "unexcused", value: null, points: null }, "unentschuldigt")}
        >u</button>
        <button
          className={`text-xs px-1.5 rounded ${entry?.comment ? "bg-blue-100" : "text-neutral-400"}`}
          title="Kommentar"
          onClick={() => setShowComment((v) => !v)}
        >✎</button>
      </div>
      {showComment && (
        <input
          className="w-full mt-1 border rounded px-1.5 py-1 text-xs"
          placeholder="Kommentar"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={async () => {
            if (entry && comment !== entry.comment) await save({ comment }, "Kommentar");
            if (!entry && !comment) setShowComment(false);
          }}
        />
      )}
    </td>
  );
}
