import { useState } from "react";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import type { Course, TreeNode } from "../domain/types";

// Grade tree editor: categories can nest arbitrarily; leaves are assessments
// (optionally with maxPoints -> percent scale conversion).

function childrenOf(courseId: string, parentId: string | null): TreeNode[] {
  return [...vault.nodes.values()]
    .filter((n) => n.courseId === courseId && n.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function TreePanel({ course }: { course: Course }) {
  useVault();
  const roots = childrenOf(course.id, null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">
        Kategorien sind frei verschachtelbar und gewichtet. Blätter sind Arbeiten/Leistungsnachweise;
        bei Punktemaximum wird der Prozentwert über die Skala in eine Note umgerechnet.
      </p>
      <AddNode course={course} parentId={null} />
      <ul className="space-y-2">
        {roots.map((n) => (
          <NodeRow key={n.id} node={n} course={course} />
        ))}
      </ul>
    </div>
  );
}

function AddNode({ course, parentId }: { course: Course; parentId: string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TreeNode["kind"]>("category");
  const [weight, setWeight] = useState("1");
  const [maxPoints, setMaxPoints] = useState("");

  if (!open) {
    return (
      <button className="min-h-11 px-3 rounded-lg border text-sm" onClick={() => setOpen(true)}>
        + {parentId ? "Untereintrag" : "Kategorie/Arbeit"}
      </button>
    );
  }
  return (
    <form className="flex flex-wrap gap-2 items-center"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await vault.put("nodes", {
          id: crypto.randomUUID(), courseId: course.id, parentId,
          name: name.trim(), kind, weight: Number(weight.replace(",", ".")) || 1,
          date: null,
          maxPoints: kind === "assessment" && maxPoints ? Number(maxPoints) : null,
          scaleId: null, updatedAt: 0, updatedBy: "",
        });
        setName(""); setOpen(false);
      }}>
      <input autoFocus className="border rounded-lg px-3 py-2 min-h-11 w-48" placeholder="Name"
        value={name} onChange={(e) => setName(e.target.value)} />
      <select className="border rounded-lg px-2 py-2 min-h-11" value={kind}
        onChange={(e) => setKind(e.target.value as TreeNode["kind"])}>
        <option value="category">Kategorie</option>
        <option value="assessment">Arbeit</option>
      </select>
      <input className="border rounded-lg px-2 py-2 min-h-11 w-20" placeholder="Gewicht"
        inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
      {kind === "assessment" && (
        <input className="border rounded-lg px-2 py-2 min-h-11 w-28" placeholder="Max. Punkte"
          inputMode="decimal" value={maxPoints} onChange={(e) => setMaxPoints(e.target.value)} />
      )}
      <button className="min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm">OK</button>
      <button type="button" className="min-h-11 px-3 rounded-lg border text-sm"
        onClick={() => setOpen(false)}>×</button>
    </form>
  );
}

function NodeRow({ node, course }: { node: TreeNode; course: Course }) {
  const [weight, setWeight] = useState(String(node.weight));
  const kids = childrenOf(course.id, node.id);
  return (
    <li className="bg-white border rounded-xl p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{node.name}</span>
        <span className="text-xs text-neutral-400">
          {node.kind === "category" ? "Kategorie" : `Arbeit${node.maxPoints ? ` · max ${node.maxPoints} P.` : ""}`}
        </span>
        <label className="text-xs text-neutral-500 flex items-center gap-1 ml-auto">
          Gewicht
          <input className="border rounded px-2 py-1 w-16 text-sm" inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={async () => {
              const w = Number(weight.replace(",", "."));
              if (Number.isFinite(w) && w !== node.weight)
                await vault.put("nodes", { ...node, weight: w });
            }} />
        </label>
        {node.kind === "assessment" && (
          <button className="text-xs text-blue-600 px-2 py-1"
            onClick={async () => {
              if (node.scaleId) {
                await vault.put("nodes", { ...node, scaleId: null });
              } else if (course.scaleId) {
                const base = vault.scales.get(course.scaleId);
                if (!base) return;
                const copy = await vault.put("scales", {
                  ...base, id: crypto.randomUUID(), name: `Skala ${node.name}`,
                  thresholds: base.thresholds.map((t) => ({ ...t })),
                  updatedAt: 0, updatedBy: "",
                });
                await vault.put("nodes", { ...node, scaleId: copy.id });
              }
            }}>
            {node.scaleId ? "Kursskala nutzen" : "Eigene Skala"}
          </button>
        )}
        <button className="text-xs text-red-600 px-2 py-1"
          onClick={async () => {
            if (!confirm(`„${node.name}" inkl. aller Untereinträge und Noten löschen?`)) return;
            await deleteSubtree(node.id);
          }}>Löschen</button>
      </div>
      {kids.length > 0 && (
        <ul className="space-y-2">
          {kids.map((k) => <NodeRow key={k.id} node={k} course={course} />)}
        </ul>
      )}
      {node.kind === "category" && <AddNode course={course} parentId={node.id} />}
    </li>
  );
}

async function deleteSubtree(id: string) {
  for (const n of [...vault.nodes.values()]) {
    if (n.parentId === id) await deleteSubtree(n.id);
  }
  for (const [eid, e] of vault.entries) {
    if (e.nodeId === id) await vault.remove("entries", eid);
  }
  await vault.remove("nodes", id);
}
