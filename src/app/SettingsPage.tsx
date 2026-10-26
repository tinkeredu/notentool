import { useRef, useState } from "react";
import { vault } from "../data/vault";
import { useVault } from "./useVault";
import { exportBackup, importBackup, downloadBlob, requestPersistentStorage } from "../data/exchange";
import {
  SyncSession, mergeRemoteRows, resolveConflict, describeRow, finishSync,
  takeSnapshot, listSnapshots, restoreSnapshot, type Conflict,
} from "../data/sync";
import type { SnapshotRow } from "../data/db";

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

      <SnapshotsSection />
      <SyncSection setMsg={setMsg} />
    </div>
  );
}

function SnapshotsSection() {
  useVault();
  const [snaps, setSnaps] = useState<SnapshotRow[]>([]);
  const refresh = async () => setSnaps(await listSnapshots());
  useState(() => { void refresh(); });
  return (
    <section className="bg-white border rounded-xl p-4 space-y-3">
      <h2 className="font-medium">Wiederherstellungspunkte</h2>
      <p className="text-sm text-neutral-500">Rotierende Snapshots (max. 10), verschlüsselt wie die Daten.</p>
      <button className="min-h-11 px-4 rounded-lg border text-sm"
        onClick={async () => { await takeSnapshot(); await refresh(); }}>
        Snapshot jetzt erstellen
      </button>
      <ul className="divide-y">
        {snaps.map((s) => (
          <li key={s.id} className="py-2 flex items-center gap-3 text-sm">
            <span>{new Date(s.createdAt).toLocaleString("de-DE")}</span>
            <span className="text-neutral-400">{s.rows.length} Datensätze</span>
            <button className="ml-auto text-xs text-red-600 px-2 py-1"
              onClick={async () => {
                if (!confirm("Auf diesen Snapshot zurücksetzen? Aktueller Stand wird überschrieben.")) return;
                await restoreSnapshot(s.id);
                window.location.reload();
              }}>Wiederherstellen</button>
          </li>
        ))}
        {snaps.length === 0 && <li className="py-2 text-sm text-neutral-400">Noch keine Snapshots.</li>}
      </ul>
    </section>
  );
}

function SyncSection({ setMsg }: { setMsg: (m: string) => void }) {
  const sessRef = useRef<SyncSession | null>(null);
  const [offer, setOffer] = useState("");
  const [answer, setAnswer] = useState("");
  const [remoteOffer, setRemoteOffer] = useState("");
  const [remoteAnswer, setRemoteAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [desc, setDesc] = useState<Record<string, string>>({});

  const newSession = () => {
    sessRef.current?.close();
    const s = new SyncSession();
    s.onOpen = () => setStatus("Verbunden — Daten werden ausgetauscht…");
    s.onRows = async (rows, remoteLast) => {
      const res = await mergeRemoteRows(rows, remoteLast);
      setConflicts(res.conflicts);
      await finishSync();
      setStatus(`Sync fertig: ${res.applied} Datensätze übernommen, ${res.conflicts.length} Konflikte.`);
      for (const c of res.conflicts) {
        setDesc((d) => ({ ...d, [`${c.id}-l`]: "", [`${c.id}-r`]: "" }));
        void describeRow(c.local).then((t) => setDesc((d) => ({ ...d, [`${c.id}-l`]: t })));
        void describeRow(c.remote).then((t) => setDesc((d) => ({ ...d, [`${c.id}-r`]: t })));
      }
      setMsg("Synchronisation abgeschlossen.");
    };
    sessRef.current = s;
    return s;
  };

  return (
    <section className="bg-white border rounded-xl p-4 space-y-3">
      <h2 className="font-medium">Sync im selben Netz (Gerät ↔ Gerät)</h2>
      <p className="text-sm text-neutral-500">
        Direktverbindung ohne Server: Gerät A erzeugt einen Code, Gerät B antwortet mit einem
        Code, Gerät A fügt die Antwort ein. Danach werden die Daten direkt ausgetauscht
        (Last-Write-Wins, Konflikte einzeln entscheidbar).
      </p>
      {status && <p className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-2">{status}</p>}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Als Gerät A (anbieten)</h3>
        <button className="min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm"
          onClick={async () => {
            const s = newSession();
            setOffer(await s.createOffer());
            setStatus("Angebots-Code erzeugt — auf Gerät B einfügen.");
          }}>
          Angebots-Code erzeugen
        </button>
        {offer && (
          <>
            <textarea readOnly className="w-full border rounded p-2 text-xs font-mono h-20"
              value={offer} onFocus={(e) => e.target.select()} />
            <p className="text-xs text-neutral-500">1. Diesen Code auf Gerät B einfügen → dort entsteht ein Antwort-Code.</p>
            <textarea className="w-full border rounded p-2 text-xs font-mono h-20"
              placeholder="2. Antwort-Code von Gerät B hier einfügen"
              value={remoteAnswer} onChange={(e) => setRemoteAnswer(e.target.value)} />
            <button className="min-h-11 px-4 rounded-lg border text-sm"
              onClick={async () => {
                try { await sessRef.current?.acceptAnswer(remoteAnswer); setStatus("Verbinde…"); }
                catch { setStatus("Antwort-Code ungültig."); }
              }}>Antwort annehmen</button>
          </>
        )}
      </div>

      <div className="space-y-2 border-t pt-3">
        <h3 className="text-sm font-medium">Als Gerät B (antworten)</h3>
        <textarea className="w-full border rounded p-2 text-xs font-mono h-20"
          placeholder="Angebots-Code von Gerät A hier einfügen"
          value={remoteOffer} onChange={(e) => setRemoteOffer(e.target.value)} />
        <button className="min-h-11 px-4 rounded-lg border text-sm"
          onClick={async () => {
            try {
              const s = newSession();
              setAnswer(await s.acceptOffer(remoteOffer));
              setStatus("Antwort-Code erzeugt — zurück auf Gerät A einfügen.");
            } catch { setStatus("Angebots-Code ungültig."); }
          }}>
          Antwort-Code erzeugen
        </button>
        {answer && (
          <textarea readOnly className="w-full border rounded p-2 text-xs font-mono h-20"
            value={answer} onFocus={(e) => e.target.select()} />
        )}
      </div>

      {conflicts.length > 0 && (
        <div className="border-t pt-3 space-y-2">
          <h3 className="text-sm font-medium text-red-600">{conflicts.length} Konflikte — beidseitig geändert</h3>
          {conflicts.map((c) => (
            <div key={c.id} className="border rounded-lg p-2 text-xs space-y-1">
              <p className="text-neutral-500">Tabelle {c.table} · {c.id.slice(0, 8)}…</p>
              <div className="flex flex-col gap-1">
                <button className="text-left border rounded p-2 bg-white"
                  onClick={async () => { await resolveConflict(c, "local"); setConflicts((x) => x.filter((y) => y.id !== c.id)); }}>
                  <strong>Dieses Gerät</strong> ({new Date(c.local.updatedAt).toLocaleString("de-DE")})<br />
                  <code className="break-all">{desc[`${c.id}-l`] ?? "…"}</code>
                </button>
                <button className="text-left border rounded p-2 bg-white"
                  onClick={async () => { await resolveConflict(c, "remote"); setConflicts((x) => x.filter((y) => y.id !== c.id)); }}>
                  <strong>Anderes Gerät</strong> ({new Date(c.remote.updatedAt).toLocaleString("de-DE")})<br />
                  <code className="break-all">{desc[`${c.id}-r`] ?? "…"}</code>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
