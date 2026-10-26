import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useVault } from "./useVault";
import { PinGate } from "./PinGate";
import { CoursesPage } from "./CoursesPage";
import { CoursePage } from "./CoursePage";
import { SettingsPage } from "./SettingsPage";
import { BesprechungPage } from "./BesprechungPage";
import { vault } from "../data/vault";
import { saveMeta } from "../data/db";

export default function App() {
  useVault();
  useEffect(() => {
    document.documentElement.classList.toggle("dark", vault.meta?.theme === "dark");
  }, [vault.meta?.theme]);
  if (!vault.isUnlocked) return <PinGate />;

  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}

function Shell() {
  const { pathname } = useLocation();
  const chromeless = pathname.includes("/besprechung/");
  return (
    <div className="min-h-dvh flex flex-col">
      {!chromeless && (
        <nav className="bg-white dark:bg-neutral-800 border-b px-4 py-2 flex items-center gap-4 sticky top-0 z-10 print:hidden">
          <Link to="/" className="font-semibold">tinkeredu</Link>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="text-sm px-3 py-2 rounded-lg border"
              title="Dark Mode umschalten"
              onClick={async () => {
                vault.meta!.theme = vault.meta?.theme === "dark" ? "light" : "dark";
                document.documentElement.classList.toggle("dark", vault.meta!.theme === "dark");
                await saveMeta(vault.meta!);
              }}
            >
              {vault.meta?.theme === "dark" ? "☀" : "☾"}
            </button>
            <Link to="/settings" className="text-sm text-neutral-600 px-3 py-2">Einstellungen</Link>
            <button
              className="text-sm px-3 py-2 rounded-lg border"
              onClick={() => vault.lock()}
            >
              Sperren
            </button>
          </div>
        </nav>
      )}
      <main className={chromeless ? "flex-1" : "flex-1 p-4 max-w-6xl w-full mx-auto"}>
        <Routes>
          <Route path="/" element={<CoursesPage />} />
          <Route path="/course/:courseId/besprechung/:studentId" element={<BesprechungPage />} />
          <Route path="/course/:courseId/*" element={<CoursePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
