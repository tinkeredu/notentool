import { vault } from "../data/vault";
import { useVault } from "./useVault";
import { exportBackup, downloadBlob } from "../data/exchange";

export function BackupBanner() {
  useVault();
  if (!vault.backupOverdue()) return null;
  const never = !vault.meta?.lastBackupAt;
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-wrap items-center gap-3">
      <p className="text-sm flex-1 min-w-56">
        {never
          ? "Noch kein Backup erstellt. Deine Daten liegen nur auf diesem Gerät."
          : "Das letzte Backup ist überfällig."}
      </p>
      <button
        className="min-h-11 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium"
        onClick={async () => {
          const blob = await exportBackup();
          downloadBlob(blob, `tinkeredu-backup-${new Date().toISOString().slice(0, 10)}.json`);
        }}
      >
        Jetzt verschlüsseltes Backup erstellen
      </button>
    </div>
  );
}
