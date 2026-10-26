import { HashRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { useVault } from "./useVault";
import { PinGate } from "./PinGate";
import { CoursesPage } from "./CoursesPage";
import { CoursePage } from "./CoursePage";
import { SettingsPage } from "./SettingsPage";
import { vault } from "../data/vault";

export default function App() {
  useVault();
  if (!vault.isUnlocked) return <PinGate />;

  return (
    <HashRouter>
      <div className="min-h-dvh flex flex-col">
        <nav className="bg-white border-b px-4 py-2 flex items-center gap-4 sticky top-0 z-10">
          <Link to="/" className="font-semibold">tinkeredu</Link>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/settings" className="text-sm text-neutral-600 px-3 py-2">Einstellungen</Link>
            <button
              className="text-sm px-3 py-2 rounded-lg border"
              onClick={() => vault.lock()}
            >
              Sperren
            </button>
          </div>
        </nav>
        <main className="flex-1 p-4 max-w-6xl w-full mx-auto">
          <Routes>
            <Route path="/" element={<CoursesPage />} />
            <Route path="/course/:courseId/*" element={<CoursePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
