import { useState } from "react";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import { formatGrade } from "../domain/grade";
import type { Course, Scale } from "../domain/types";

// Skaleneditor: Prozent-Schwellen ↔ Notenstufe (D4). Edits the course's
// default scale; per-assessment overrides are managed in the tree editor.

export function ScalePanel({ course }: { course: Course }) {
  useVault();
  const [pct, setPct] = useState("");
  const [grade, setGrade] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  // all scales used in this course: course default + per-assessment overrides
  const scaleIds = new Set<string>();
  if (course.scaleId) scaleIds.add(course.scaleId);
  const overrideFor = new Map<string, string>(); // scaleId -> assessment name
  for (const n of vault.nodes.values()) {
    if (n.courseId === course.id && n.scaleId) {
      scaleIds.add(n.scaleId);
      overrideFor.set(n.scaleId, n.name);
    }
  }
  const scaleList = [...scaleIds].map((id) => vault.scales.get(id)).filter(Boolean) as Scale[];
  const scale = scaleList.find((s) => s.id === editId) ?? scaleList[0];

  if (!scale) return <p className="text-neutral-500">Keine Skala für diesen Kurs.</p>;

  const sorted = [...scale.thresholds].sort((a, b) => b.pct - a.pct);
  const unit = course.gradingMode === "points" ? "Punkte 0–15" : "Note";

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-neutral-500">
        Ab wie viel Prozent der Punkte gilt welche {unit === "Note" ? "Note" : "Punktestufe"}.
        Arbeiten können im Notenbaum eine eigene Skala bekommen.
      </p>
      {scaleList.length > 1 && (
        <select className="border rounded-lg px-3 py-2 min-h-11"
          value={scale.id} onChange={(e) => setEditId(e.target.value)}>
          {scaleList.map((s) => (
            <option key={s.id} value={s.id}>
              {overrideFor.has(s.id) ? `Überschreibung: ${overrideFor.get(s.id)}` : s.name}
            </option>
          ))}
        </select>
      )}
      <table className="w-full bg-white border rounded-xl border-collapse">
        <thead>
          <tr>
            <th className="border p-2 text-sm bg-neutral-100">ab … %</th>
            <th className="border p-2 text-sm bg-neutral-100">{unit}</th>
            <th className="border p-2 bg-neutral-100"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => (
            <ThresholdRow key={i} scale={scale} index={scale.thresholds.indexOf(t)} t={t} mode={course.gradingMode} />
          ))}
        </tbody>
      </table>
      <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
        e.preventDefault();
        const p = Number(pct.replace(",", "."));
        const g = Number(grade.replace(",", "."));
        if (!Number.isFinite(p) || p < 0 || p > 100 || !Number.isFinite(g)) return;
        await vault.put("scales", {
          ...scale,
          thresholds: [...scale.thresholds, { pct: p, grade: g }],
        });
        setPct(""); setGrade("");
      }}>
        <input className="border rounded-lg px-3 py-2 min-h-11 w-24" placeholder="%" inputMode="decimal"
          value={pct} onChange={(e) => setPct(e.target.value)} />
        <input className="border rounded-lg px-3 py-2 min-h-11 w-24" placeholder={unit} inputMode="decimal"
          value={grade} onChange={(e) => setGrade(e.target.value)} />
        <button className="min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium">
          Schwelle hinzufügen
        </button>
      </form>
    </div>
  );
}

function ThresholdRow({ scale, index, t, mode }: {
  scale: Scale; index: number; t: { pct: number; grade: number }; mode: Course["gradingMode"];
}) {
  const [pct, setPct] = useState(String(t.pct));
  const [grade, setGrade] = useState(String(t.grade));

  const commit = async (patch: Partial<{ pct: number; grade: number }>) => {
    const thresholds = scale.thresholds.map((x, i) => (i === index ? { ...x, ...patch } : x));
    await vault.put("scales", { ...scale, thresholds });
  };

  return (
    <tr>
      <td className="border p-1">
        <input className="w-full px-2 py-1.5 text-sm text-center" inputMode="decimal" value={pct}
          onChange={(e) => setPct(e.target.value)}
          onBlur={async () => {
            const p = Number(pct.replace(",", "."));
            if (Number.isFinite(p) && p !== t.pct) await commit({ pct: p });
            else setPct(String(t.pct));
          }} />
      </td>
      <td className="border p-1">
        <input className="w-full px-2 py-1.5 text-sm text-center" inputMode="decimal" value={grade}
          onChange={(e) => setGrade(e.target.value)}
          onBlur={async () => {
            const g = Number(grade.replace(",", "."));
            if (Number.isFinite(g) && g !== t.grade) await commit({ grade: g });
            else setGrade(String(t.grade));
          }} />
        {mode === "grades" && <span className="block text-center text-xs text-neutral-400">{formatGrade(t.grade)}</span>}
      </td>
      <td className="border p-1 text-center">
        <button className="text-xs text-red-600 px-2 py-1.5"
          onClick={async () => {
            await vault.put("scales", {
              ...scale, thresholds: scale.thresholds.filter((_, i) => i !== index),
            });
          }}>×</button>
      </td>
    </tr>
  );
}
