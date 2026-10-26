import { NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
import { useVault } from "./useVault";
import { vault } from "../data/vault";
import { BackupBanner } from "./BackupBanner";
import { StudentsPanel } from "./StudentsPanel";
import { TreePanel } from "./TreePanel";
import { GridPanel } from "./GridPanel";
import { EvalPanel } from "./EvalPanel";
import { ScalePanel } from "./ScalePanel";
import { ExportPanel } from "./ExportPanel";
import { PrintPanel } from "./PrintPanel";
import { AnalysisPanel } from "./AnalysisPanel";

const TABS = [
  { to: "raster", label: "Erfassung" },
  { to: "schueler", label: "Schüler" },
  { to: "baum", label: "Notenbaum" },
  { to: "skala", label: "Skala" },
  { to: "auswertung", label: "Auswertung" },
  { to: "analyse", label: "Analyse" },
  { to: "export", label: "Export" },
  { to: "druck", label: "Druck" },
];

export function CoursePage() {
  useVault();
  const { courseId } = useParams();
  const course = courseId ? vault.courses.get(courseId) : undefined;
  if (!course) return <Navigate to="/" />;

  return (
    <div className="space-y-4">
      <BackupBanner />
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">{course.name}</h1>
        <span className="text-sm text-neutral-500">
          {course.gradingMode === "points" ? "Punkte 0–15" : "Noten 1–6"}
        </span>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <NavLink
            key={t.to} to={`/course/${course.id}/${t.to}`} end={t.to === "raster"}
            className={({ isActive }) =>
              `px-4 py-2.5 min-h-11 text-sm rounded-t-lg ${
                isActive ? "bg-white border border-b-0 font-medium" : "text-neutral-500"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Routes>
        <Route index element={<Navigate to="raster" replace />} />
        <Route path="raster" element={<GridPanel course={course} />} />
        <Route path="schueler" element={<StudentsPanel course={course} />} />
        <Route path="baum" element={<TreePanel course={course} />} />
        <Route path="skala" element={<ScalePanel course={course} />} />
        <Route path="auswertung" element={<EvalPanel course={course} />} />
        <Route path="analyse" element={<AnalysisPanel course={course} />} />
        <Route path="export" element={<ExportPanel course={course} />} />
        <Route path="druck" element={<PrintPanel course={course} />} />
      </Routes>
    </div>
  );
}
