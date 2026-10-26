import { useState } from "react";
import { Link } from "react-router-dom";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import type { Course, GradingMode } from "../domain/types";
import { DEFAULT_SCALE_GRADES, DEFAULT_SCALE_POINTS } from "../domain/grade";
import { duplicateCourse } from "../data/duplicate";
import { BackupBanner } from "./BackupBanner";

export function CoursesPage() {
  useVault();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<GradingMode>("grades");
  const [query, setQuery] = useState("");
  const [dupFor, setDupFor] = useState<Course | null>(null);

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
                <button className="mt-1 text-xs text-blue-600 px-2 py-1"
                  onClick={(e) => { e.preventDefault(); setDupFor(c); }}>
                  Duplizieren / Schuljahr
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {dupFor && <DuplicateDialog course={dupFor} onClose={() => setDupFor(null)} />}
    </div>
  );
}

// V5: Klasse duplizieren / Schuljahresübergang — Struktur (Notenbaum, Skalen,
// Checklisten, Sitzplan) wird kopiert; Schüler an-/abwählbar; Noten und
// Erfassungsdaten werden zurückgesetzt.
function DuplicateDialog({ course, onClose }: { course: Course; onClose: () => void }) {
  const year = new Date().getFullYear();
  const [name, setName] = useState(`${course.name} ${year}/${String(year + 1).slice(2)}`);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const students = [...vault.students.values()]
    .filter((s) => s.courseId === course.id)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20"
      onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold">{course.name} übernehmen</h2>
        <p className="text-sm text-neutral-500">
          Notenbaum, Skalen, Checklisten und Sitzplan werden kopiert. Noten, Vorfälle
          und Haken werden zurückgesetzt. Schüler einzeln an-/abwählbar.
        </p>
        <input className="border rounded-lg px-3 py-2 min-h-11 w-full" value={name}
          onChange={(e) => setName(e.target.value)} placeholder="Name des neuen Kurses" />
        <div className="flex gap-2 text-sm">
          <button className="text-blue-600 underline" onClick={() => setSel(new Set(students.map((s) => s.id)))}>alle</button>
          <button className="text-blue-600 underline" onClick={() => setSel(new Set())}>keine</button>
        </div>
        <div className="max-h-56 overflow-auto border rounded-lg divide-y">
          {students.map((s) => (
            <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <input type="checkbox" checked={sel.has(s.id)}
                onChange={(e) => {
                  const x = new Set(sel);
                  e.target.checked ? x.add(s.id) : x.delete(s.id);
                  setSel(x);
                }} />
              {s.lastName}, {s.firstName}
            </label>
          ))}
          {students.length === 0 && <p className="p-3 text-sm text-neutral-400">Keine Schüler.</p>}
        </div>
        <div className="flex gap-2">
          <button className="min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm flex-1" disabled={busy}
            onClick={async () => {
              setBusy(true);
              await duplicateCourse(course, { name: name.trim() || `${course.name} (Kopie)`, studentIds: [...sel] });
              onClose();
            }}>
            Übernehmen ({sel.size} Schüler)
          </button>
          <button className="min-h-11 px-4 rounded-lg border text-sm" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
