// The vault: in-memory plaintext model + write-through AES-GCM encryption
// into IndexedDB, one encrypted row per entity. All writes stamp
// updatedAt/updatedBy (sync-ready change tracking, for V5 merge).

import { db, loadMeta, saveMeta, type EncryptedRow } from "./db";
import { createPinKeys, unlock, encryptJson, decryptJson } from "./crypto";
import type {
  Course, Student, TreeNode, GradeEntry, Scale, Checklist, Incident, SeatPlan,
  StudentNote, TableName, VaultMeta,
} from "../domain/types";

type Listener = () => void;

const TABLE_TAG: Record<string, TableName> = {
  course: "courses", student: "students", node: "nodes", entry: "entries", scale: "scales",
};

export class Vault {
  meta: VaultMeta | null = null;
  private key: CryptoKey | null = null;
  courses = new Map<string, Course>();
  students = new Map<string, Student>();
  nodes = new Map<string, TreeNode>();
  entries = new Map<string, GradeEntry>();
  scales = new Map<string, Scale>();
  checklists = new Map<string, Checklist>();
  incidents = new Map<string, Incident>();
  seatplans = new Map<string, SeatPlan>();
  notes = new Map<string, StudentNote>();
  private listeners = new Set<Listener>();

  // ---------- lifecycle ----------

  get isSetUp(): boolean { return this.meta !== null; }
  get isUnlocked(): boolean { return this.key !== null; }

  async init(): Promise<void> {
    this.meta = await loadMeta();
    if (this.meta && this.meta.pinIterations === 0) {
      // first run, no meta yet — handled by setup
    }
  }

  async setup(pin: string): Promise<void> {
    const kp = await createPinKeys(pin);
    this.key = kp.key;
    this.meta = {
      deviceId: crypto.randomUUID(),
      pinSalt: kp.salt,
      pinIterations: kp.iterations,
      pinVerifier: kp.verifier,
      lastBackupAt: null,
      backupReminderDays: 7,
    };
    await saveMeta(this.meta);
    this.emit();
  }

  async unlock(pin: string): Promise<boolean> {
    if (!this.meta) return false;
    const key = await unlock(
      pin, this.meta.pinSalt, this.meta.pinIterations, this.meta.pinVerifier,
    );
    if (!key) return false;
    this.key = key;
    await this.loadAll();
    this.emit();
    return true;
  }

  lock(): void {
    this.key = null;
    this.courses.clear(); this.students.clear(); this.nodes.clear();
    this.entries.clear(); this.scales.clear(); this.checklists.clear();
    this.incidents.clear(); this.seatplans.clear(); this.notes.clear();
    for (const t of ALL_TABLES) this.touch(t);
    this.emit();
  }

  async changePin(newPin: string): Promise<void> {
    const kp = await createPinKeys(newPin);
    const oldKey = this.key;
    this.key = kp.key;
    this.meta!.pinSalt = kp.salt;
    this.meta!.pinVerifier = kp.verifier;
    this.meta!.pinIterations = kp.iterations;
    await saveMeta(this.meta!);
    // re-encrypt every row under the new key
    const rows = await db.rows.toArray();
    for (const row of rows) {
      const plain = await decryptJson(oldKey!, row.blob);
      row.blob = await encryptJson(this.key, plain);
      await db.rows.put(row);
    }
  }

  // ---------- loading ----------

  private async loadAll(): Promise<void> {
    const rows = await db.rows.toArray();
    for (const row of rows) {
      const entity = await decryptJson<any>(this.key!, row.blob);
      this.mapFor(row.table).set(row.id, entity);
    }
    await this.dedupeEntries();
    for (const t of ALL_TABLES) this.touch(t);
  }

  // Pre-fix builds could persist two entries for the same (student, node).
  // Keep the newest per pair and delete the rest — also in IndexedDB.
  private async dedupeEntries(): Promise<void> {
    const seen = new Map<string, string>(); // pair -> winning entry id
    const drop: string[] = [];
    for (const e of this.entries.values()) {
      const pair = `${e.studentId}:${e.nodeId}`;
      const winner = seen.get(pair);
      if (!winner) { seen.set(pair, e.id); continue; }
      const w = this.entries.get(winner)!;
      if (e.updatedAt >= w.updatedAt) { drop.push(w.id); seen.set(pair, e.id); }
      else drop.push(e.id);
    }
    for (const id of drop) {
      this.entries.delete(id);
      await db.rows.delete(id);
    }
  }

  private mapFor(table: TableName): Map<string, any> {
    switch (table) {
      case "courses": return this.courses;
      case "students": return this.students;
      case "nodes": return this.nodes;
      case "entries": return this.entries;
      case "scales": return this.scales;
      case "checklists": return this.checklists;
      case "incidents": return this.incidents;
      case "seatplans": return this.seatplans;
      case "notes": return this.notes;
    }
  }

  // Reassign a table's Map so React useMemo deps on vault.<table> re-run.
  private touch(table: TableName): void {
    this[table] = new Map(this[table]) as never;
  }

  // ---------- writes ----------

  async put<T extends { id: string; updatedAt: number; updatedBy: string }>(
    table: TableName, entity: T,
  ): Promise<T> {
    if (!this.key || !this.meta) throw new Error("vault locked");
    const stamped = {
      ...entity, updatedAt: Date.now(), updatedBy: this.meta.deviceId,
    };
    const blob = await encryptJson(this.key, stamped);
    await db.rows.put({
      id: stamped.id, table, updatedAt: stamped.updatedAt,
      updatedBy: stamped.updatedBy, blob,
    });
    this.mapFor(table).set(stamped.id, stamped);
    this.touch(table);
    this.emit();
    return stamped;
  }

  async putEntity<T extends { id: string; updatedAt: number; updatedBy: string }>(
    prefix: keyof typeof TABLE_TAG, entity: T,
  ): Promise<T> {
    return this.put(TABLE_TAG[prefix as string] ?? (prefix as TableName), entity);
  }

  async remove(table: TableName, id: string): Promise<void> {
    await db.rows.delete(id);
    this.mapFor(table).delete(id);
    this.touch(table);
    this.emit();
  }

  async markBackedUp(): Promise<void> {
    if (!this.meta) return;
    this.meta.lastBackupAt = Date.now();
    await saveMeta(this.meta);
    this.emit();
  }

  backupOverdue(): boolean {
    if (!this.meta) return false;
    const days = this.meta.backupReminderDays;
    if (!this.meta.lastBackupAt) return true;
    return Date.now() - this.meta.lastBackupAt > days * 86400_000;
  }

  // Eine Row entschlüsseln (Konflikt-Anzeige im Sync).
  async decryptRow(row: { blob: string }): Promise<unknown | null> {
    if (!this.key) return null;
    try { return await decryptJson(this.key, row.blob); } catch { return null; }
  }

  // ---------- change feed ----------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  // ---------- export / import ----------

  async exportRows(): Promise<EncryptedRow[]> {
    return db.rows.toArray();
  }

  async importRows(rows: EncryptedRow[]): Promise<void> {
    await db.rows.bulkPut(rows);
    this.courses.clear(); this.students.clear(); this.nodes.clear();
    this.entries.clear(); this.scales.clear(); this.checklists.clear();
    this.incidents.clear(); this.seatplans.clear(); this.notes.clear();
    await this.loadAll();
    this.emit();
  }

  async importMeta(meta: VaultMeta): Promise<void> {
    this.meta = meta;
    await saveMeta(meta);
  }
}

export const ALL_TABLES: TableName[] = [
  "courses", "students", "nodes", "entries", "scales",
  "checklists", "incidents", "seatplans", "notes",
];

export const vault = new Vault();
