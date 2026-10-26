// V5: Wiederherstellungspunkte (rotierende Snapshots) und
// Gerät↔Gerät-Sync im selben Netz per WebRTC DataChannel mit manuellem
// Code-Handshake (D5: kein Zusatzgerät, keine Cloud).
//
// Merge-Regel (Spec): Last-Write-Wins pro Datensatz nach updatedAt.
// Konflikt = derselbe Datensatz wurde auf beiden Geräten seit dem letzten
// Sync geändert → manuelle Auswahl beider Werte.

import { db, saveMeta, type EncryptedRow, type SnapshotRow } from "./db";
import { vault } from "./vault";
import type { TableName } from "../domain/types";

const MAX_SNAPSHOTS = 10;

// ---------- Snapshots ----------

export async function takeSnapshot(): Promise<void> {
  const snap: SnapshotRow = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    meta: vault.meta!,
    rows: await db.rows.toArray(),
  };
  await db.snapshots.put(snap);
  const all = await db.snapshots.orderBy("createdAt").toArray();
  for (const old of all.slice(0, Math.max(0, all.length - MAX_SNAPSHOTS))) {
    await db.snapshots.delete(old.id);
  }
}

export async function listSnapshots(): Promise<SnapshotRow[]> {
  return (await db.snapshots.orderBy("createdAt").toArray()).reverse();
}

export async function restoreSnapshot(id: string): Promise<void> {
  const snap = await db.snapshots.get(id);
  if (!snap) throw new Error("Snapshot nicht gefunden");
  await db.rows.clear();
  await db.rows.bulkPut(snap.rows);
  await vault.importMeta(snap.meta);
  await vault.importRows(snap.rows);
}

// ---------- WebRTC-Sync (manuelles Signaling) ----------

type SyncPayload = { kind: "rows"; rows: EncryptedRow[]; lastSyncAt: number | null };

export type MergeResult = {
  applied: number; // remote rows übernommen
  conflicts: Conflict[];
};

export type Conflict = {
  id: string;
  table: TableName;
  local: EncryptedRow;
  remote: EncryptedRow;
};

async function waitIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((res) => {
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        res();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
  });
}

const enc = (o: unknown) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const dec = <T>(s: string): T => JSON.parse(decodeURIComponent(escape(atob(s.trim()))));

export class SyncSession {
  private pc = new RTCPeerConnection();
  private dc: RTCDataChannel | null = null;
  onRows: ((rows: EncryptedRow[], remoteLastSyncAt: number | null) => void) | null = null;
  onOpen: (() => void) | null = null;

  private wire(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => {
      this.sendRows();
      this.onOpen?.();
    };
    dc.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data) as SyncPayload;
      if (msg.kind === "rows") this.onRows?.(msg.rows, msg.lastSyncAt);
    };
  }

  // Gerät A: Angebot erzeugen → Code anzeigen
  async createOffer(): Promise<string> {
    this.wire(this.pc.createDataChannel("sync"));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await waitIce(this.pc);
    return enc(this.pc.localDescription);
  }

  // Gerät B: Angebot einfügen → Antwort-Code erzeugen
  async acceptOffer(offerCode: string): Promise<string> {
    this.pc.ondatachannel = (ev) => this.wire(ev.channel);
    await this.pc.setRemoteDescription(dec(offerCode));
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await waitIce(this.pc);
    return enc(this.pc.localDescription);
  }

  // Gerät A: Antwort-Code einfügen → Verbindung steht
  async acceptAnswer(answerCode: string): Promise<void> {
    await this.pc.setRemoteDescription(dec(answerCode));
  }

  private async sendRows() {
    const payload: SyncPayload = {
      kind: "rows",
      rows: await db.rows.toArray(),
      lastSyncAt: vault.meta?.lastSyncAt ?? null,
    };
    this.dc?.send(JSON.stringify(payload));
  }

  close() { try { this.pc.close(); } catch { /* noop */ } }
}

// Merge empfangener Rows: LWW + Konflikte seit lastSyncAt.
export async function mergeRemoteRows(
  remoteRows: EncryptedRow[],
  remoteLastSyncAt: number | null,
): Promise<MergeResult> {
  const lastSync = Math.max(
    vault.meta?.lastSyncAt ?? 0, remoteLastSyncAt ?? 0,
  );
  const conflicts: Conflict[] = [];
  let applied = 0;
  const localById = new Map((await db.rows.toArray()).map((r) => [r.id, r]));

  for (const remote of remoteRows) {
    const local = localById.get(remote.id);
    if (!local) {
      await db.rows.put(remote);
      applied++;
      continue;
    }
    if (remote.updatedAt === local.updatedAt) continue;
    const bothChanged = local.updatedAt > lastSync && remote.updatedAt > lastSync;
    if (bothChanged) {
      conflicts.push({ id: remote.id, table: remote.table, local, remote });
    } else if (remote.updatedAt > local.updatedAt) {
      await db.rows.put(remote);
      applied++;
    }
  }
  // lokale Rows dem Gegenüber fehlen → vom eigenen sendRows bedient (beidseitig)
  return { applied, conflicts };
}

export async function resolveConflict(c: Conflict, keep: "local" | "remote"): Promise<void> {
  if (keep === "remote") await db.rows.put(c.remote);
}

// Konflikt-Anzeige: Row entschlüsseln (gelingt nur bei gleichem PIN-Schlüssel).
export async function describeRow(row: EncryptedRow): Promise<string> {
  const plain = await vault.decryptRow(row);
  return plain === null ? "(nicht lesbar — abweichende PIN?)" : JSON.stringify(plain).slice(0, 200);
}

export async function finishSync(): Promise<void> {
  if (!vault.meta) return;
  vault.meta.lastSyncAt = Date.now();
  await saveMeta(vault.meta);
  await vault.importRows(await db.rows.toArray());
}
