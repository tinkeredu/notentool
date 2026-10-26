import { useMemo, useRef, useState } from "react";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import { formatGrade, parseGrade } from "../domain/grade";
import type { Course, Student, TreeNode } from "../domain/types";

// V4 Unterrichts-Alltag: Checklisten, vergessene Hausaufgaben/Material,
// Sitzplan mit Schnellerfassung, Zufallsauswahl, Bemerkungen.

const today = () => new Date().toISOString().slice(0, 10);

function sortStudents(courseId: string): Student[] {
  return [...vault.students.values()]
    .filter((s) => s.courseId === courseId)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

// Schnellerfassung: Arbeit + Note für einen Schüler.
function QuickGrade({ course, student, onDone }: {
  course: Course; student: Student; onDone: () => void;
}) {
  const assessments = [...vault.nodes.values()]
    .filter((n) => n.courseId === course.id && n.kind === "assessment");
  const [nodeId, setNodeId] = useState(assessments[0]?.id ?? "");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const node = assessments.find((n) => n.id === nodeId);

  const save = async () => {
    if (!node) { setErr("Keine Arbeit gewählt."); return; }
    const t = text.trim();
    if (!t) return;
    let value: number | null = null;
    let points: number | null = null;
    if (course.gradingMode === "points") {
      points = Number(t.replace(",", "."));
      if (!Number.isFinite(points) || points < 0 || points > 15) { setErr("0–15 P."); return; }
    } else {
      value = parseGrade(t);
      if (value === null) { setErr("Note nicht lesbar."); return; }
    }
    const existing = [...vault.entries.values()].find(
      (e) => e.studentId === student.id && e.nodeId === node.id,
    );
    await vault.put("entries", {
      id: existing?.id ?? `${course.id}:${student.id}:${node.id}`,
      courseId: course.id, studentId: student.id, nodeId: node.id,
      status: "graded", value, points, comment: existing?.comment ?? "",
      updatedAt: 0, updatedBy: "",
    });
    onDone();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
      <select className="border rounded px-2 py-1.5 text-sm" value={nodeId}
        onChange={(e) => setNodeId(e.target.value)}>
        {assessments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <input className="border rounded px-2 py-1.5 w-20 text-sm" autoFocus
        placeholder={course.gradingMode === "points" ? "0–15" : "Note"}
        value={text} onChange={(e) => { setText(e.target.value); setErr(""); }}
        onKeyDown={(e) => e.key === "Enter" && save()} />
      <button className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm" onClick={save}>Speichern</button>
      <button className="px-2 py-1.5 text-sm text-neutral-500" onClick={onDone}>×</button>
      {err && <span className="text-xs text-red-600">{err}</span>}
      {node && <span className="text-xs text-neutral-400">für {student.firstName} {student.lastName}</span>}
    </div>
  );
}

export function EverydayPanel({ course }: { course: Course }) {
  useVault();
  const students = useMemo(() => sortStudents(course.id), [course.id, vault.students]);
  const nodes = useMemo(
    () => [...vault.nodes.values()].filter((n) => n.courseId === course.id),
    [course.id, vault.nodes],
  );

  // ---------- Checklisten ----------
  const [listName, setListName] = useState("");
  const checklists = useMemo(
    () => [...vault.checklists.values()].filter((c) => c.courseId === course.id),
    [course.id, vault.checklists],
  );

  // ---------- Vergessene HA / Material ----------
  const [incDate, setIncDate] = useState(today());
  const incidents = useMemo(
    () => [...vault.incidents.values()].filter((i) => i.courseId === course.id),
    [course.id, vault.incidents],
  );
  const countFor = (sid: string) => incidents.filter((i) => i.studentId === sid).length;
  const [histStudent, setHistStudent] = useState<string | null>(null);

  const addIncident = async (sid: string, kind: "homework" | "material") => {
    await vault.put("incidents", {
      id: crypto.randomUUID(), courseId: course.id, studentId: sid,
      date: incDate, kind, note: "", updatedAt: 0, updatedBy: "",
    });
  };

  // ---------- Sitzplan ----------
  const seatplan = useMemo(
    () => [...vault.seatplans.values()].find((p) => p.courseId === course.id) ?? null,
    [course.id, vault.seatplans],
  );
  const areaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ sid: string; moved: boolean } | null>(null);
  const [gradeFor, setGradeFor] = useState<string | null>(null);
  const [editSeats, setEditSeats] = useState(false);

  const pos = (sid: string) => seatplan?.positions[sid] ?? null;
  const placed = students.filter((s) => pos(s.id));
  const unplaced = students.filter((s) => !pos(s.id));

  const savePlan = async (positions: Record<string, { x: number; y: number }>) => {
    await vault.put("seatplans", {
      id: seatplan?.id ?? `seat-${course.id}`, courseId: course.id,
      positions, updatedAt: 0, updatedBy: "",
    });
  };
  const moveTo = (sid: string, clientX: number, clientY: number) => {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(96, Math.max(0, ((clientX - r.left) / r.width) * 100));
    const y = Math.min(92, Math.max(0, ((clientY - r.top) / r.height) * 100));
    void savePlan({ ...(seatplan?.positions ?? {}), [sid]: { x, y } });
  };

  // ---------- Zufall ----------
  const [drawn, setDrawn] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const draw = () => {
    const pool = students.filter((s) => !drawn.includes(s.id));
    const pick = (pool.length ? pool : students)[Math.floor(Math.random() * (pool.length || students.length))];
    if (!pick) return;
    setCurrent(pick.id);
    setDrawn((d) => [...d, pick.id]);
  };

  // ---------- Bemerkungen ----------
  const [noteStudent, setNoteStudent] = useState("");
  const [noteCat, setNoteCat] = useState("Verhalten");
  const [noteText, setNoteText] = useState("");
  const notes = useMemo(
    () => [...vault.notes.values()]
      .filter((n) => n.courseId === course.id)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [course.id, vault.notes],
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-medium mb-2">Checklisten</h2>
        <form className="flex gap-2 mb-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!listName.trim()) return;
          await vault.put("checklists", {
            id: crypto.randomUUID(), courseId: course.id, name: listName.trim(),
            ticked: [], updatedAt: 0, updatedBy: "",
          });
          setListName("");
        }}>
          <input className="border rounded-lg px-3 py-2 min-h-11 flex-1 max-w-sm"
            placeholder="Neue Liste (z. B. Klassenkasse 5 €)" value={listName}
            onChange={(e) => setListName(e.target.value)} />
          <button className="min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm">Anlegen</button>
        </form>
        {checklists.map((cl) => (
          <div key={cl.id} className="bg-white border rounded-xl p-3 mb-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="font-medium">{cl.name}</span>
              <span className="text-sm text-neutral-500">{cl.ticked.length}/{students.length}</span>
              <span className="h-2 flex-1 bg-neutral-100 rounded overflow-hidden">
                <span className="block h-full bg-green-500"
                  style={{ width: `${students.length ? (cl.ticked.length / students.length) * 100 : 0}%` }} />
              </span>
              <button className="text-xs text-red-600 px-2 py-1"
                onClick={async () => { if (confirm(`Liste „${cl.name}" löschen?`)) await vault.remove("checklists", cl.id); }}>
                Löschen
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {students.map((s) => {
                const on = cl.ticked.includes(s.id);
                return (
                  <button key={s.id}
                    className={`min-h-11 px-3 rounded-lg border text-sm ${on ? "bg-green-100 border-green-300" : ""}`}
                    onClick={async () => {
                      const ticked = on ? cl.ticked.filter((x) => x !== s.id) : [...cl.ticked, s.id];
                      await vault.put("checklists", { ...cl, ticked });
                    }}>
                    {on ? "✓ " : ""}{s.lastName}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="font-medium mb-2">Vergessene Hausaufgaben / Material</h2>
        <label className="flex items-center gap-2 text-sm mb-3">
          Datum
          <input type="date" className="border rounded-lg px-3 py-2 min-h-11" value={incDate}
            onChange={(e) => setIncDate(e.target.value)} />
        </label>
        <div className="bg-white border rounded-xl divide-y">
          {students.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-3 py-2">
              <button className="flex-1 text-left text-sm"
                onClick={() => setHistStudent(histStudent === s.id ? null : s.id)}>
                {s.lastName}, {s.firstName}
              </button>
              <span className="text-xs text-neutral-400 w-8 text-center">{countFor(s.id) || ""}</span>
              <button className="min-h-11 px-3 rounded-lg border text-xs"
                onClick={() => addIncident(s.id, "homework")}>+ HA</button>
              <button className="min-h-11 px-3 rounded-lg border text-xs"
                onClick={() => addIncident(s.id, "material")}>+ Material</button>
            </div>
          ))}
        </div>
        {histStudent && (
          <div className="bg-white border rounded-xl p-3 mt-3">
            <h3 className="text-sm font-medium mb-2">
              Historie — {vault.students.get(histStudent)?.firstName} {vault.students.get(histStudent)?.lastName}
            </h3>
            <ul className="space-y-1">
              {incidents.filter((i) => i.studentId === histStudent)
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((i) => (
                  <li key={i.id} className="flex items-center gap-3 text-sm">
                    <span className="text-neutral-500">{i.date}</span>
                    <span>{i.kind === "homework" ? "Hausaufgabe" : "Material"}</span>
                    <button className="text-xs text-red-600 ml-auto"
                      onClick={async () => await vault.remove("incidents", i.id)}>entfernen</button>
                  </li>
                ))}
              {incidents.filter((i) => i.studentId === histStudent).length === 0 && (
                <li className="text-sm text-neutral-400">Keine Einträge.</li>
              )}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-2">Sitzplan</h2>
        <button className="min-h-11 px-4 rounded-lg border text-sm mb-2"
          onClick={() => setEditSeats((v) => !v)}>
          {editSeats ? "Fertig — Erfassung aktiv" : "Plätze anordnen"}
        </button>
        {unplaced.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {unplaced.map((s) => (
              <button key={s.id} className="min-h-11 px-3 rounded-lg border text-sm bg-white"
                onClick={() => {
                  const n = placed.length;
                  void savePlan({
                    ...(seatplan?.positions ?? {}),
                    [s.id]: { x: 5 + (n % 6) * 16, y: 5 + Math.floor(n / 6) * 20 },
                  });
                }}>
                + {s.lastName}
              </button>
            ))}
          </div>
        )}
        <div ref={areaRef}
          className="relative bg-neutral-50 border-2 border-dashed rounded-xl h-[420px] touch-none select-none"
          onPointerMove={(e) => {
            if (editSeats && dragRef.current) {
              dragRef.current.moved = true;
              moveTo(dragRef.current.sid, e.clientX, e.clientY);
            }
          }}
          onPointerUp={() => { dragRef.current = null; }}>
          {placed.map((s) => {
            const p = pos(s.id)!;
            return (
              <div key={s.id}
                className="absolute flex flex-col items-center cursor-grab"
                style={{ left: `${p.x}%`, top: `${p.y}%`, touchAction: "none" }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  dragRef.current = { sid: s.id, moved: false };
                }}
                onPointerUp={() => {
                  if (!editSeats && !dragRef.current?.moved) setGradeFor(s.id);
                  dragRef.current = null;
                }}>
                {s.photo ? (
                  <img src={s.photo} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-white shadow pointer-events-none" />
                ) : (
                  <span className="w-14 h-14 rounded-full bg-blue-100 border-2 border-white shadow flex items-center justify-center text-sm font-medium pointer-events-none">
                    {s.firstName[0]}{s.lastName[0]}
                  </span>
                )}
                <span className="text-xs mt-0.5 bg-white/80 rounded px-1 pointer-events-none">{s.firstName}</span>
              </div>
            );
          })}
          <span className="absolute bottom-1 left-2 text-xs text-neutral-400">Tafel ↓ vorne</span>
        </div>
        {gradeFor && (
          <div className="mt-2">
            <QuickGrade course={course} student={vault.students.get(gradeFor)!}
              onDone={() => setGradeFor(null)} />
          </div>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-2">Zufallsauswahl</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button className="min-h-11 px-5 rounded-lg bg-blue-600 text-white font-medium" onClick={draw}>
            Ziehen ({drawn.length}/{students.length})
          </button>
          <button className="min-h-11 px-4 rounded-lg border text-sm" onClick={() => { setDrawn([]); setCurrent(null); }}>
            Zurücksetzen
          </button>
          {current && vault.students.get(current) && (
            <div className="flex items-center gap-3 bg-white border rounded-xl p-3">
              {vault.students.get(current)!.photo ? (
                <img src={vault.students.get(current)!.photo!} alt=""
                  className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <span className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-xl font-medium">
                  {vault.students.get(current)!.firstName[0]}{vault.students.get(current)!.lastName[0]}
                </span>
              )}
              <span className="text-2xl font-semibold">
                {vault.students.get(current)!.firstName} {vault.students.get(current)!.lastName}
              </span>
              <QuickGrade course={course} student={vault.students.get(current)!} onDone={() => {}} />
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-medium mb-2">Bemerkungen</h2>
        <form className="flex flex-wrap gap-2 mb-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!noteStudent || !noteText.trim()) return;
          await vault.put("notes", {
            id: crypto.randomUUID(), courseId: course.id, studentId: noteStudent,
            date: today(), category: noteCat, text: noteText.trim(),
            updatedAt: 0, updatedBy: "",
          });
          setNoteText("");
        }}>
          <select className="border rounded-lg px-3 py-2 min-h-11" value={noteStudent}
            onChange={(e) => setNoteStudent(e.target.value)}>
            <option value="">Schüler wählen…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>)}
          </select>
          <select className="border rounded-lg px-3 py-2 min-h-11" value={noteCat}
            onChange={(e) => setNoteCat(e.target.value)}>
            {["Verhalten", "Elternkontakt", "Soziales", "Sonstiges"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="border rounded-lg px-3 py-2 min-h-11 flex-1 min-w-48"
            placeholder="Bemerkung…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          <button className="min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm">Speichern</button>
        </form>
        <div className="bg-white border rounded-xl divide-y">
          {notes.map((n) => {
            const s = vault.students.get(n.studentId);
            return (
              <div key={n.id} className="px-3 py-2 flex items-baseline gap-3 text-sm">
                <span className="text-neutral-400 shrink-0">{n.date}</span>
                <span className="font-medium shrink-0">{s ? `${s.firstName} ${s.lastName}` : "?"}</span>
                <span className="text-xs bg-neutral-100 rounded px-1.5 py-0.5 shrink-0">{n.category}</span>
                <span className="flex-1">{n.text}</span>
                <button className="text-xs text-red-600 shrink-0"
                  onClick={async () => await vault.remove("notes", n.id)}>×</button>
              </div>
            );
          })}
          {notes.length === 0 && <p className="p-3 text-sm text-neutral-400">Noch keine Bemerkungen.</p>}
        </div>
      </section>
    </div>
  );
}
