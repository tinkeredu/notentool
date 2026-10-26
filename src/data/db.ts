import Dexie, { type Table } from "dexie";
import type { TableName, VaultMeta } from "../domain/types";

// One encrypted row per entity. indexable fields stay plaintext
// (id, table, updatedAt) — no personal data is queryable without the PIN.
export type EncryptedRow = {
  id: string;
  table: TableName;
  updatedAt: number;
  updatedBy: string;
  blob: string; // AES-GCM packed base64
};

export type SnapshotRow = {
  id: string;
  createdAt: number;
  meta: VaultMeta;
  rows: EncryptedRow[]; // already encrypted — restoring copies them back verbatim
};

class TinkerDB extends Dexie {
  rows!: Table<EncryptedRow, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  snapshots!: Table<SnapshotRow, string>;

  constructor() {
    super("tinkeredu");
    this.version(1).stores({
      rows: "id, table, updatedAt",
      meta: "key",
    });
    this.version(2).stores({
      rows: "id, table, updatedAt",
      meta: "key",
      snapshots: "id, createdAt",
    });
  }
}

export const db = new TinkerDB();

export async function loadMeta(): Promise<VaultMeta | null> {
  const row = await db.meta.get("meta");
  return (row?.value as VaultMeta) ?? null;
}

export async function saveMeta(meta: VaultMeta): Promise<void> {
  await db.meta.put({ key: "meta", value: meta });
}
