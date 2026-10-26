// V5: Klasse duplizieren + Schuljahresübergang.
// Trennung Struktur/Instanz (Spec): Notenbaum, Skalen, Checklisten und
// Sitzplan-Layout sind Struktur und werden kopiert; Noten, Vorfälle,
// Bemerkungen und Haken sind Instanzdaten und werden zurückgesetzt.

import { vault } from "./vault";
import type { Course } from "../domain/types";

export type DuplicateOptions = {
  name: string;
  studentIds: string[]; // welche Schüler übernommen werden (leer = keine)
};

export async function duplicateCourse(
  source: Course,
  opts: DuplicateOptions,
): Promise<Course> {
  const idMap = new Map<string, string>();

  // Skalen: Kurs-Standard + alle Overrides
  const scales = [...vault.scales.values()].filter(
    (s) => s.id === source.scaleId
      || [...vault.nodes.values()].some((n) => n.courseId === source.id && n.scaleId === s.id),
  );
  for (const s of scales) {
    const nid = crypto.randomUUID();
    idMap.set(s.id, nid);
    await vault.put("scales", { ...s, id: nid, updatedAt: 0, updatedBy: "" });
  }

  const course: Course = {
    id: crypto.randomUUID(), name: opts.name, gradingMode: source.gradingMode,
    scaleId: source.scaleId ? idMap.get(source.scaleId)! : null,
    updatedAt: 0, updatedBy: "",
  };
  await vault.put("courses", course);

  // Notenbaum: zweiphasig (erst IDs neu vergeben, dann Eltern remappen)
  const srcNodes = [...vault.nodes.values()].filter((n) => n.courseId === source.id);
  for (const n of srcNodes) idMap.set(n.id, crypto.randomUUID());
  for (const n of srcNodes) {
    await vault.put("nodes", {
      ...n, id: idMap.get(n.id)!, courseId: course.id,
      parentId: n.parentId ? idMap.get(n.parentId)! : null,
      scaleId: n.scaleId ? idMap.get(n.scaleId)! : null,
      updatedAt: 0, updatedBy: "",
    });
  }

  // Schüler (Instanzdaten wie Noten bleiben zurück)
  const studentMap = new Map<string, string>();
  for (const s of [...vault.students.values()].filter(
    (x) => x.courseId === source.id && opts.studentIds.includes(x.id),
  )) {
    const nid = crypto.randomUUID();
    studentMap.set(s.id, nid);
    await vault.put("students", {
      ...s, id: nid, courseId: course.id, updatedAt: 0, updatedBy: "",
    });
  }

  // Checklisten: Struktur kopieren, Haken zurücksetzen
  for (const cl of [...vault.checklists.values()].filter((c) => c.courseId === source.id)) {
    await vault.put("checklists", {
      ...cl, id: crypto.randomUUID(), courseId: course.id, ticked: [],
      updatedAt: 0, updatedBy: "",
    });
  }

  // Sitzplan: Layout übernehmen, Schüler-IDs remappen
  const plan = [...vault.seatplans.values()].find((p) => p.courseId === source.id);
  if (plan) {
    const positions: typeof plan.positions = {};
    for (const [sid, p] of Object.entries(plan.positions)) {
      const nid = studentMap.get(sid);
      if (nid) positions[nid] = p;
    }
    await vault.put("seatplans", {
      id: `seat-${course.id}`, courseId: course.id, positions,
      updatedAt: 0, updatedBy: "",
    });
  }

  return course;
}
