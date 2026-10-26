import { useRef, useState } from "react";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import { exportBackup, importBackup, downloadBlob, requestPersistentStorage } from "../data/exchange";

export function SettingsPage() {
  useVault();
  const [msg, setMsg] = useState("");
  const [importPin, setImportPin] = useState("");
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pinOld, setPinOld] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [reminderDays, setReminderDays] = useState(String(vault.meta?.backupReminderDays ?? 7));

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-semibold">Einstellungen</h1>
      {msg && <p className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3">{msg}</p>}

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-medium">Backup</h2>
        <p className="text-sm text-neutral-500">
          Letztes Backup: {vault.meta?.lastBackupAt
            ? new Date(vault.meta.lastBackupAt).toLocaleString("de-DE")
            : "nie"}
        </p>
        <label className="text-sm flex items-center gap-2">
          Backup-Erinnerung alle
          <input className="border rounded px-2 py-1 w-16" inputMode="numeric"
            value={reminderDays}
            onChange={(e) => setReminderDays(e.target.value)}
            onBlur={async () => {
              const d = Math.max(1, Number(reminderDays) || 7);
              vault.meta!.backupReminderDays = d;
              const { saveMeta } = await import("../data/db");
              await saveMeta(vault.meta!);
              setReminderDays(String(d));
            }} />
          Tage
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium"
            onClick={async () => {
              const blob = await exportBackup();
              downloadBlob(blob, `tinkeredu-backup-${new Date().toISOString().slice(0, 10)}.json`);
              setMsg("Verschlüsseltes Backup heruntergeladen.");
            }}>
            Verschlüsseltes Backup herunterladen
          </button>
          <button className="min-h-11 px-4 rounded-lg border text-sm"
            onClick={() => fileRef.current?.click()}>
            Backup wiederherstellen
          </button>
          <input type="file" accept=".json" hidden ref={fileRef}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setPendingFile(await f.text());
              e.target.value = "";
            }} />
        </div>
        {pendingFile && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-sm text-red-600">
              Achtung: Der Import ersetzt <strong>alle</strong> aktuellen Daten. PIN des Backups eingeben:
            </p>
            <div className="flex gap-2">
              <input type="password" className="border rounded-lg px-3 py-2 min-h-11"
                placeholder="Backup-PIN" value={importPin} onChange={(e) => setImportPin(e.target.value)} />
              <button className="min-h-11 px-4 rounded-lg bg-red-600 text-white text-sm"
                onClick={async () => {
                  const res = await importBackup(pendingFile, importPin);
                  setPendingFile(null); setImportPin("");
                  if (res.ok) {
                    setMsg("Backup wiederhergestellt.");
                    window.location.reload();
                  } else setMsg(res.reason ?? "Import fehlgeschlagen.");
                }}>Ersetzen</button>
              <button className="min-h-11 px-3 rounded-lg border text-sm"
                onClick={() => { setPendingFile(null); setImportPin(""); }}>Abbrechen</button>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-medium">PIN ändern</h2>
        <div className="flex flex-wrap gap-2">
          <input type="password" className="border rounded-lg px-3 py-2 min-h-11"
            placeholder="Aktuelle PIN" value={pinOld} onChange={(e) => setPinOld(e.target.value)} />
          <input type="password" className="border rounded-lg px-3 py-2 min-h-11"
            placeholder="Neue PIN" value={pinNew} onChange={(e) => setPinNew(e.target.value)} />
          <button className="min-h-11 px-4 rounded-lg border text-sm"
            onClick={async () => {
              const { unlock } = await import("../data/crypto");
              const m = vault.meta!;
              const probe = await unlock(pinOld, m.pinSalt, m.pinIterations, m.pinVerifier);
              if (!probe) { setMsg("Aktuelle PIN falsch."); return; }
              await vault.changePin(pinNew);
              setPinOld(""); setPinNew("");
              setMsg("PIN geändert — alle Daten neu verschlüsselt.");
            }}>Ändern</button>
        </div>
        <p className="text-xs text-neutral-400">Ohne PIN sind die Daten unleserlich. Eine vergessene PIN bedeutet Datenverlust.</p>
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-2">
        <h2 className="font-medium">Speicher</h2>
        <p className="text-sm text-neutral-500">
          Auf iOS kann der Browser lokale Daten unter Speicherdruck löschen. „Persistenten
          Speicher" anfordern reduziert dieses Risiko; regelmäßige Backups bleiben Pflicht.
        </p>
        <button className="min-h-11 px-4 rounded-lg border text-sm"
          onClick={async () => {
            const ok = await requestPersistentStorage();
            setMsg(ok ? "Persistenter Speicher wurde gewährt." : "Persistenter Speicher wurde abgelehnt — regelmäßig Backups erstellen!");
          }}>
          Persistenten Speicher anfordern
        </button>
        <p className="text-xs text-neutral-400">Geräte-ID: {vault.meta?.deviceId}</p>
      </section>
    </div>
  );
}
