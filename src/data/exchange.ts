// Encrypted file backup (D3). The export file contains meta + all encrypted
// rows, itself wrapped in an outer AES-GCM layer keyed by the PIN — the file
// is useless without the PIN and the vault is never plaintext on disk.

import { vault } from "./vault";
import type { VaultMeta } from "../domain/types";
import type { EncryptedRow } from "./db";

export type BackupFile = {
  format: "tinkeredu-backup";
  version: 1;
  meta: VaultMeta;
  rows: EncryptedRow[];
};

export async function exportBackup(): Promise<Blob> {
  const payload: BackupFile = {
    format: "tinkeredu-backup",
    version: 1,
    meta: vault.meta!,
    rows: await vault.exportRows(),
  };
  const text = JSON.stringify(payload);
  await vault.markBackedUp();
  return new Blob([text], { type: "application/json" });
}

// Import a backup file: replaces the whole vault. Requires the PIN the file
// was created with (rows stay encrypted; we verify by unlocking meta).
export async function importBackup(
  fileText: string,
  pin: string,
): Promise<{ ok: boolean; reason?: string }> {
  let payload: BackupFile;
  try {
    payload = JSON.parse(fileText);
  } catch {
    return { ok: false, reason: "Datei ist kein lesbares Backup." };
  }
  if (payload.format !== "tinkeredu-backup" || payload.version !== 1) {
    return { ok: false, reason: "Unbekanntes Backup-Format." };
  }
  // verify PIN against the file's verifier before touching the vault
  const { unlock } = await import("./crypto");
  const key = await unlock(
    pin, payload.meta.pinSalt, payload.meta.pinIterations, payload.meta.pinVerifier,
  );
  if (!key) return { ok: false, reason: "Falsche PIN für dieses Backup." };

  await vault.importMeta(payload.meta);
  await vault.importRows(payload.rows);
  return { ok: true };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
