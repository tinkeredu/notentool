// CSV import: "Nachname;Vorname[;Bemerkung]", UTF-8, semicolon delimiter.
// Optional header row is detected. Returns parsed rows + per-line errors.

export type CsvStudent = { lastName: string; firstName: string; note: string };
export type CsvResult = { rows: CsvStudent[]; errors: { line: number; text: string }[] };

const HEADER = /^name|nachname|vorname|schüler/i;

export function parseCsv(text: string): CsvResult {
  const rows: CsvStudent[] = [];
  const errors: { line: number; text: string }[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    if (i === 0 && HEADER.test(raw)) continue;
    const parts = raw.split(";").map((p) => p.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      errors.push({ line: i + 1, text: raw });
      continue;
    }
    rows.push({ lastName: parts[0], firstName: parts[1], note: parts[2] ?? "" });
  }
  return { rows, errors };
}

// CSV export: semicolon, UTF-8 with BOM for Excel, quoted fields.
export function toCsv(header: string[], rows: string[][]): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [header.map(q).join(";"), ...rows.map((r) => r.map(q).join(";"))];
  return "﻿" + lines.join("\r\n");
}
