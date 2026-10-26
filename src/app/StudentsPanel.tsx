import { useRef, useState } from "react";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import { parseCsv } from "../data/csv";
import type { Course, Student } from "../domain/types";

function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 200;
      const canvas = document.createElement("canvas");
      const scale = size / Math.max(img.width, img.height);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/webp", 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function StudentsPanel({ course }: { course: Course }) {
  useVault();
  const [last, setLast] = useState("");
  const [first, setFirst] = useState("");
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof parseCsv> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const students = [...vault.students.values()]
    .filter((s) => s.courseId === course.id)
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  const addStudent = async (data: { lastName: string; firstName: string; note?: string }) => {
    const s: Student = {
      id: crypto.randomUUID(), courseId: course.id,
      lastName: data.lastName, firstName: data.firstName, note: data.note ?? "",
      photo: null, updatedAt: 0, updatedBy: "",
    };
    await vault.put("students", s);
  };

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!last.trim() || !first.trim()) return;
          await addStudent({ lastName: last.trim(), firstName: first.trim() });
          setLast(""); setFirst("");
        }}
      >
        <input className="border rounded-lg px-3 py-2.5 min-h-11" placeholder="Nachname"
          value={last} onChange={(e) => setLast(e.target.value)} />
        <input className="border rounded-lg px-3 py-2.5 min-h-11" placeholder="Vorname"
          value={first} onChange={(e) => setFirst(e.target.value)} />
        <button className="min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium">
          Hinzufügen
        </button>
        <label className="min-h-11 px-4 rounded-lg border text-sm flex items-center cursor-pointer">
          CSV importieren
          <input type="file" accept=".csv,text/csv" hidden ref={fileRef}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setCsvPreview(parseCsv(await f.text()));
              e.target.value = "";
            }} />
        </label>
      </form>

      {csvPreview && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <h3 className="font-medium">Import-Vorschau ({csvPreview.rows.length} Schüler)</h3>
          {csvPreview.errors.length > 0 && (
            <div className="text-sm text-red-600">
              {csvPreview.errors.length} Zeile(n) ungültig:{" "}
              {csvPreview.errors.map((e) => `Z.${e.line}`).join(", ")}
            </div>
          )}
          <ul className="text-sm max-h-48 overflow-auto">
            {csvPreview.rows.slice(0, 20).map((r, i) => (
              <li key={i}>{r.lastName}, {r.firstName}{r.note ? ` — ${r.note}` : ""}</li>
            ))}
            {csvPreview.rows.length > 20 && <li>… und {csvPreview.rows.length - 20} weitere</li>}
          </ul>
          <div className="flex gap-2">
            <button
              className="min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium"
              onClick={async () => {
                for (const r of csvPreview.rows) await addStudent(r);
                setCsvPreview(null);
              }}
            >
              {csvPreview.rows.length} importieren
            </button>
            <button className="min-h-11 px-4 rounded-lg border text-sm"
              onClick={() => setCsvPreview(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {students.length === 0 ? (
        <p className="text-neutral-500">Noch keine Schüler in diesem Kurs.</p>
      ) : (
        <ul className="bg-white border rounded-xl divide-y">
          {students.map((s) => (
            <StudentRow key={s.id} student={s} onPhoto={async (file) => {
              const photo = await compressPhoto(file);
              await vault.put("students", { ...s, photo });
            }} />
          ))}
        </ul>
      )}
    </div>
  );
}

function StudentRow({ student: s, onPhoto }: { student: Student; onPhoto: (f: File) => void }) {
  const [note, setNote] = useState(s.note);
  const [editing, setEditing] = useState(false);
  const [last, setLast] = useState(s.lastName);
  const [first, setFirst] = useState(s.firstName);

  return (
    <li className="p-3 flex items-center gap-3">
      <label className="w-11 h-11 rounded-full bg-neutral-200 overflow-hidden cursor-pointer flex items-center justify-center text-xs text-neutral-500 shrink-0">
        {s.photo ? <img src={s.photo} alt="" className="w-full h-full object-cover" /> : "Foto"}
        <input type="file" accept="image/*" hidden
          onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
      </label>
      {editing ? (
        <div className="flex flex-wrap gap-2 flex-1">
          <input className="border rounded px-2 py-1.5 w-28" value={last} onChange={(e) => setLast(e.target.value)} />
          <input className="border rounded px-2 py-1.5 w-28" value={first} onChange={(e) => setFirst(e.target.value)} />
          <button className="min-h-11 px-3 rounded-lg bg-blue-600 text-white text-sm"
            onClick={async () => {
              await vault.put("students", { ...s, lastName: last, firstName: first });
              setEditing(false);
            }}>OK</button>
          <button className="min-h-11 px-3 rounded-lg border text-sm"
            onClick={async () => {
              await vault.remove("students", s.id);
              for (const [id, e] of vault.entries) {
                if (e.studentId === s.id) await vault.remove("entries", id);
              }
            }}>Löschen</button>
        </div>
      ) : (
        <button className="text-left flex-1 min-h-11" onClick={() => setEditing(true)}>
          <span className="font-medium">{s.lastName}, {s.firstName}</span>
        </button>
      )}
      <input
        className="border rounded px-2 py-1.5 text-sm w-40"
        placeholder="Bemerkung"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={async () => {
          if (note !== s.note) await vault.put("students", { ...s, note });
        }}
      />
    </li>
  );
}
