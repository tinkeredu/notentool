import { useState } from "react";
import { Link } from "react-router-dom";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import type { Course, GradingMode } from "../domain/types";
import { DEFAULT_SCALE_GRADES, DEFAULT_SCALE_POINTS } from "../domain/grade";
import { BackupBanner } from "./BackupBanner";

export function CoursesPage() {
  useVault();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<GradingMode>("grades");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const courses = [...vault.courses.values()].sort((a, b) => a.name.localeCompare(b.name));
  const filtered = q
    ? courses.filter((c) => {
        if (c.name.toLowerCase().includes(q)) return true;
        return [...vault.students.values()].some(
          (s) => s.courseId === c.id && `${s.firstName} ${s.lastName}`.toLowerCase().includes(q),
        );
      })
    : courses;

  const addCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const scale = await vault.put("scales", {
      id: crypto.randomUUID(), name: "Standardskala",
      mode, thresholds: mode === "grades" ? DEFAULT_SCALE_GRADES : DEFAULT_SCALE_POINTS,
      updatedAt: 0, updatedBy: "",
    });
    const course: Course = {
      id: crypto.randomUUID(), name: name.trim(), gradingMode: mode,
      scaleId: scale.id, updatedAt: 0, updatedBy: "",
    };
    await vault.put("courses", course);
    setName("");
  };

  return (
    <div className="space-y-6">
      <BackupBanner />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Kurse</h1>
        <input
          className="border rounded-lg px-3 py-2 min-h-11 w-56"
          placeholder="Suche (Kurs oder Schüler)…"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <form onSubmit={addCourse} className="flex flex-wrap gap-2">
        <input
          className="border rounded-lg px-3 py-2.5 min-h-11 flex-1 min-w-48"
          placeholder="Neuer Kurs (z. B. 7a Mathe)"
          value={name} onChange={(e) => setName(e.target.value)}
        />
        <select
          className="border rounded-lg px-3 py-2.5 min-h-11"
          value={mode} onChange={(e) => setMode(e.target.value as GradingMode)}
        >
          <option value="grades">Noten 1–6</option>
          <option value="points">Punkte 0–15 (Oberstufe)</option>
        </select>
        <button className="min-h-11 px-5 rounded-lg bg-blue-600 text-white font-medium">
          Anlegen
        </button>
      </form>
      {courses.length === 0 ? (
        <p className="text-neutral-500">Noch keine Kurse. Lege oben deinen ersten Kurs an.</p>
      ) : filtered.length === 0 ? (
        <p className="text-neutral-500">Keine Treffer für „{query}".</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((c) => {
            const count = [...vault.students.values()].filter((s) => s.courseId === c.id).length;
            return (
              <li key={c.id}>
                <Link
                  to={`/course/${c.id}`}
                  className="block bg-white border rounded-xl p-4 hover:border-blue-300"
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="text-sm text-neutral-500">
                    {count} Schüler · {c.gradingMode === "points" ? "Punkte 0–15" : "Noten 1–6"}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
